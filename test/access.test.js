// Who may do what: paired screens (view / family), people (editor / admin) with password +
// authenticator code, invites, the admin console sign-in, and deploy/reset-admin.sh.
// (Passkeys are tested in a real browser with a virtual authenticator - see docs/development.)
const test = require('node:test');
const assert = require('node:assert');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { makeAdmin, client, totpNow, cookiesOf } = require('./helpers');

const PORT = 3996, DAV = 5997;
const base = `http://127.0.0.1:${PORT}`;
const SERVER = path.join(__dirname, '..', 'server', 'chalkboard.js');
const H = { 'Content-Type': 'application/json', 'X-Chalk': '1' };
const raw = (p, body, cookie) => fetch(base + p, { method: 'POST', headers: { ...H, ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body || {}) });
const pick = (cookie, name) => cookie.split('; ').filter(c => c.startsWith(name + '=')).join('; ');
let server, dav, data, adm, admin;

async function startPairing() {
  const r = await fetch(base + '/api/pair/start', { method: 'POST', headers: { 'X-Chalk': '1', 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) Chrome/120 Safari/537.36' } });
  assert.equal(r.status, 200);
  const pairCookie = (r.headers.get('set-cookie') || '').split(';')[0], { code } = await r.json();
  const poll = async () => {
    const s = await fetch(base + '/api/pair/status', { headers: { cookie: pairCookie } });
    const j = await s.json(), rawCk = s.headers.getSetCookie().join('\n');
    return { state: j.state, role: j.role, raw: rawCk, cookie: j.state === 'paired' ? s.headers.getSetCookie()[0].split(';')[0] : null };
  };
  return { code, poll };
}
async function screen(role, name = role) {
  const p = await startPairing();
  assert.equal((await admin.post('/api/devices/approve', { code: p.code, name, role })).status, 200);
  return client(base, (await p.poll()).cookie);
}
// invite someone and let them finish joining; returns their cookie + secret
async function invitePerson(username, role, password = 'another long password') {
  const inv = await (await admin.post('/api/users/invite', { username, name: username, role })).json();
  const code = inv.link.split('#')[1];
  const chk = await (await raw('/api/account/join', { invite: code, check: true })).json();
  assert.equal(chk.username, username);
  const j = await (await raw('/api/account/join', { invite: code, password })).json();
  const e = await raw('/api/account/enroll', { enroll: j.enroll, code: totpNow(j.secret) });
  assert.equal(e.status, 200);
  return { cookie: cookiesOf(e), secret: j.secret.replace(/\s/g, ''), password, link: inv.link };
}

test.before(async () => {
  dav = await require('./mock-caldav').start(DAV);
  data = fs.mkdtempSync(path.join(os.tmpdir(), 'fcp-acc-'));
  server = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: String(PORT), BIND: '127.0.0.1', DATA_DIR: data, TIMEZONE: 'America/New_York', HOLIDAYS: 'none',
      CALDAV_URL: `http://127.0.0.1:${DAV}/`, CALDAV_USER: 'u', CALDAV_PASSWORD: 'p', CALDAV_CALENDAR: 'Family', BOARD_TITLE: 'Test Board' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(base + '/api/whoami')).ok) break; } catch {} await new Promise(r => setTimeout(r, 200)); }
});
test.after(() => { server && server.kill(); dav && dav.close(); fs.rmSync(data, { recursive: true, force: true }); });

test('a fresh board: nothing readable, pages and health check still load', async () => {
  const w = await (await fetch(base + '/api/whoami')).json();
  assert.deepEqual([w.device, w.user, w.setup, w.firstRun, w.passkeys], [null, null, true, true, false]);
  assert.equal((await fetch(base + '/api/month?ym=2026-10')).status, 401);
  assert.equal((await fetch(base + '/api/stream')).status, 401);
  assert.equal((await fetch(base + '/api/photos/img/abc')).status, 401);
  assert.equal((await raw('/api/meals', { items: [] })).status, 401);
  for (const p of ['/', '/edit', '/admin', '/join', '/api/today']) assert.equal((await fetch(base + p)).status, 200, p);
});

