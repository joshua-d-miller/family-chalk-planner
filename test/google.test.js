// Google Calendar end to end against a fake Google: sign in (paste flow), pick a calendar,
// read, add, edit, delete, token refresh, and a revoked sign-in.
const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 3995, GPORT = 5995, PIN = '1357';
const base = `http://127.0.0.1:${PORT}`;
let server, google, data, token;
const api = p => fetch(base + p);
const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Chalk-Token': token || '' }, body: JSON.stringify(body) });
const month = async () => (await (await api('/api/month?ym=2026-10')).json());

test.before(async () => {
  google = await require('./mock-google').start(GPORT, { expiresIn: 2 });
  data = fs.mkdtempSync(path.join(os.tmpdir(), 'fcp-g-'));
  const g = `http://127.0.0.1:${GPORT}`;
  server = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'chalkboard.js')], {
    env: { ...process.env, PORT: String(PORT), BIND: '127.0.0.1', DATA_DIR: data, TIMEZONE: 'America/New_York', CHALK_PIN: PIN, HOLIDAYS: 'none',
      CALENDAR_PROVIDER: 'google', GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret',
      GOOGLE_AUTH_URL: `${g}/auth`, GOOGLE_TOKEN_URL: `${g}/token`, GOOGLE_API_BASE: g, GOOGLE_CALDAV_BASE: g },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  for (let i = 0; i < 50; i++) { try { if ((await api('/api/today')).ok) break; } catch {} await new Promise(r => setTimeout(r, 200)); }
  token = (await (await fetch(base + '/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: PIN }) })).json()).token;
});
test.after(() => { server && server.kill(); google && google.close(); fs.rmSync(data, { recursive: true, force: true }); });

test('before connecting, the board says how to connect', async () => {
  const s = await (await api('/api/calendar/status')).json();
  assert.deepEqual([s.provider, s.configured, s.connected, s.paste], ['google', true, false, true]);
  assert.match((await month()).error, /connect it in ⚙ Settings/);
});

test('sign-in needs the PIN', async () => {
  const r = await fetch(base + '/api/google/start', { method: 'POST' });
  assert.equal(r.status, 401);
});

test('sign in by pasting the address back', async () => {
  const { url } = await (await post('/api/google/start', {})).json();
  const u = new URL(url);
  assert.equal(u.searchParams.get('client_id'), 'test-client');
  assert.equal(u.searchParams.get('access_type'), 'offline');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.match(u.searchParams.get('scope'), /auth\/calendar$/);
  const st = u.searchParams.get('state');
  // a wrong state is refused, and doesn't use up the real one
  assert.equal((await post('/api/google/finish', { pasted: `http://localhost/?state=nope&code=GOOD-CODE` })).status, 400);
  assert.equal((await post('/api/google/finish', { pasted: 'just some text' })).status, 400);
  const ok = await post('/api/google/finish', { pasted: `http://localhost/?state=${st}&code=GOOD-CODE&scope=x` });
  assert.equal(ok.status, 200, await ok.text());
  const s = await (await api('/api/calendar/status')).json();
  assert.equal(s.connected, true);
  const saved = fs.statSync(path.join(data, 'google-auth.json'));
  assert.equal(saved.mode & 0o777, 0o600, 'token file is private');
  // the same sign-in can't be used twice
  assert.equal((await post('/api/google/finish', { pasted: `http://localhost/?state=${st}&code=GOOD-CODE` })).status, 400);
});

test('pick a calendar and see its events', async () => {
  const cals = await (await post('/api/google/calendars', {})).json();
  assert.ok(cals.find(c => c.name === 'Family'));
  assert.equal((await post('/api/google/calendar', { id: 'family@group.calendar.google.com', name: 'Family' })).status, 200);
  const m = await month();
  assert.ok(m.events.find(e => e.title === 'Google picnic'), JSON.stringify(m));
});

test('add, edit and delete go to Google with a fresh token', async () => {
  await new Promise(r => setTimeout(r, 2200));   // let the access token expire: the next call must refresh it
  const add = await (await post('/api/events', { title: 'Soccer sign-ups', date: '2026-10-21', allDay: true })).json();
  assert.ok(add.href && add.href.includes('/caldav/v2/'), JSON.stringify(add));
  let ev = (await month()).events.find(e => e.title === 'Soccer sign-ups');
  assert.ok(ev);
  assert.equal((await post('/api/events/update', { ref: ev.ref, scope: 'all', origDate: ev.start, title: 'Soccer sign-ups (gym)', date: '2026-10-22', allDay: true })).status, 200);
  ev = (await month()).events.find(e => e.title === 'Soccer sign-ups (gym)');
  assert.equal(ev && ev.start, '2026-10-22');
  assert.equal((await post('/api/events/delete', { ref: ev.ref, scope: 'all', origDate: ev.start })).status, 200);
  assert.equal((await month()).events.find(e => e.title.startsWith('Soccer sign-ups')), undefined);
  assert.ok(google.state.calls.filter(c => c === 'POST /token').length >= 2, 'refreshed the token');
});

test('a revoked sign-in tells the tablet to reconnect', async () => {
  google.state.refresh.clear();
  await new Promise(r => setTimeout(r, 2200));
  const m = await (await api('/api/month?ym=2026-11')).json();
  assert.match(m.error || '', /reconnect/i);
  const s = await (await api('/api/calendar/status')).json();
  assert.equal(s.connected, false);
  assert.match(s.problem, /reconnect/);
});

test('disconnect removes the sign-in', async () => {
  assert.equal((await post('/api/google/disconnect', {})).status, 200);
  assert.equal(fs.existsSync(path.join(data, 'google-auth.json')), false);
});
