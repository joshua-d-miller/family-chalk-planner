// Who may do what.
//
// SCREENS are paired once and have a role (no sign-in, they just keep working):
//   view    - shows the board (a wall display)
//   family  - view + change events, meals, jars and countdowns, and decorate with stamps / clipart / words (no freehand drawing)
//
// PEOPLE sign in, on a tablet or phone, with a passkey (Face ID / Touch ID / fingerprint,
// needs HTTPS and PUBLIC_URL) or with username + password + a code from an authenticator app:
//   editor  - everything on the board: events, drawing, board style, photos (signs in again every 60 days, adjustable)
//   admin   - editor + the admin console at /admin: screens, people, calendar and board settings.
//             The console asks for a fresh sign-in (it lasts 30 idle minutes, 12 hours at most).
//
// First run: the one-time setup code from the server log / data/setup-code.txt creates the
// first admin. deploy/reset-admin.sh wipes every person, sign-in and screen and makes a new code.
// Every key (screen, sign-in) is random, kept in an HttpOnly cookie, and stored only as a hash.
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const webauthn = require('@simplewebauthn/server');

const DEVICE_ROLES = ['view', 'family'];
const USER_ROLES = ['editor', 'admin'];
const RANK = { view: 1, family: 2, editor: 3, admin: 4 };
const C = { device: 'fcp_device', pair: 'fcp_pair', user: 'fcp_user', admin: 'fcp_admin' };
const DAY = 24 * 3600e3;
const PAIR_TTL = 15 * 60e3, INVITE_TTL = 3 * DAY, ENROLL_TTL = 20 * 60e3;
const ADMIN_IDLE = 30 * 60e3, ADMIN_MAX = 12 * 3600e3;
const KEEP = 400 * DAY;   // cookie lifetime (browsers cap it near 400 days); renewed every day the device is used
const CODE_ABC = 'ACDEFGHJKLMNPQRTUVWXY34679';   // no look-alikes (0/O, 1/I/L, 2/Z, 5/S, 8/B)
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const rid = (n = 9) => crypto.randomBytes(n).toString('base64url');
const randCode = n => Array.from(crypto.randomBytes(n), b => CODE_ABC[b % CODE_ABC.length]).join('');
const fmtCode = c => c.slice(0, 4) + '-' + c.slice(4);
const normCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const safeEq = (a, b) => { a = Buffer.from(String(a)); b = Buffer.from(String(b)); return a.length === b.length && crypto.timingSafeEqual(a, b); };

function parseCookies(h) {
  const out = {};
  for (const part of String(h || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) { try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* ignore a bad cookie */ } }
  }
  return out;
}
// "Safari on iPad", "Chrome on Android" ... so people can tell devices apart
function describe(ua) {
  ua = String(ua || '');
  const os = /iPad/.test(ua) ? 'iPad' : /Kindle|Silk|KF[A-Z]{2,}/.test(ua) ? 'Fire tablet' : /iPhone/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Mac OS X|Macintosh/.test(ua) ? 'Mac'
    : /Windows/.test(ua) ? 'Windows' : /CrOS/.test(ua) ? 'Chromebook' : /Linux/.test(ua) ? 'Linux' : 'device';
  // the browser each device used - only to tell devices apart in the console; every browser works the same
  const br = /Fully/i.test(ua) ? 'Fully Kiosk' : /Edg(e|A|iOS)?\//.test(ua) ? 'Edge' : /Firefox\/|FxiOS\//.test(ua) ? 'Firefox' : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /OPR\/|Opera/.test(ua) ? 'Opera' : /Vivaldi/.test(ua) ? 'Vivaldi' : /DuckDuckGo/.test(ua) ? 'DuckDuckGo' : /Silk\//.test(ua) ? 'Silk'
    : /Chrome\/|CriOS\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /node|curl|undici/i.test(ua) ? 'Script' : 'Browser';
  return `${br} on ${os}`;
}