test('first admin: setup code + password + authenticator code; the code works once', async () => {
  const code = fs.readFileSync(path.join(data, 'setup-code.txt'), 'utf8').trim();
  assert.equal(fs.statSync(path.join(data, 'setup-code.txt')).mode & 0o777, 0o600);
  assert.equal((await raw('/api/account/setup', { code: 'AAAA-AAAA', username: 'dad', password: 'long enough pass' })).status, 401);
  assert.equal((await raw('/api/account/setup', { code, username: 'dad', password: 'short' })).status, 400);
  const s1 = await (await raw('/api/account/setup', { code, username: 'Dad', name: 'Dad', password: 'long enough pass' })).json();
  assert.match(s1.qr, /^<svg/);
  assert.match(s1.uri, /^otpauth:\/\/totp\/Test%20Board%3Adad\?secret=/);
  assert.equal((await raw('/api/account/enroll', { enroll: s1.enroll, code: '000000' })).status, 401);
  const s2 = await raw('/api/account/enroll', { enroll: s1.enroll, code: totpNow(s1.secret) });
  assert.equal(s2.status, 200);
  const sc = s2.headers.getSetCookie();
  assert.ok(sc.some(c => /^fcp_user=.{40,}; Path=\/; Max-Age=34560000; HttpOnly; SameSite=Lax/.test(c)), 'board sign-in cookie, renewed while used');
  assert.ok(sc.some(c => /^fcp_admin=.{40,}; Path=\/; Max-Age=43200; HttpOnly; SameSite=Strict/.test(c)), 'admin console, 12 hours max');
  adm = { cookie: cookiesOf(s2), secret: s1.secret.replace(/\s/g, ''), password: 'long enough pass' };
  admin = client(base, adm.cookie);
  const w = await (await admin.api('/api/whoami')).json();
  assert.deepEqual([w.user.username, w.user.role, w.admin, w.editor, w.setup, w.firstRun], ['dad', 'admin', true, true, false, false]);
  assert.ok(!fs.existsSync(path.join(data, 'setup-code.txt')));
  assert.equal((await raw('/api/account/setup', { code, username: 'x2', password: 'long enough pass' })).status, 400);
});

// what the server does to read an authenticator secret: unlock it with the person's password
function unlock(password, v) {
  const crypto = require('node:crypto'), b = Buffer.from(v.slice(4), 'base64');
  const key = crypto.scryptSync('totp-key:' + password, b.subarray(0, 16), 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const d = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(16, 28)); d.setAuthTag(b.subarray(28, 44));
  return Buffer.concat([d.update(b.subarray(44)), d.final()]).toString('utf8');
}
const totpRow = name => { const db = new DatabaseSync(path.join(data, 'chalkboard.db')); const r = db.prepare('SELECT pw_hash, totp_secret FROM users WHERE username = ?').get(name); db.close(); return r; };

test('stored safely: authenticator secrets locked with the person’s own password (no key file), files private', async () => {
  const u = totpRow('dad');
  assert.match(u.pw_hash, /^scrypt\$32768\$/);
  assert.match(u.totp_secret, /^pw1:/);
  assert.ok(!u.totp_secret.includes(adm.secret));
  assert.equal(unlock(adm.password, u.totp_secret), adm.secret);
  assert.throws(() => unlock('not the password', u.totp_secret));
  assert.ok(!fs.existsSync(path.join(data, 'secret.key')), 'nothing extra to keep');
  assert.equal(fs.statSync(path.join(data, 'chalkboard.db')).mode & 0o777, 0o600);
});

test('screens: a code on the new screen, an admin types it, view or family only', async () => {
  const p = await startPairing();
  assert.match(p.code, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  assert.equal((await p.poll()).state, 'waiting');
  const list = await (await admin.api('/api/devices')).json();
  assert.equal(list.waiting[0].agent, 'Chrome on Android');
  assert.ok(!JSON.stringify(list).includes(p.code.replace('-', '')), 'codes are never listed');
  assert.equal((await admin.post('/api/devices/approve', { code: p.code, role: 'admin' })).status, 400, 'screens can’t be admins');
  assert.equal((await admin.post('/api/devices/approve', { code: 'WXYZ-WXYZ', role: 'view' })).status, 404);
  assert.equal((await admin.post('/api/devices/approve', { code: p.code.toLowerCase(), name: 'Wall', role: 'view' })).status, 200);
  const s = await p.poll();
  assert.equal(s.state, 'paired');
  assert.match(s.raw, /fcp_device=[\w-]{40,}; Path=\/; Max-Age=34560000; HttpOnly; SameSite=Lax/);
  assert.equal((await p.poll()).state, 'expired', 'the key is handed over only once');
});

test('what each can do: view reads, family edits events/meals/jars, editors decorate, admins configure', async () => {
  const view = await screen('view'), fam = await screen('family');
  const wife = await invitePerson('tarin', 'editor');
  const ed = client(base, wife.cookie);
  assert.equal((await view.api('/api/month?ym=2026-10')).status, 200);
  assert.equal((await view.post('/api/meals', { items: [{ t: 'Soup' }] })).status, 403);
  assert.equal((await fam.post('/api/meals', { items: [{ t: 'Soup' }] })).status, 200);
  assert.equal((await fam.post('/api/events', { title: 'Fam', date: '2026-10-22', allDay: true })).status, 200);
  assert.equal((await fam.post('/api/jars', { jars: [] })).status, 200);
  const art = { ym: '2026-10', stroke: { p: [1, 2, 3, 4] } };
  assert.equal((await fam.post('/api/art', art)).status, 403);
  assert.equal((await fam.post('/api/theme', { p: 'classic' })).status, 403);
  assert.equal((await ed.post('/api/art', art)).status, 200);
  assert.equal((await ed.post('/api/theme', { p: 'classic' })).status, 200);
  assert.equal((await ed.post('/api/events', { title: 'Ed', date: '2026-10-23', allDay: true })).status, 200);
  for (const [p, b] of [['/api/trash', { day: 1 }], ['/api/notes', { bottom: 'jars' }], ['/api/devices/approve', { code: 'X', role: 'view' }], ['/api/users/invite', { username: 'zz' }], ['/api/google/start', {}]]) {
    assert.equal((await ed.post(p, b)).status, 403, 'editor must not ' + p);
    assert.equal((await fam.post(p, b)).status, 403, 'family must not ' + p);
  }
  assert.equal((await ed.api('/api/devices')).status, 403);
  assert.equal((await admin.post('/api/trash', { day: 2 })).status, 200);
});

test('changes need the X-Chalk header (no cross-site form posts)', async () => {
  const r = await fetch(base + '/api/meals', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: adm.cookie }, body: '{"items":[]}' });
  assert.equal(r.status, 403);
});

test('the admin console needs its own sign-in; the board sign-in alone isn’t enough', async () => {
  const boardOnly = client(base, pick(adm.cookie, 'fcp_user'));
  assert.equal((await boardOnly.post('/api/art', { ym: '2026-10', stroke: { p: [1, 2, 3, 4] } })).status, 200);
  const r = await boardOnly.api('/api/devices');
  assert.equal(r.status, 401);
  assert.equal((await r.json()).admin, true);
  assert.equal((await (await boardOnly.api('/api/whoami')).json()).admin, false);
  // idle for more than 30 minutes -> asks again
  const db = new DatabaseSync(path.join(data, 'chalkboard.db'));
  db.prepare("UPDATE user_sessions SET last_seen = ? WHERE kind = 'admin'").run(Date.now() - 31 * 60e3);
  db.close();
  assert.equal((await admin.api('/api/devices')).status, 401);
  const again = await raw('/api/account/login', { username: 'dad', password: adm.password, code: totpNow(adm.secret, 1), kind: 'admin' });
  assert.equal(again.status, 200);
  admin = client(base, pick(adm.cookie, 'fcp_user') + '; ' + pick(cookiesOf(again), 'fcp_admin'));
  assert.equal((await admin.api('/api/devices')).status, 200);
});