// ---- passwords (scrypt) ----
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(pw), salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$32768$${salt.toString('base64')}$${h.toString('base64')}`;
}
function checkPassword(pw, stored) {
  const [kind, n, salt, h] = String(stored || '').split('$');
  if (kind !== 'scrypt') { crypto.scryptSync('x', 'y', 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }); return false; }   // same time either way
  const got = crypto.scryptSync(String(pw), Buffer.from(salt, 'base64'), 64, { N: +n, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return crypto.timingSafeEqual(got, Buffer.from(h, 'base64'));
}

// ---- authenticator-app codes (TOTP, RFC 6238: 30 s, 6 digits, SHA-1 - what every app supports) ----
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const b32enc = buf => { let bits = '', out = ''; for (const b of buf) bits += b.toString(2).padStart(8, '0'); for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)]; return out; };
const b32dec = s => { let bits = ''; for (const ch of String(s).replace(/=+$/, '')) { const v = B32.indexOf(ch); if (v < 0) continue; bits += v.toString(2).padStart(5, '0'); } const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); };
function totpAt(secret, counter) {
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', b32dec(secret)).update(msg).digest(), o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, '0');
}
// returns the matching time step (to block reuse) or -1
function totpCheck(secret, code, lastStep) {
  code = String(code || '').replace(/\D/g, '');
  if (code.length !== 6) return -1;
  const now = Math.floor(Date.now() / 30000);
  for (const step of [now, now - 1, now + 1]) if (step > (lastStep || 0) && safeEq(totpAt(secret, step), code)) return step;
  return -1;
}

function setup(app, { db, DATA_DIR, ENV, BOARD_TITLE, broadcast }) {
  db.exec(`CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY, key_hash TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL,
    created INTEGER NOT NULL, last_seen INTEGER NOT NULL, agent TEXT, ip TEXT)`);
  db.exec(`CREATE TABLE IF NOT EXISTS pairing (
    id TEXT PRIMARY KEY, code_hash TEXT UNIQUE NOT NULL, secret_hash TEXT UNIQUE NOT NULL,
    created INTEGER NOT NULL, agent TEXT, ip TEXT, device_key TEXT, role TEXT)`);
  db.exec(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL,
    pw_hash TEXT, totp_secret TEXT, totp_ok INTEGER NOT NULL DEFAULT 0, totp_last INTEGER NOT NULL DEFAULT 0,
    created INTEGER NOT NULL, last_login INTEGER)`);
  db.exec(`CREATE TABLE IF NOT EXISTS passkeys (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, public_key TEXT NOT NULL, counter INTEGER NOT NULL,
    transports TEXT, name TEXT, created INTEGER NOT NULL, last_used INTEGER)`);
  db.exec(`CREATE TABLE IF NOT EXISTS user_sessions (
    key_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, created INTEGER NOT NULL,
    last_seen INTEGER NOT NULL, agent TEXT, ip TEXT)`);
  db.exec(`CREATE TABLE IF NOT EXISTS invites (
    code_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, created INTEGER NOT NULL)`);
  db.exec(`CREATE TABLE IF NOT EXISTS audit (
    id INTEGER PRIMARY KEY, at INTEGER NOT NULL, event TEXT NOT NULL, actor TEXT, target TEXT, detail TEXT,
    ip TEXT, agent TEXT, ref_type TEXT, ref_id TEXT)`);
  const q = {
    dByKey: db.prepare('SELECT * FROM devices WHERE key_hash = ?'),
    dById: db.prepare('SELECT * FROM devices WHERE id = ?'),
    dList: db.prepare('SELECT id, name, role, created, last_seen, agent FROM devices ORDER BY created'),
    dAdd: db.prepare('INSERT INTO devices (id, key_hash, name, role, created, last_seen, agent, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
    dSeen: db.prepare("UPDATE devices SET last_seen = ?, ip = COALESCE(NULLIF(?, ''), ip) WHERE id = ?"),
    dUpd: db.prepare('UPDATE devices SET name = ?, role = ? WHERE id = ?'),
    dDel: db.prepare('DELETE FROM devices WHERE id = ?'),
    pAdd: db.prepare('INSERT INTO pairing (id, code_hash, secret_hash, created, agent, ip) VALUES (?, ?, ?, ?, ?, ?)'),
    pBySecret: db.prepare('SELECT * FROM pairing WHERE secret_hash = ?'),
    pByCode: db.prepare('SELECT * FROM pairing WHERE code_hash = ?'),
    pList: db.prepare('SELECT id, created, agent FROM pairing WHERE device_key IS NULL ORDER BY created'),
    pApprove: db.prepare('UPDATE pairing SET device_key = ?, role = ? WHERE id = ?'),
    pDel: db.prepare('DELETE FROM pairing WHERE id = ?'),
    pPurge: db.prepare('DELETE FROM pairing WHERE created < ?'),
    pCount: db.prepare('SELECT COUNT(*) AS n FROM pairing WHERE device_key IS NULL'),
    uById: db.prepare('SELECT * FROM users WHERE id = ?'),
    uByName: db.prepare('SELECT * FROM users WHERE username = ?'),
    uList: db.prepare('SELECT id, username, name, role, totp_ok, created, last_login FROM users ORDER BY created'),
    uAdd: db.prepare('INSERT INTO users (id, username, name, role, created) VALUES (?, ?, ?, ?, ?)'),
    uSetPw: db.prepare('UPDATE users SET pw_hash = ? WHERE id = ?'),
    uSetTotp: db.prepare('UPDATE users SET totp_secret = ?, totp_ok = ?, totp_last = 0 WHERE id = ?'),
    uTotpLast: db.prepare('UPDATE users SET totp_last = ? WHERE id = ?'),
    uLogin: db.prepare('UPDATE users SET last_login = ? WHERE id = ?'),
    uUpd: db.prepare('UPDATE users SET name = ?, role = ? WHERE id = ?'),
    uDel: db.prepare('DELETE FROM users WHERE id = ?'),
    uAdmins: db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND totp_ok = 1"),
    uCount: db.prepare('SELECT COUNT(*) AS n FROM users WHERE totp_ok = 1'),
    pkByUser: db.prepare('SELECT id, name, created, last_used, transports FROM passkeys WHERE user_id = ? ORDER BY created'),
    pkById: db.prepare('SELECT * FROM passkeys WHERE id = ?'),
    pkAdd: db.prepare('INSERT INTO passkeys (id, user_id, public_key, counter, transports, name, created) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    pkUse: db.prepare('UPDATE passkeys SET counter = ?, last_used = ? WHERE id = ?'),
    pkDel: db.prepare('DELETE FROM passkeys WHERE id = ? AND user_id = ?'),
    pkDelUser: db.prepare('DELETE FROM passkeys WHERE user_id = ?'),
    sAdd: db.prepare('INSERT INTO user_sessions (key_hash, user_id, kind, created, last_seen, agent, ip) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    sGet: db.prepare('SELECT * FROM user_sessions WHERE key_hash = ?'),
    sSeen: db.prepare("UPDATE user_sessions SET last_seen = ?, ip = COALESCE(NULLIF(?, ''), ip) WHERE key_hash = ?"),
    sDel: db.prepare('DELETE FROM user_sessions WHERE key_hash = ?'),
    sDelUser: db.prepare('DELETE FROM user_sessions WHERE user_id = ?'),
    sByUser: db.prepare("SELECT COUNT(*) AS n FROM user_sessions WHERE user_id = ? AND kind = 'edit'"),
    iAdd: db.prepare('INSERT INTO invites (code_hash, user_id, created) VALUES (?, ?, ?)'),
    iGet: db.prepare('SELECT * FROM invites WHERE code_hash = ?'),
    iDelUser: db.prepare('DELETE FROM invites WHERE user_id = ?'),
    iForUser: db.prepare('SELECT created FROM invites WHERE user_id = ?'),
    sList: db.prepare('SELECT rowid AS id, kind, created, last_seen, agent, ip, key_hash FROM user_sessions WHERE user_id = ? ORDER BY last_seen DESC'),
    sById: db.prepare('SELECT rowid AS id, * FROM user_sessions WHERE rowid = ?'),
    sDelId: db.prepare('DELETE FROM user_sessions WHERE rowid = ?'),
    sPurge: db.prepare("DELETE FROM user_sessions WHERE (kind = 'edit' AND last_seen < ?) OR (kind = 'admin' AND (last_seen < ? OR created < ?))"),
    pkAll: db.prepare('SELECT p.id, p.name, p.created, p.last_used, u.id AS uid, u.name AS uname, u.username FROM passkeys p JOIN users u ON u.id = p.user_id'),
    pkGet: db.prepare('SELECT * FROM passkeys WHERE id = ?'),
    pkDelAny: db.prepare('DELETE FROM passkeys WHERE id = ?'),
    dStale: db.prepare('SELECT * FROM devices WHERE last_seen < ?'),
    uStale: db.prepare('SELECT * FROM users WHERE totp_ok = 0 AND created < ?'),
    aAdd: db.prepare('INSERT INTO audit (at, event, actor, target, detail, ip, agent, ref_type, ref_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    aList: db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT ?'),
    aFails: db.prepare("SELECT target, ip, COUNT(*) AS n, MAX(at) AS last FROM audit WHERE event = 'signin.failed' AND at > ? GROUP BY target, ip ORDER BY n DESC"),
    aPurge: db.prepare('DELETE FROM audit WHERE at < ?'),
    kvGet: db.prepare('SELECT data FROM kv WHERE key = ?'),
    kvSet: db.prepare('INSERT INTO kv (key, data) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data'),
    kvDel: db.prepare('DELETE FROM kv WHERE key = ?')
  };
  const OPEN_VIEW = /^(1|true|yes|lan)$/i.test(String(ENV.ALLOW_UNPAIRED_VIEW || ''));
  // Authenticator secrets are locked with each person's own password: AES-256-GCM with a key derived from the
  // password (scrypt). Nothing extra to keep safe - no key file - and a copied database or backup can't produce
  // sign-in codes without cracking that person's password first. (Passwords themselves are separate scrypt hashes.)
  const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
  const pwKey = (pw, salt) => crypto.scryptSync('totp-key:' + String(pw), salt, 32, SCRYPT);
  function sealWith(key, salt, plain) {
    const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
    return 'pw1:' + Buffer.concat([salt, iv, c.getAuthTag(), ct]).toString('base64');
  }
  const sealPw = (pw, plain) => { const salt = crypto.randomBytes(16); return sealWith(pwKey(pw, salt), salt, plain); };
  function unsealPw(pw, v) {
    if (!v) return null;
    if (!String(v).startsWith('pw1:')) return v;   // (not used, but tolerate a plain secret)
    try {
      const b = Buffer.from(String(v).slice(4), 'base64'), salt = b.subarray(0, 16);
      const d = crypto.createDecipheriv('aes-256-gcm', pwKey(pw, salt), b.subarray(16, 28));
      d.setAuthTag(b.subarray(28, 44));
      return Buffer.concat([d.update(b.subarray(44)), d.final()]).toString('utf8');
    } catch { return null; }
  }
  const SETUP_FILE = path.join(DATA_DIR, 'setup-code.txt');
  // Passkeys are tied to one web address (they need HTTPS and a name, not an IP): PUBLIC_URL
  let RP = null;
  try { if (ENV.PUBLIC_URL) { const u = new URL(ENV.PUBLIC_URL); RP = { origin: u.origin, id: u.hostname }; } } catch { console.error('Chalk Planner: PUBLIC_URL is not a valid address - passkeys are off'); }
  const passkeysHere = req => !!RP && `${req.protocol}://${req.get('host')}` === RP.origin;

  // ---- one-time setup code ----
  function newSetupCode() {
    const code = randCode(8);
    q.kvSet.run('setupCode', JSON.stringify({ hash: sha('setup:' + code), at: Date.now() }));
    try { fs.writeFileSync(SETUP_FILE, fmtCode(code) + '\n', { mode: 0o600 }); } catch { /* the log still has it */ }
    return fmtCode(code);
  }
  const setupOpen = () => !!q.kvGet.get('setupCode');
  function checkSetupCode(given) {
    const r = q.kvGet.get('setupCode');
    return !!r && safeEq(JSON.parse(r.data).hash, sha('setup:' + normCode(given)));
  }
  function useSetupCode() { q.kvDel.run('setupCode'); try { fs.rmSync(SETUP_FILE, { force: true }); } catch {} }
  function resetAll() {   // deploy/reset-admin.sh (audit is defined below; called later)
    db.exec('DELETE FROM user_sessions; DELETE FROM passkeys; DELETE FROM invites; DELETE FROM users; DELETE FROM devices; DELETE FROM pairing;');
    audit(null, 'reset', { actor: 'server (reset-admin.sh)', detail: 'every person, sign-in, passkey and screen removed' });
    return newSetupCode();
  }
  if (q.uAdmins.get().n === 0) {
    const code = setupOpen() && fs.existsSync(SETUP_FILE) ? fs.readFileSync(SETUP_FILE, 'utf8').trim() : newSetupCode();
    console.log(`Family Chalk Planner: no admin yet. Open /admin and enter the setup code ${code}`);
  }

  // ---- security settings and the activity log ----
  // Tablets/phones: a board sign-in asks again every signinMaxDays (60) after signing in, or sooner after
  // signinIdleDays (60) unused. Screens stay paired for good: quiet ones are only flagged (screenRemoveDays 0 = never
  // remove automatically); an admin removes them.
  const SEC_DEFAULT = { signinIdleDays: 60, signinMaxDays: 60, screenFlagDays: 90, screenRemoveDays: 0, passkeyFlagDays: 365, personFlagDays: 180, logDays: 90 };
  function secCfg() { const r = q.kvGet.get('security'); return { ...SEC_DEFAULT, ...(r ? JSON.parse(r.data) : {}) }; }
  // every security event: what, who did it, to what, from which device and address
  function audit(req, event, o = {}) {
    let actor = o.actor;
    if (actor === undefined && req) { const u = req._sadmin && req._sadmin.user || req._sedit && req._sedit.user; const d = req._dev; actor = u ? u.username : d ? 'screen: ' + d.name : null; }
    try {
      q.aAdd.run(Date.now(), event, actor || null, o.target || null, o.detail || null, req ? req.ip || '' : 'server', req ? describe(req.get('user-agent')) : 'server', o.refType || null, o.refId != null ? String(o.refId) : null);
    } catch (e) { console.error('Chalk Planner: activity log:', e.message); }
  }
  // housekeeping: expired sign-ins and invites, unfinished accounts, long-gone screens, old log lines
  function cleanup() {
    const now = Date.now(), cfg = secCfg();
    q.sPurge.run(now - cfg.signinIdleDays * DAY, now - ADMIN_IDLE, now - ADMIN_MAX);
    if (cfg.signinMaxDays > 0) db.prepare("DELETE FROM user_sessions WHERE kind = 'edit' AND created < ?").run(now - cfg.signinMaxDays * DAY);
    q.pPurge.run(now - PAIR_TTL);
    db.prepare('DELETE FROM invites WHERE created < ?').run(now - INVITE_TTL);
    for (const u of q.uStale.all(now - INVITE_TTL)) {
      if (q.iForUser.get(u.id)) continue;
      q.sDelUser.run(u.id); q.pkDelUser.run(u.id); q.uDel.run(u.id);
      audit(null, 'person.auto_removed', { actor: 'automatic', target: `${u.name} (@${u.username})`, detail: 'never finished setting up' });
    }
    if (cfg.screenRemoveDays > 0) for (const d of q.dStale.all(now - cfg.screenRemoveDays * DAY)) {
      q.dDel.run(d.id);
      audit(null, 'screen.auto_removed', { actor: 'automatic', target: `${d.name} (${d.agent})`, detail: `not seen for ${Math.round((now - d.last_seen) / DAY)} days` });
    }
    q.aPurge.run(now - Math.max(7, cfg.logDays) * DAY);
  }
  setTimeout(cleanup, 2000).unref();
  setInterval(cleanup, 3600e3).unref();

  // ---- cookies ----
  const cookie = (req, res, name, val, maxAgeMs, extra = {}) => res.append('Set-Cookie',
    `${name}=${val}; Path=${extra.path || '/'}; Max-Age=${Math.floor(maxAgeMs / 1000)}; HttpOnly; SameSite=${extra.same || 'Lax'}${req.secure ? '; Secure' : ''}`);
  const clear = (req, res, name, p) => cookie(req, res, name, '', 0, { path: p || (name === C.pair ? '/api/pair' : '/'), same: name === C.admin ? 'Strict' : name === C.pair ? 'Strict' : 'Lax' });

  // ---- who is this? (a paired screen, a signed-in person, or both) ----
  function deviceOf(req) {
    if (req._dev !== undefined) return req._dev;
    const key = parseCookies(req.get('cookie'))[C.device];
    const d = key && key.length < 100 ? q.dByKey.get(sha(key)) : null;
    if (d && Date.now() - d.last_seen > 60e3) { q.dSeen.run(Date.now(), req.ip || '', d.id); d.last_seen = Date.now(); }
    return (req._dev = d || null);
  }
  function sessionOf(req, kind) {
    const k = '_s' + kind;
    if (req[k] !== undefined) return req[k];
    const key = parseCookies(req.get('cookie'))[kind === 'admin' ? C.admin : C.user];
    let s = key && key.length < 100 ? q.sGet.get(sha(key)) : null;
    if (s && s.kind !== kind) s = null;
    const now = Date.now();
    const cfg = kind === 'edit' ? secCfg() : null;
    const over = s && (kind === 'edit'
      ? now - s.last_seen > cfg.signinIdleDays * DAY || (cfg.signinMaxDays > 0 && now - s.created > cfg.signinMaxDays * DAY)
      : now - s.last_seen > ADMIN_IDLE || now - s.created > ADMIN_MAX);
    if (over) { q.sDel.run(s.key_hash); s = null; }
    const u = s ? q.uById.get(s.user_id) : null;
    if (s && (!u || (kind === 'admin' && u.role !== 'admin'))) s = null;
    if (s && now - s.last_seen > (kind === 'admin' ? 15e3 : 60e3)) q.sSeen.run(now, req.ip || '', s.key_hash);
    return (req[k] = s ? { ...s, user: u } : null);
  }
  const userOf = req => { const s = sessionOf(req, 'admin') || sessionOf(req, 'edit'); return s ? s.user : null; };
  function rankOf(req) {
    let r = OPEN_VIEW ? 1 : 0;
    const d = deviceOf(req); if (d) r = Math.max(r, RANK[d.role] || 0);
    if (sessionOf(req, 'edit')) r = Math.max(r, RANK.editor);
    if (sessionOf(req, 'admin')) r = RANK.admin;
    return r;
  }
  function startSession(req, res, user, kind, how) {
    const key = crypto.randomBytes(32).toString('base64url');
    const info = q.sAdd.run(sha(key), user.id, kind, Date.now(), Date.now(), describe(req.get('user-agent')), req.ip || '');
    if (how) audit(req, 'signin', { actor: user.username, target: `${user.name} (@${user.username})`, detail: `${how} · ${kind === 'admin' ? 'admin console' : 'board'}`, refType: 'session', refId: info.lastInsertRowid });
    q.uLogin.run(Date.now(), user.id);
    if (kind === 'admin') cookie(req, res, C.admin, key, ADMIN_MAX, { same: 'Strict' });
    else cookie(req, res, C.user, key, KEEP);
  }

  // ---- rate limits ----
  const tries = new Map();
  const tooMany = (key, max, windowMs, count = true) => {
    const now = Date.now(), t = (tries.get(key) || []).filter(x => now - x < windowMs);
    if (count) t.push(now);
    tries.set(key, t);
    return count ? t.length > max : t.length >= max;   // checking only: already used up
  };
  setInterval(() => { const now = Date.now(); for (const [k, t] of tries) if (!t.some(x => now - x < 3600e3)) tries.delete(k); }, 10 * 60e3).unref();

  // ---- browser protections on every response ----
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()', 'Cross-Origin-Opener-Policy': 'same-origin' });
    if (req.secure) res.set('Strict-Transport-Security', 'max-age=15552000');
    if (req.path === '/admin' || req.path === '/join') res.set('Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'");
    else res.set('Content-Security-Policy', "frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    if (/^\/api\/(whoami|account|users|devices|security|pair|passkey)/.test(req.path)) res.set('Cache-Control', 'no-store');
    next();
  });

  // ---- keep cookies of screens and board sign-ins that are in use from running out ----
  const renewed = new Map();   // key hash -> last time its cookie was re-sent
  app.use((req, res, next) => {
    const ck = parseCookies(req.get('cookie')), now = Date.now();
    for (const [name, ok] of [[C.device, () => deviceOf(req)], [C.user, () => sessionOf(req, 'edit')]]) {
      const v = ck[name]; if (!v || v.length > 100) continue;
      const h = sha(v);
      if (now - (renewed.get(h) || 0) < DAY || !ok()) continue;
      renewed.set(h, now);
      cookie(req, res, name, v, KEEP);
    }
    if (renewed.size > 5000) renewed.clear();
    next();
  });

  // ---- access rules ----
  // public: pairing, sign-in/setup/join, whoami, today's date (install/update health checks)
  const PUBLIC = [/^\/pair\//, /^\/whoami$/, /^\/today$/, /^\/account\/(login|setup|join|enroll)/, /^\/passkey\/login\//];
  const SELF = [/^\/account\//, /^\/passkey\//];   // need a signed-in person; checked in the route
  // family screens: events, meals, jars, countdowns, event colors, and placing/moving/erasing art (stamps, clipart, words).
  // Not: wiping a month, changing the stamp/GIF libraries, uploads, style, photos, settings.
  const FAMILY_POSTS = new Set(['/events', '/events/update', '/events/delete', '/meals', '/jars', '/countdowns', '/evcolor',
    '/art', '/art/update', '/art/bulk', '/art/restore', '/art/delete', '/art/undo']);
  const ADMIN = [/^\/devices/, /^\/users/, /^\/security/, /^\/google\//, /^\/calendar\/status$/, /^\/trash$/, /^\/notes$/];
  app.use('/api', (req, res, next) => {
    const write = !(req.method === 'GET' || req.method === 'HEAD');
    if (write && req.get('X-Chalk') !== '1') return res.status(403).json({ error: 'Missing request header' });   // no cross-site form posts
    if (PUBLIC.some(r => r.test(req.path)) || SELF.some(r => r.test(req.path))) return next();
    const need = ADMIN.some(r => r.test(req.path)) ? RANK.admin : !write ? RANK.view : FAMILY_POSTS.has(req.path) ? RANK.family : RANK.editor;
    const have = rankOf(req);
    if (have >= need) return next();
    if (need === RANK.admin && userOf(req) && userOf(req).role === 'admin') return res.status(401).json({ error: 'Sign in to the admin console again', admin: true });
    if (!have) return res.status(401).json({ error: 'Pair this screen or sign in first', pair: true });
    res.status(403).json({ error: need === RANK.admin ? 'Only an admin can do that (admin console)' : need === RANK.editor ? 'Sign in to do that' : 'This screen can’t make changes', signin: need === RANK.editor });
  });

  // ---- who am I ----
  app.get('/api/whoami', (req, res) => {
    const d = deviceOf(req), e = sessionOf(req, 'edit'), a = sessionOf(req, 'admin'), u = (a || e || {}).user;
    res.json({
      device: d ? { id: d.id, name: d.name, role: d.role } : null,
      user: u ? { username: u.username, name: u.name, role: u.role } : null,
      editor: !!e || !!a, admin: !!a,
      rank: rankOf(req), setup: setupOpen(), firstRun: q.uAdmins.get().n === 0,
      passkeys: passkeysHere(req), publicUrl: RP ? RP.origin : null, openView: OPEN_VIEW
    });
  });

  // =====================================================================
  // Screens: pairing
  // =====================================================================
  app.post('/api/pair/start', (req, res) => {
    if (deviceOf(req)) return res.status(400).json({ error: 'This screen is already paired' });
    q.pPurge.run(Date.now() - PAIR_TTL);
    if (tooMany('start:' + req.ip, 10, 10 * 60e3) || q.pCount.get().n > 30) return res.status(429).json({ error: 'Too many pairing requests - wait a few minutes' });
    const code = randCode(8), secret = rid(24), id = rid(6);
    q.pAdd.run(id, sha('pair:' + code), sha(secret), Date.now(), describe(req.get('user-agent')), req.ip || '');
    cookie(req, res, C.pair, secret, PAIR_TTL, { path: '/api/pair', same: 'Strict' });
    broadcast && broadcast('devices', {});
    audit(req, 'screen.waiting', { target: describe(req.get('user-agent')), detail: 'showing a pairing code' });
    res.json({ code: fmtCode(code), expires: Date.now() + PAIR_TTL });
  });
  app.get('/api/pair/status', (req, res) => {
    const secret = parseCookies(req.get('cookie'))[C.pair];
    const p = secret ? q.pBySecret.get(sha(secret)) : null;
    if (!p || Date.now() - p.created > PAIR_TTL) return res.json({ state: 'expired' });
    if (!p.device_key) return res.json({ state: 'waiting' });
    q.pDel.run(p.id);   // the key is handed over exactly once
    cookie(req, res, C.device, p.device_key, KEEP);
    clear(req, res, C.pair);
    res.json({ state: 'paired', role: p.role });
  });
  app.get('/api/devices', (req, res) => {
    q.pPurge.run(Date.now() - PAIR_TTL);
    res.json({ devices: q.dList.all(), waiting: q.pList.all().map(p => ({ agent: p.agent, created: p.created })) });
  });
  app.post('/api/devices/approve', (req, res) => {
    const b = req.body || {}, role = DEVICE_ROLES.includes(b.role) ? b.role : null;
    if (!role) return res.status(400).json({ error: 'Pick what this screen may do' });
    if (tooMany('approve:' + req.ip, 20, 10 * 60e3)) return res.status(429).json({ error: 'Too many tries - wait a few minutes' });
    const p = q.pByCode.get(sha('pair:' + normCode(b.code)));
    if (!p || p.device_key || Date.now() - p.created > PAIR_TTL) return res.status(404).json({ error: 'No screen is waiting with that code. Check the code on its screen (it changes every 15 minutes).' });
    const key = crypto.randomBytes(32).toString('base64url'), id = rid(6);
    q.dAdd.run(id, sha(key), String(b.name || p.agent).trim().slice(0, 60) || p.agent, role, Date.now(), Date.now(), p.agent, p.ip);
    q.pApprove.run(key, role, p.id);
    broadcast && broadcast('devices', {});
    audit(req, 'screen.paired', { target: `${String(b.name || p.agent).trim().slice(0, 60) || p.agent} (${p.agent})`, detail: `as ${role} · from ${p.ip}`, refType: 'screen', refId: id });
    res.json({ ok: true, id });
  });
  app.post('/api/devices/update', (req, res) => {
    const b = req.body || {}, d = q.dById.get(String(b.id || ''));
    if (!d) return res.status(404).json({ error: 'Screen not found' });
    const role = b.role === undefined ? d.role : DEVICE_ROLES.includes(b.role) ? b.role : null;
    if (!role) return res.status(400).json({ error: 'Unknown role' });
    q.dUpd.run(b.name === undefined ? d.name : String(b.name).trim().slice(0, 60) || d.name, role, d.id);
    broadcast && broadcast('devices', {});
    if (role !== d.role) audit(req, 'screen.changed', { target: `${d.name} (${d.agent})`, detail: `${d.role} → ${role}`, refType: 'screen', refId: d.id });
    res.json({ ok: true });
  });
  app.post('/api/devices/remove', (req, res) => {
    const d = q.dById.get(String((req.body || {}).id || ''));
    if (!d) return res.status(404).json({ error: 'Screen not found' });
    q.dDel.run(d.id);
    broadcast && broadcast('devices', {});
    audit(req, 'screen.removed', { target: `${d.name} (${d.agent})` });
    res.json({ ok: true });
  });

  // =====================================================================
  // People: first admin, invites, sign-in (password + authenticator code, or passkey)
  // =====================================================================
  const USERNAME = /^[a-z0-9][a-z0-9._-]{1,31}$/;
  const pwProblem = pw => (typeof pw !== 'string' || pw.length < 10 ? 'Use a password of at least 10 characters' : pw.length > 200 ? 'That password is too long' : null);
  const enrolls = new Map();   // token -> { userId, secret, at, then }
  async function enrollment(user, then, password) {
    const secret = b32enc(crypto.randomBytes(20)), token = rid(18), salt = crypto.randomBytes(16);
    for (const [k, v] of enrolls) if (Date.now() - v.at > ENROLL_TTL) enrolls.delete(k);
    enrolls.set(token, { userId: user.id, secret, at: Date.now(), then, salt, key: pwKey(password, salt) });   // the derived key, never the password
    const label = encodeURIComponent(`${BOARD_TITLE}:${user.username}`);
    const uri = `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(BOARD_TITLE)}&algorithm=SHA1&digits=6&period=30`;
    return { enroll: token, secret: secret.replace(/(.{4})/g, '$1 ').trim(), qr: await QRCode.toString(uri, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }), uri };
  }
  // step 1 of first run: setup code + new admin's name and password -> authenticator QR
  app.post('/api/account/setup', async (req, res) => {
    const b = req.body || {};
    if (!setupOpen()) return res.status(400).json({ error: 'Setup is already done - sign in instead' });
    if (tooMany('setup:' + req.ip, 8, 15 * 60e3) || tooMany('setup:*', 30, 15 * 60e3)) return res.status(429).json({ error: 'Too many tries - wait 15 minutes' });
    if (!checkSetupCode(b.code)) { console.warn(`Chalk Planner: wrong setup code from ${req.ip}`); audit(req, 'setup.failed', { detail: 'wrong setup code' }); return res.status(401).json({ error: 'That setup code didn’t work' }); }
    const username = String(b.username || '').trim().toLowerCase();
    if (!USERNAME.test(username)) return res.status(400).json({ error: 'Username: 2-32 letters, numbers, dots, dashes or underscores' });
    const pwErr = pwProblem(b.password); if (pwErr) return res.status(400).json({ error: pwErr });
    let u = q.uByName.get(username);
    if (u && u.totp_ok) return res.status(400).json({ error: 'That username is taken' });
    if (!u) { q.uAdd.run(rid(6), username, String(b.name || username).trim().slice(0, 40) || username, 'admin', Date.now()); u = q.uByName.get(username); }
    q.uUpd.run(String(b.name || u.name).trim().slice(0, 40) || username, 'admin', u.id);
    q.uSetPw.run(hashPassword(b.password), u.id);
    res.json(await enrollment(u, 'setup', b.password));
  });
  // invite link: the person sets their password -> authenticator QR
  app.post('/api/account/join', async (req, res) => {
    const b = req.body || {};
    if (tooMany('join:' + req.ip, 10, 15 * 60e3, false)) return res.status(429).json({ error: 'Too many tries - wait 15 minutes' });
    const inv = q.iGet.get(sha('invite:' + String(b.invite || '')));
    const u = inv && Date.now() - inv.created < INVITE_TTL ? q.uById.get(inv.user_id) : null;
    if (!u) { tooMany('join:' + req.ip, 10, 15 * 60e3); return res.status(404).json({ error: 'That invite link has expired or was already used - ask for a new one' }); }   // only bad links count
    if (b.check) return res.json({ username: u.username, name: u.name, role: u.role });
    const pwErr = pwProblem(b.password); if (pwErr) return res.status(400).json({ error: pwErr });
    q.uSetPw.run(hashPassword(b.password), u.id);
    res.json({ ...(await enrollment(u, 'join:' + inv.code_hash, b.password)), username: u.username });
  });
  // step 2: the first code from the authenticator app proves it's set up -> signed in
  app.post('/api/account/enroll', (req, res) => {
    const b = req.body || {}, e = enrolls.get(String(b.enroll || ''));
    if (!e || Date.now() - e.at > ENROLL_TTL) return res.status(400).json({ error: 'This took too long - start again' });
    const u = q.uById.get(e.userId);
    if (!u) return res.status(400).json({ error: 'Start again' });
    if (tooMany('enroll:' + b.enroll, 8, ENROLL_TTL)) { enrolls.delete(b.enroll); return res.status(429).json({ error: 'Too many wrong codes - start again' }); }
    const step = totpCheck(e.secret, b.code, 0);
    if (step < 0) return res.status(401).json({ error: 'That code didn’t match - check the time on your phone and try the newest code' });
    enrolls.delete(b.enroll);
    if (e.then === 'setup') { if (!setupOpen()) return res.status(400).json({ error: 'Setup was already finished' }); useSetupCode(); }
    if (e.then.startsWith('join:')) q.iDelUser.run(u.id);
    audit(req, e.then === 'setup' ? 'person.created' : e.then === 'reset' ? 'authenticator.changed' : 'person.joined',
      { actor: u.username, target: `${u.name} (@${u.username})`, detail: e.then === 'setup' ? 'first admin, with the setup code' : e.then === 'reset' ? 'moved to a new authenticator app; other sign-ins ended' : `finished the invite as ${u.role}`, refType: 'person', refId: u.id });
    const wasOk = u.totp_ok;
    q.uSetTotp.run(sealWith(e.key, e.salt, e.secret), 1, u.id); q.uTotpLast.run(step, u.id);
    if (wasOk && e.then === 'reset') q.sDelUser.run(u.id);   // new authenticator: other sign-ins end
    const fresh = q.uById.get(u.id);
    startSession(req, res, fresh, 'edit', e.then === 'reset' ? 'new authenticator app' : 'new account');
    if (fresh.role === 'admin' && e.then !== 'reset') startSession(req, res, fresh, 'admin');
    broadcast && broadcast('devices', {});
    res.json({ ok: true, role: fresh.role });
  });
  // sign in with password + authenticator code; kind 'edit' (board, long-lived) or 'admin' (console)
  app.post('/api/account/login', (req, res) => {
    const b = req.body || {}, kind = b.kind === 'admin' ? 'admin' : 'edit';
    const username = String(b.username || '').trim().toLowerCase().slice(0, 40);
    if (tooMany('login:' + req.ip, 20, 15 * 60e3, false) || tooMany('user:' + username, 8, 15 * 60e3, false)) return res.status(429).json({ error: 'Too many tries - wait 15 minutes' });
    const u = q.uByName.get(username);
    const pwOk = checkPassword(b.password, u && u.pw_hash);
    const secret = u && u.totp_ok && pwOk ? unsealPw(b.password, u.totp_secret) : null;
    const step = secret ? totpCheck(secret, b.code, u.totp_last) : -1;
    if (!u || !u.totp_ok || !pwOk || step < 0) {
      tooMany('login:' + req.ip, 20, 15 * 60e3); tooMany('user:' + username, 8, 15 * 60e3);
      console.warn(`Chalk Planner: failed sign-in for "${username}" from ${req.ip}`);
      audit(req, 'signin.failed', { actor: null, target: username || '(blank)', detail: !u ? 'unknown username' : !pwOk ? 'wrong password' : 'wrong or reused code', refType: u ? 'person' : null, refId: u ? u.id : null });
      return res.status(401).json({ error: 'That username, password or code didn’t work' });
    }
    if (kind === 'admin' && u.role !== 'admin') return res.status(403).json({ error: 'This account isn’t an admin' });
    q.uTotpLast.run(step, u.id);
    startSession(req, res, u, kind, 'password + code');
    if (kind === 'admin' && !sessionOf(req, 'edit')) startSession(req, res, u, 'edit');   // the board works too after an admin sign-in
    res.json({ ok: true, role: u.role });
  });
  app.post('/api/account/logout', (req, res) => {
    const ck = parseCookies(req.get('cookie')), u = userOf(req);
    for (const name of [C.user, C.admin]) if (ck[name]) q.sDel.run(sha(ck[name]));
    if (u) audit(req, 'signout', { actor: u.username, target: `${u.name} (@${u.username})`, detail: 'signed out on this device' });
    clear(req, res, C.user); clear(req, res, C.admin);
    res.json({ ok: true });
  });
  // my account: password, authenticator, passkeys
  const me = req => userOf(req);
  function myKeys(req) { const ck = parseCookies(req.get('cookie')); return [ck[C.user], ck[C.admin]].filter(Boolean).map(k => sha(k)); }
  app.get('/api/account/me', (req, res) => {
    const u = me(req); if (!u) return res.status(401).json({ error: 'Sign in first', signin: true });
    res.json({ username: u.username, name: u.name, role: u.role, passkeys: q.pkByUser.all(u.id), passkeysHere: passkeysHere(req) });
  });
  app.post('/api/account/password', (req, res) => {
    const u = me(req), b = req.body || {}; if (!u) return res.status(401).json({ error: 'Sign in first' });
    if (tooMany('pw:' + u.id, 8, 15 * 60e3)) return res.status(429).json({ error: 'Too many tries - wait 15 minutes' });
    if (!checkPassword(b.current, u.pw_hash)) return res.status(401).json({ error: 'Your current password didn’t match' });
    const pwErr = pwProblem(b.next); if (pwErr) return res.status(400).json({ error: pwErr });
    const totp = u.totp_secret ? unsealPw(b.current, u.totp_secret) : null;   // re-lock the authenticator secret with the new password
    q.uSetPw.run(hashPassword(b.next), u.id);
    if (totp) db.prepare('UPDATE users SET totp_secret = ? WHERE id = ?').run(sealPw(b.next, totp), u.id);
    const keep = myKeys(req);   // sign out everywhere else, stay signed in here
    for (const sx of q.sList.all(u.id)) if (!keep.includes(sx.key_hash)) q.sDelId.run(sx.id);
    audit(req, 'password.changed', { target: `${u.name} (@${u.username})`, detail: 'other sign-ins ended', refType: 'person', refId: u.id });
    res.json({ ok: true });
  });
  app.post('/api/account/totp', async (req, res) => {   // move to a new authenticator app (needs the password)
    const u = me(req), b = req.body || {}; if (!u) return res.status(401).json({ error: 'Sign in first' });
    if (tooMany('pw:' + u.id, 8, 15 * 60e3)) return res.status(429).json({ error: 'Too many tries - wait 15 minutes' });
    if (!checkPassword(b.password, u.pw_hash)) return res.status(401).json({ error: 'Your password didn’t match' });
    res.json(await enrollment(u, 'reset', b.password));
  });
  app.post('/api/account/passkeys/remove', (req, res) => {
    const u = me(req); if (!u) return res.status(401).json({ error: 'Sign in first' });
    if (needRecent(req, res)) return;
    const pk = q.pkGet.get(String((req.body || {}).id || ''));
    if (pk && pk.user_id === u.id) { q.pkDel.run(pk.id, u.id); audit(req, 'passkey.removed', { target: `“${pk.name}” of ${u.name} (@${u.username})` }); }
    res.json({ ok: true });
  });

  // Adding or removing a passkey needs a sign-in from the last 10 minutes on this device, so someone who
  // picks up a tablet that's already signed in can't add their own passkey (and keep access) or remove yours.
  const RECENT = 10 * 60e3;
  function recentlySignedIn(req) {
    const now = Date.now(), a = sessionOf(req, 'admin'), e = sessionOf(req, 'edit');
    return [a, e].some(s => s && now - s.created < RECENT);
  }
  const needRecent = (req, res) => { if (recentlySignedIn(req)) return false; res.status(401).json({ error: 'For safety, sign in again to change passkeys', reauth: true }); return true; };

  // ---- passkeys (WebAuthn) ----
  const challenges = new Map();   // id -> { challenge, userId?, kind, at }
  const keepChallenge = v => { const id = rid(12); for (const [k, c] of challenges) if (Date.now() - c.at > 5 * 60e3) challenges.delete(k); challenges.set(id, { ...v, at: Date.now() }); return id; };
  const takeChallenge = id => { const c = challenges.get(String(id || '')); challenges.delete(String(id || '')); return c && Date.now() - c.at < 5 * 60e3 ? c : null; };
  const noPasskeys = (req, res) => { if (passkeysHere(req)) return false; res.status(400).json({ error: RP ? `Passkeys work at ${RP.origin} only` : 'Passkeys need PUBLIC_URL (an https:// address) in the board’s settings' }); return true; };
  app.post('/api/passkey/register/options', async (req, res) => {
    const u = me(req); if (!u) return res.status(401).json({ error: 'Sign in first' });
    if (noPasskeys(req, res) || needRecent(req, res)) return;
    const opts = await webauthn.generateRegistrationOptions({
      rpName: BOARD_TITLE, rpID: RP.id, userName: u.username, userDisplayName: u.name, userID: Buffer.from(u.id),
      attestationType: 'none', authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      excludeCredentials: q.pkByUser.all(u.id).map(p => ({ id: p.id, transports: p.transports ? JSON.parse(p.transports) : undefined }))
    });
    res.json({ options: opts, id: keepChallenge({ challenge: opts.challenge, userId: u.id }) });
  });
  app.post('/api/passkey/register/verify', async (req, res) => {
    const u = me(req), b = req.body || {}; if (!u) return res.status(401).json({ error: 'Sign in first' });
    if (noPasskeys(req, res)) return;
    const c = takeChallenge(b.id);
    if (!c || c.userId !== u.id) return res.status(400).json({ error: 'That took too long - try again' });
    try {
      const v = await webauthn.verifyRegistrationResponse({ response: b.response, expectedChallenge: c.challenge, expectedOrigin: RP.origin, expectedRPID: RP.id, requireUserVerification: true });
      if (!v.verified) throw new Error('not verified');
      const cr = v.registrationInfo.credential;
      const pkName = String(b.name || describe(req.get('user-agent'))).slice(0, 60);
      q.pkAdd.run(cr.id, u.id, Buffer.from(cr.publicKey).toString('base64'), cr.counter || 0, JSON.stringify(cr.transports || []), pkName, Date.now());
      audit(req, 'passkey.added', { target: `“${pkName}” of ${u.name} (@${u.username})`, refType: 'passkey', refId: cr.id });
      res.json({ ok: true });
    } catch (e) { res.status(400).json({ error: 'The passkey couldn’t be saved (' + e.message + ')' }); }
  });
  app.post('/api/passkey/login/options', async (req, res) => {
    if (noPasskeys(req, res)) return;
    if (tooMany('pk:' + req.ip, 30, 15 * 60e3)) return res.status(429).json({ error: 'Too many tries - wait 15 minutes' });
    const opts = await webauthn.generateAuthenticationOptions({ rpID: RP.id, userVerification: 'required', allowCredentials: [] });
    res.json({ options: opts, id: keepChallenge({ challenge: opts.challenge, kind: (req.body || {}).kind === 'admin' ? 'admin' : 'edit' }) });
  });
  app.post('/api/passkey/login/verify', async (req, res) => {
    if (noPasskeys(req, res)) return;
    const b = req.body || {}, c = takeChallenge(b.id);
    if (!c) { audit(req, 'signin.failed', { target: 'passkey', detail: 'took too long (over 5 minutes) - nothing checked' }); return res.status(400).json({ error: 'That took too long - try again' }); }
    const pk = b.response && b.response.id ? q.pkById.get(String(b.response.id)) : null;
    const u = pk ? q.uById.get(pk.user_id) : null;
    if (!pk || !u) {
      // usually a passkey that was removed from the board but is still in someone's password manager
      audit(req, 'signin.failed', { target: 'unknown passkey', detail: 'a passkey the board doesn’t have (removed earlier, or from an unfinished setup)' });
      return res.status(401).json({ error: 'This passkey isn’t on the board any more (it was removed). Delete the old passkey for this site in your password manager, sign in with your password and code, then add a new passkey.', unknownCredential: b.response && b.response.id ? String(b.response.id).slice(0, 400) : null, rpId: RP.id });
    }
    try {
      const v = await webauthn.verifyAuthenticationResponse({
        response: b.response, expectedChallenge: c.challenge, expectedOrigin: RP.origin, expectedRPID: RP.id, requireUserVerification: true,
        credential: { id: pk.id, publicKey: new Uint8Array(Buffer.from(pk.public_key, 'base64')), counter: pk.counter, transports: pk.transports ? JSON.parse(pk.transports) : undefined }
      });
      if (!v.verified) throw new Error('not verified');
      q.pkUse.run(v.authenticationInfo.newCounter, Date.now(), pk.id);
    } catch (e) {
      console.warn(`Chalk Planner: passkey sign-in failed from ${req.ip}: ${e.message}`);
      audit(req, 'signin.failed', { target: u.username, detail: 'passkey check failed: ' + e.message, refType: 'person', refId: u.id });
      return res.status(401).json({ error: 'That passkey didn’t work' });
    }
    if (c.kind === 'admin' && u.role !== 'admin') return res.status(403).json({ error: 'This account isn’t an admin' });
    startSession(req, res, u, c.kind, 'passkey “' + (pk.name || 'passkey') + '”');
    if (c.kind === 'admin' && !sessionOf(req, 'edit')) startSession(req, res, u, 'edit');
    res.json({ ok: true, role: u.role, name: u.name });
  });

  // The phone/tablet couldn't produce a passkey at all (the board never saw one): log what the browser said,
  // so "it just says it can't be used" shows up in Activity with the real reason.
  app.post('/api/passkey/client-error', (req, res) => {
    if (tooMany('pkerr:' + req.ip, 10, 15 * 60e3)) return res.status(429).json({ error: 'Too many reports' });
    const b = req.body || {}, clip = (v, n) => String(v || '').replace(/[\u0000-\u001f]/g, ' ').slice(0, n);
    const stage = b.stage === 'create' ? 'adding a passkey' : 'passkey sign-in';
    audit(req, b.stage === 'create' ? 'passkey.add_failed' : 'signin.failed', { target: stage + ' (on the device)',
      detail: `${clip(b.name, 40) || 'Error'}: ${clip(b.message, 200) || 'no details'}${b.app ? ' · home-screen app' : ''} · board never received a passkey` });
    res.json({ ok: true });
  });

  // ---- people (admin console) ----
  const publicOrigin = req => (RP ? RP.origin : `${req.protocol}://${req.get('host')}`);
  async function invite(req, u) {
    q.iDelUser.run(u.id);
    const code = rid(18);
    q.iAdd.run(sha('invite:' + code), u.id, Date.now());
    return `${publicOrigin(req)}/join#${code}`;
  }
  app.get('/api/users', (req, res) => {
    const myId = me(req).id;
    res.json({ me: myId, users: q.uList.all().map(u => ({ ...u, passkeys: q.pkByUser.all(u.id).length, signedIn: q.sByUser.get(u.id).n, invited: !!q.iForUser.get(u.id) })) });
  });
  app.post('/api/users/invite', async (req, res) => {
    const b = req.body || {}, username = String(b.username || '').trim().toLowerCase();
    if (!USERNAME.test(username)) return res.status(400).json({ error: 'Username: 2-32 letters, numbers, dots, dashes or underscores' });
    if (q.uByName.get(username)) return res.status(400).json({ error: 'That username is taken' });
    const role = USER_ROLES.includes(b.role) ? b.role : 'editor';
    q.uAdd.run(rid(6), username, String(b.name || username).trim().slice(0, 40) || username, role, Date.now());
    const nu = q.uByName.get(username);
    audit(req, 'person.invited', { target: `${nu.name} (@${nu.username})`, detail: `as ${role}`, refType: 'person', refId: nu.id });
    res.json({ link: await invite(req, nu), expiresDays: INVITE_TTL / DAY });
  });
  app.post('/api/users/reinvite', async (req, res) => {   // forgot password / lost phone: start over with a new link
    const u = q.uById.get(String((req.body || {}).id || ''));
    if (!u) return res.status(404).json({ error: 'Person not found' });
    if (u.id === me(req).id) return res.status(400).json({ error: 'Use “My account” to change your own sign-in' });
    if (u.role === 'admin' && u.totp_ok && q.uAdmins.get().n <= 1) return res.status(400).json({ error: 'Keep at least one admin' });
    q.uSetPw.run(null, u.id); q.uSetTotp.run(null, 0, u.id); q.pkDelUser.run(u.id); q.sDelUser.run(u.id);
    audit(req, 'person.reinvited', { target: `${u.name} (@${u.username})`, detail: 'password, authenticator, passkeys and sign-ins cleared; new invite link', refType: 'person', refId: u.id });
    res.json({ link: await invite(req, u), expiresDays: INVITE_TTL / DAY });
  });
  app.post('/api/users/update', (req, res) => {
    const b = req.body || {}, u = q.uById.get(String(b.id || ''));
    if (!u) return res.status(404).json({ error: 'Person not found' });
    const role = b.role === undefined ? u.role : USER_ROLES.includes(b.role) ? b.role : null;
    if (!role) return res.status(400).json({ error: 'Unknown role' });
    if (u.role === 'admin' && role !== 'admin' && u.totp_ok && q.uAdmins.get().n <= 1) return res.status(400).json({ error: 'Keep at least one admin' });
    q.uUpd.run(b.name === undefined ? u.name : String(b.name).trim().slice(0, 40) || u.name, role, u.id);
    if (role !== u.role) { audit(req, 'person.role', { target: `${u.name} (@${u.username})`, detail: `${u.role} → ${role}`, refType: 'person', refId: u.id }); if (role !== 'admin') db.prepare("DELETE FROM user_sessions WHERE user_id = ? AND kind = 'admin'").run(u.id); }
    res.json({ ok: true });
  });
  app.post('/api/users/signout', (req, res) => {   // lost tablet: end every sign-in for that person
    const u = q.uById.get(String((req.body || {}).id || ''));
    if (!u) return res.status(404).json({ error: 'Person not found' });
    q.sDelUser.run(u.id);
    audit(req, 'person.signed_out', { target: `${u.name} (@${u.username})`, detail: 'every sign-in ended', refType: 'person', refId: u.id });
    if (u.id === me(req).id) { clear(req, res, C.user); clear(req, res, C.admin); }
    res.json({ ok: true });
  });
  app.post('/api/users/remove', (req, res) => {
    const u = q.uById.get(String((req.body || {}).id || ''));
    if (!u) return res.status(404).json({ error: 'Person not found' });
    if (u.role === 'admin' && u.totp_ok && q.uAdmins.get().n <= 1) return res.status(400).json({ error: 'Keep at least one admin' });
    q.sDelUser.run(u.id); q.pkDelUser.run(u.id); q.iDelUser.run(u.id); q.uDel.run(u.id);
    audit(req, 'person.removed', { target: `${u.name} (@${u.username})`, detail: 'signed out everywhere, passkeys deleted' });
    res.json({ ok: true });
  });

  // ---- each person's sign-ins and passkeys: see them, end or remove one at a time ----
  const sessView = (s, mine) => ({ id: s.id, kind: s.kind, created: s.created, last_seen: s.last_seen, agent: s.agent, ip: s.ip, here: mine.includes(s.key_hash),
    expires: s.kind === 'edit' ? editExpires(s) : Math.min(s.last_seen + ADMIN_IDLE, s.created + ADMIN_MAX) });
  function editExpires(s) { const c = secCfg(), idle = s.last_seen + c.signinIdleDays * DAY; return c.signinMaxDays > 0 ? Math.min(idle, s.created + c.signinMaxDays * DAY) : idle; }
  app.get('/api/account/sessions', (req, res) => {
    const u = me(req); if (!u) return res.status(401).json({ error: 'Sign in first' });
    const mine = myKeys(req);
    res.json({ sessions: q.sList.all(u.id).map(s => sessView(s, mine)) });
  });
  app.post('/api/account/sessions/remove', (req, res) => {
    const u = me(req); if (!u) return res.status(401).json({ error: 'Sign in first' });
    const s = q.sById.get(+(req.body || {}).id || 0);
    if (s && s.user_id === u.id) { q.sDelId.run(s.id); audit(req, 'session.ended', { target: `${u.name} (@${u.username}) on ${s.agent} (${s.ip})` }); }
    res.json({ ok: true });
  });
  app.get('/api/users/:id', (req, res) => {
    const u = q.uById.get(String(req.params.id));
    if (!u) return res.status(404).json({ error: 'Person not found' });
    const mine = myKeys(req);
    res.json({ sessions: q.sList.all(u.id).map(s => sessView(s, mine)), passkeys: q.pkByUser.all(u.id) });
  });
  app.post('/api/users/sessions/remove', (req, res) => {
    const s = q.sById.get(+(req.body || {}).id || 0);
    if (!s) return res.status(404).json({ error: 'That sign-in already ended' });
    const u = q.uById.get(s.user_id);
    q.sDelId.run(s.id);
    audit(req, 'session.ended', { target: `${u ? u.name + ' (@' + u.username + ')' : 'someone'} on ${s.agent} (${s.ip})`, refType: 'person', refId: s.user_id });
    res.json({ ok: true });
  });
  app.post('/api/users/passkeys/remove', (req, res) => {
    const pk = q.pkGet.get(String((req.body || {}).id || ''));
    if (!pk) return res.status(404).json({ error: 'That passkey is already gone' });
    const u = q.uById.get(pk.user_id);
    q.pkDelAny.run(pk.id);
    audit(req, 'passkey.removed', { target: `“${pk.name}” of ${u ? u.name + ' (@' + u.username + ')' : 'someone'}`, refType: 'person', refId: pk.user_id });
    res.json({ ok: true });
  });

  // ---- 🛡 Security: things that need a look (each with what to do about it), settings, activity ----
  const days = t => Math.round((Date.now() - t) / DAY);
  const A = (label, call, body, confirm) => ({ label, call, body, confirm });
  function alerts() {
    const now = Date.now(), cfg = secCfg(), out = [];
    for (const d of q.dList.all()) if (cfg.screenFlagDays > 0 && now - d.last_seen > cfg.screenFlagDays * DAY) {
      out.push({ level: 'warn', kind: 'screen', text: `Screen “${d.name}” (${d.agent}) hasn’t been seen for ${days(d.last_seen)} days.` + (cfg.screenRemoveDays > 0 ? ` It’s removed automatically after ${cfg.screenRemoveDays}.` : ''),
        actions: [A('Remove screen', '/api/devices/remove', { id: d.id }, `Remove “${d.name}”?`)] });
    }
    for (const p of q.pkAll.all()) { const t = p.last_used || p.created; if (cfg.passkeyFlagDays > 0 && now - t > cfg.passkeyFlagDays * DAY) {
      out.push({ level: 'warn', kind: 'passkey', text: `Passkey “${p.name}” of ${p.uname} (@${p.username}) hasn’t been used for ${days(t)} days.`, actions: [A('Remove passkey', '/api/users/passkeys/remove', { id: p.id }, 'Remove this passkey?')] });
    } }
    for (const u of q.uList.all()) {
      if (!u.totp_ok) { out.push({ level: 'info', kind: 'person', text: `${u.name} (@${u.username}) hasn’t finished setting up${q.iForUser.get(u.id) ? ' (invite link still open)' : ''}.`, actions: [A('Remove', '/api/users/remove', { id: u.id }, `Remove ${u.name}?`)] }); continue; }
      const last = u.last_login || u.created;
      if (cfg.personFlagDays > 0 && now - last > cfg.personFlagDays * DAY) out.push({ level: 'warn', kind: 'person', text: `${u.name} (@${u.username}, ${u.role}) hasn’t signed in for ${days(last)} days.`, actions: [A('Sign out everywhere', '/api/users/signout', { id: u.id }), A('Remove', '/api/users/remove', { id: u.id }, `Remove ${u.name}?`)] });
    }
    for (const f of q.aFails.all(now - DAY)) if (f.n >= 3) {
      const u = q.uByName.get(f.target);
      out.push({ level: f.n >= 8 ? 'alert' : 'warn', kind: 'signin', text: `${f.n} failed sign-ins for “${f.target}” from ${f.ip} in the last 24 hours (last ${new Date(f.last).toLocaleString()}).` + (u ? '' : ' There’s no such account.'),
        actions: u ? [A('Sign out everywhere', '/api/users/signout', { id: u.id }), A('Start over (new invite link)', '/api/users/reinvite', { id: u.id }, `Clear ${u.name}’s password, authenticator and passkeys?`)] : [] });
    }
    return out;
  }
  function withActions(e) {   // log lines point at things that may still exist: offer what can be done
    const acts = [];
    if (e.ref_type === 'screen' && q.dById.get(e.ref_id)) acts.push(A('Remove screen', '/api/devices/remove', { id: e.ref_id }, 'Remove this screen?'));
    if (e.ref_type === 'session' && q.sById.get(+e.ref_id)) acts.push(A('End this sign-in', '/api/users/sessions/remove', { id: +e.ref_id }));
    if (e.ref_type === 'passkey' && q.pkGet.get(e.ref_id)) acts.push(A('Remove passkey', '/api/users/passkeys/remove', { id: e.ref_id }, 'Remove this passkey?'));
    if (e.ref_type === 'person' && /^(signin\.failed|person\.role|password\.changed|authenticator\.changed)$/.test(e.event) && q.uById.get(e.ref_id) && q.sByUser.get(e.ref_id).n) acts.push(A('Sign out everywhere', '/api/users/signout', { id: e.ref_id }));
    return { id: e.id, at: e.at, event: e.event, actor: e.actor, target: e.target, detail: e.detail, ip: e.ip, agent: e.agent, actions: acts };
  }
  app.get('/api/security', (req, res) => {
    const limit = Math.min(1000, Math.max(20, +req.query.limit || 200));
    res.json({ settings: secCfg(), defaults: SEC_DEFAULT, alerts: alerts(), log: q.aList.all(limit).map(withActions) });
  });
  app.post('/api/security/settings', (req, res) => {
    const b = req.body || {}, cur = secCfg(), out = {};
    for (const k of Object.keys(SEC_DEFAULT)) { const v = b[k] === undefined ? cur[k] : Math.round(+b[k]); out[k] = Number.isFinite(v) ? Math.min(3650, Math.max(0, v)) : cur[k]; }
    if (out.signinIdleDays < 1) out.signinIdleDays = 1;
    if (out.signinMaxDays && out.signinMaxDays < out.signinIdleDays) out.signinMaxDays = out.signinIdleDays;
    if (out.logDays < 7) out.logDays = 7;
    if (out.screenRemoveDays && out.screenRemoveDays < out.screenFlagDays) out.screenRemoveDays = out.screenFlagDays;
    q.kvSet.run('security', JSON.stringify(out));
    audit(req, 'security.settings', { detail: Object.keys(out).filter(k => out[k] !== cur[k]).map(k => `${k} ${cur[k]} → ${out[k]}`).join(', ') || 'no change' });
    cleanup();   // the new rules apply right away
    res.json(out);
  });

  // still allowed? (for open live-update streams: re-checked so a removed screen or ended sign-in stops getting updates)
  function stillAllowed(cookieHeader) {
    const fake = { _dev: undefined, get: h => (String(h).toLowerCase() === 'cookie' ? cookieHeader : ''), ip: '' };
    return rankOf(fake) > 0;
  }
  return { deviceOf, userOf, rankOf, resetAll, newSetupCode, describe, totpAt, cleanup, stillAllowed };
}

module.exports = { setup, describe, totpAt, b32dec };