test('sign-in: password + code; codes can’t be reused; wrong tries lock out', async () => {
  const p = await invitePerson('nora', 'editor', 'nora password 1');
  const good = await raw('/api/account/login', { username: 'nora', password: 'nora password 1', code: totpNow(p.secret, 1) });
  assert.equal(good.status, 200);
  assert.match(good.headers.getSetCookie()[0], /^fcp_user=/);
  assert.equal((await raw('/api/account/login', { username: 'nora', password: 'nora password 1', code: totpNow(p.secret, 1) })).status, 401, 'same code twice');
  assert.equal((await raw('/api/account/login', { username: 'nora', password: 'nora password 1', code: totpNow(p.secret, 1), kind: 'admin' })).status, 401);
  for (let i = 0; i < 8; i++) assert.equal((await raw('/api/account/login', { username: 'ghost', password: 'nope nope nope', code: '123456' })).status, 401);
  assert.equal((await raw('/api/account/login', { username: 'ghost', password: 'nope nope nope', code: '123456' })).status, 429);
});

test('people: invite links work once; roles; sign out everywhere; start over; last admin stays', async () => {
  const theo = await invitePerson('theo', 'editor');
  const t = client(base, theo.cookie);
  assert.equal((await raw('/api/account/join', { invite: theo.link.split('#')[1], check: true })).status, 404, 'used invite');
  const list = (await (await admin.api('/api/users')).json()).users;
  const id = list.find(u => u.username === 'theo').id, me = list.find(u => u.username === 'dad').id;
  assert.equal((await admin.post('/api/users/signout', { id })).status, 200);
  assert.equal((await t.post('/api/art', { ym: '2026-10', stroke: { p: [1, 2, 3, 4] } })).status, 401, 'signed out at once');
  const re = await (await admin.post('/api/users/reinvite', { id })).json();
  assert.match(re.link, /\/join#[\w-]{20,}$/);
  assert.equal((await admin.post('/api/users/update', { id, role: 'admin' })).status, 200);
  assert.equal((await admin.post('/api/users/update', { id: me, role: 'editor' })).status, 400, 'the only (set-up) admin stays admin');
  assert.equal((await admin.post('/api/users/remove', { id: me })).status, 400);
  assert.equal((await admin.post('/api/users/remove', { id })).status, 200);
  assert.equal((await admin.post('/api/users/invite', { username: 'tarin' })).status, 400, 'taken');
});

test('my account: change password (needs the current one)', async () => {
  assert.equal((await admin.post('/api/account/password', { current: 'wrong wrong', next: 'a brand new password' })).status, 401);
  assert.equal((await admin.post('/api/account/password', { current: adm.password, next: 'a brand new password' })).status, 200);
  adm.password = 'a brand new password';
  assert.equal(unlock(adm.password, totpRow('dad').totp_secret), adm.secret, 'the authenticator keeps working after a password change');
  const me = await (await admin.api('/api/account/me')).json();
  assert.deepEqual([me.username, me.role, me.passkeys, me.passkeysHere], ['dad', 'admin', [], false]);
  assert.equal((await admin.post('/api/passkey/register/options', {})).status, 400, 'no PUBLIC_URL: no passkeys');
});

test('removing a screen locks it out at once', async () => {
  const s = await screen('view', 'Temp');
  const list = (await (await admin.api('/api/devices')).json()).devices;
  const id = list.find(d => d.name === 'Temp').id;
  assert.equal((await s.api('/api/month?ym=2026-10')).status, 200);
  assert.equal((await admin.post('/api/devices/remove', { id })).status, 200);
  assert.equal((await s.api('/api/month?ym=2026-10')).status, 401);
});

test('each sign-in is listed and can be ended on its own; my own sign-ins are marked', async () => {
  const p = await invitePerson('grandma', 'editor');
  const g = client(base, p.cookie);
  const users = (await (await admin.api('/api/users')).json()).users, gid = users.find(u => u.username === 'grandma').id;
  const det = await (await admin.api('/api/users/' + gid)).json();
  assert.equal(det.sessions.length, 1);
  assert.equal(det.sessions[0].kind, 'edit');
  assert.ok(det.sessions[0].agent && det.sessions[0].ip !== undefined && det.sessions[0].expires > Date.now());
  assert.equal((await g.post('/api/art', { ym: '2026-10', stroke: { p: [1, 2, 3, 4] } })).status, 200);
  assert.equal((await admin.post('/api/users/sessions/remove', { id: det.sessions[0].id })).status, 200);
  assert.equal((await g.post('/api/art', { ym: '2026-10', stroke: { p: [1, 2, 3, 4] } })).status, 401, 'that sign-in ended');
  const mine = (await (await admin.api('/api/account/sessions')).json()).sessions;
  assert.ok(mine.some(s => s.here && s.kind === 'admin'));
  assert.ok(!JSON.stringify(mine).includes('key_hash') || mine.every(s => !('key_hash' in s)), 'no key hashes leave the server');
});

test('screens stay paired for good; tablets sign in again every 60 days', async () => {
  const sc = await screen('view', 'Forever wall');
  const p = await invitePerson('aunt', 'editor');
  const aunt = client(base, p.cookie);
  const db = new DatabaseSync(path.join(data, 'chalkboard.db'));
  const users = (await (await admin.api('/api/users')).json()).users, aid = users.find(u => u.username === 'aunt').id;
  // a screen paired 3 years ago and in use every day keeps working
  db.prepare("UPDATE devices SET created = ? WHERE name = 'Forever wall'").run(Date.now() - 3 * 365 * 86400e3);
  assert.equal((await sc.api('/api/month?ym=2026-10')).status, 200);
  // a quiet screen is flagged but stays paired (no automatic removal unless an admin sets one)
  db.prepare("UPDATE devices SET last_seen = ? WHERE name = 'Forever wall'").run(Date.now() - 400 * 86400e3);
  assert.equal((await sc.api('/api/month?ym=2026-10')).status, 200);
  // a tablet signed in 59 days ago: still fine; 61 days ago: asks again, however much it's used
  db.prepare('UPDATE user_sessions SET created = ?, last_seen = ? WHERE user_id = ?').run(Date.now() - 59 * 86400e3, Date.now() - 3600e3, aid);
  assert.equal((await aunt.post('/api/art', { ym: '2026-10', stroke: { p: [1, 2, 3, 4] } })).status, 200);
  db.prepare('UPDATE user_sessions SET created = ? WHERE user_id = ?').run(Date.now() - 61 * 86400e3, aid);
  assert.equal((await aunt.post('/api/art', { ym: '2026-10', stroke: { p: [1, 2, 3, 4] } })).status, 401);
  db.close();
});

test('cookies of screens and sign-ins in use are renewed (once a day)', async () => {
  const p = await startPairing();
  await admin.post('/api/devices/approve', { code: p.code, name: 'Renew me', role: 'view' });
  const c = (await p.poll()).cookie;
  const first = await fetch(base + '/api/month?ym=2026-10', { headers: { cookie: c } });
  assert.match(first.headers.getSetCookie().join('\n'), /fcp_device=[\w-]+; Path=\/; Max-Age=34560000/);
  const second = await fetch(base + '/api/month?ym=2026-10', { headers: { cookie: c } });
  assert.ok(!/fcp_device=/.test(second.headers.getSetCookie().join('\n')), 'not again the same day');
});

test('audit: browser protections and no caching of account data', async () => {
  const adminPage = await fetch(base + '/admin');
  assert.equal(adminPage.headers.get('x-frame-options'), 'DENY');
  assert.match(adminPage.headers.get('content-security-policy'), /frame-ancestors 'none'.*|default-src 'self'/);
  assert.match(adminPage.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(adminPage.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(adminPage.headers.get('referrer-policy'), 'no-referrer');
  assert.match((await fetch(base + '/edit')).headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal((await admin.api('/api/users')).headers.get('cache-control'), 'no-store');
});

test('audit: changing your password signs you out everywhere else', async () => {
  const p = await invitePerson('uncle', 'editor', 'uncle password one');
  const other = await raw('/api/account/login', { username: 'uncle', password: 'uncle password one', code: totpNow(p.secret, 1) });
  assert.equal(other.status, 200);
  const elsewhere = client(base, cookiesOf(other)), here = client(base, p.cookie);
  assert.equal((await here.post('/api/account/password', { current: 'uncle password one', next: 'uncle password two' })).status, 200);
  assert.equal((await here.post('/api/art', { ym: '2026-10', stroke: { p: [1, 2, 3, 4] } })).status, 200, 'still signed in here');
  assert.equal((await elsewhere.post('/api/art', { ym: '2026-10', stroke: { p: [1, 2, 3, 4] } })).status, 401, 'signed out elsewhere');
});

test('audit: adding or removing a passkey needs a sign-in from the last 10 minutes', async () => {
  const p = await invitePerson('cousin', 'editor');
  const c = client(base, p.cookie);
  const users = (await (await admin.api('/api/users')).json()).users, id = users.find(u => u.username === 'cousin').id;
  const db = new DatabaseSync(path.join(data, 'chalkboard.db'));
  db.prepare('INSERT INTO passkeys (id, user_id, public_key, counter, transports, name, created) VALUES (?, ?, ?, 0, ?, ?, ?)').run('cousin-pk', id, 'AA==', '[]', 'Old phone', Date.now());
  assert.equal((await c.post('/api/account/passkeys/remove', { id: 'nope' })).status, 200, 'fresh sign-in: allowed');
  db.prepare('UPDATE user_sessions SET created = ? WHERE user_id = ?').run(Date.now() - 11 * 60e3, id);
  db.close();
  const r = await c.post('/api/account/passkeys/remove', { id: 'cousin-pk' });
  assert.equal(r.status, 401);
  assert.equal((await r.json()).reauth, true);
  assert.ok((await (await admin.api('/api/users/' + id)).json()).passkeys.some(k => k.id === 'cousin-pk'), 'still there');
});

test('security: alerts say what, who, where - and offer the fix', async () => {
  const sec = await (await admin.api('/api/security')).json();
  const fail = sec.alerts.find(a => a.kind === 'signin' && /ghost/.test(a.text));
  assert.ok(fail, 'failed sign-ins for ghost are flagged');
  assert.equal(fail.level, 'alert');
  assert.match(fail.text, /8 failed sign-ins for “ghost” from 127\.0\.0\.1/);
  // a screen that went quiet, and an old passkey
  const s = await screen('view', 'Old hallway');
  const id = (await (await admin.api('/api/devices')).json()).devices.find(d => d.name === 'Old hallway').id;
  const users = (await (await admin.api('/api/users')).json()).users, gid = users.find(u => u.username === 'grandma').id;
  const db = new DatabaseSync(path.join(data, 'chalkboard.db'));
  db.prepare('UPDATE devices SET last_seen = ? WHERE id = ?').run(Date.now() - 100 * 86400e3, id);
  db.prepare('INSERT INTO passkeys (id, user_id, public_key, counter, transports, name, created) VALUES (?, ?, ?, 0, ?, ?, ?)').run('old-pk', gid, 'AA==', '[]', 'Safari on iPhone', Date.now() - 400 * 86400e3);
  db.close();
  const sec2 = await (await admin.api('/api/security')).json();
  const scr = sec2.alerts.find(a => a.kind === 'screen');
  assert.match(scr.text, /“Old hallway” \(Chrome on Android\) hasn’t been seen for 100 days/);
  assert.deepEqual(scr.actions[0].body, { id });
  const pk = sec2.alerts.find(a => a.kind === 'passkey');
  assert.match(pk.text, /“Safari on iPhone” of grandma \(@grandma\) hasn’t been used for 400 days/);
  assert.equal((await admin.post(pk.actions[0].call, pk.actions[0].body)).status, 200, 'the offered action works');
  // the log: who did what, to what, from where - with actions while the thing still exists
  const paired = sec2.log.find(e => e.event === 'screen.paired' && /Old hallway/.test(e.target));
  assert.deepEqual([paired.actor, paired.agent, typeof paired.ip], ['dad', 'Script on device', 'string']);
  assert.equal(paired.actions[0].label, 'Remove screen');
  assert.ok(sec2.log.some(e => e.event === 'signin.failed' && e.target === 'ghost' && e.detail === 'unknown username'));
  assert.ok(sec2.log.some(e => e.event === 'signin' && e.actor === 'nora' && /password \+ code · board/.test(e.detail)));
  assert.ok(sec2.log.some(e => e.event === 'person.invited' && /tarin/.test(e.target) && e.actor === 'dad'));
  // lower the limit: the quiet screen is removed now, and that's logged too
  const st = await (await admin.post('/api/security/settings', { screenFlagDays: 30, screenRemoveDays: 60, logDays: 1 })).json();
  assert.deepEqual([st.screenFlagDays, st.screenRemoveDays, st.logDays], [30, 60, 7]);
  assert.equal((await s.api('/api/month?ym=2026-10')).status, 401, 'automatically removed');
  const sec3 = await (await admin.api('/api/security')).json();
  assert.ok(sec3.log.some(e => e.event === 'screen.auto_removed' && /Old hallway/.test(e.target) && /100 days/.test(e.detail)));
  assert.ok(sec3.log.some(e => e.event === 'security.settings' && /screenRemoveDays 0 → 60/.test(e.detail)));
  assert.equal((await client(base, pick(adm.cookie, 'fcp_user')).api('/api/security')).status, 401, 'console sign-in needed');
});

test('deploy/reset-admin.sh: everyone and every screen is removed, a new setup code works', async () => {
  const wall = await screen('view', 'Wall 2');
  const out = execFileSync(process.execPath, [SERVER, '--reset-admin'], { env: { ...process.env, DATA_DIR: data, PORT: '0', TIMEZONE: 'UTC' } }).toString();
  const code = /setup code: (\S+)/.exec(out)[1];
  assert.equal((await admin.api('/api/whoami').then(r => r.json())).user, null);
  assert.equal((await wall.api('/api/month?ym=2026-10')).status, 401);
  const w = await (await fetch(base + '/api/whoami')).json();
  assert.deepEqual([w.setup, w.firstRun], [true, true]);
  assert.equal(fs.readFileSync(path.join(data, 'setup-code.txt'), 'utf8').trim(), code);
  const again = await makeAdmin(base, data, 'dad', 'yet another password');
  assert.equal((await client(base, again.cookie).api('/api/devices')).status, 200);
  const log = (await (await client(base, again.cookie).api('/api/security')).json()).log;
  assert.ok(log.some(e => e.event === 'reset' && e.actor === 'server (reset-admin.sh)'), 'the reset is in the log, and the log survives it');
});
