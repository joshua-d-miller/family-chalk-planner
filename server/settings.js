// Board settings saved from the admin console (⚙️ Board tab). They override the same names in .env,
// so a family never has to edit a file on the server. Applied at start-up: saving restarts the board.
//
// Passwords and client secrets are encrypted (AES-256-GCM) with a key that is NOT in the database:
// SECRET_KEY from the environment if set, otherwise data/secret.key (created on first use, mode 600).
// A copy of the database alone (a backup, a snapshot) therefore doesn't reveal them. If the key is
// lost, nothing breaks except those passwords: the console asks for them again.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FIELDS = {
  BOARD_TITLE: { type: 'text', max: 60 },
  TIMEZONE: { type: 'tz' },
  LATITUDE: { type: 'num', min: -90, max: 90 },
  LONGITUDE: { type: 'num', min: -180, max: 180 },
  TEMP_UNIT: { type: 'enum', values: ['fahrenheit', 'celsius'] },
  HOLIDAYS: { type: 'enum', values: ['us', 'ca', 'gb', 'none'] },
  WEEK_START: { type: 'enum', values: ['sunday', 'monday'] },
  TIME_FORMAT: { type: 'enum', values: ['12h', '24h'] },
  PHOTO_ALBUM_URL: { type: 'url' },
  CALENDAR_PROVIDER: { type: 'enum', values: ['caldav', 'google'] },
  CALDAV_URL: { type: 'url' },
  CALDAV_USER: { type: 'text', max: 200 },
  CALDAV_PASSWORD: { type: 'secret' },
  CALDAV_CALENDAR: { type: 'text', max: 200 },
  GOOGLE_CLIENT_ID: { type: 'text', max: 200 },
  GOOGLE_CLIENT_SECRET: { type: 'secret' },
  // more calendars on the same account, shown with their own color: [{ id, name, color }]
  // (id = the calendar's address for CalDAV, the calendar id for Google)
  EXTRA_CALENDARS: { type: 'json', check: v => list(v, c => typeof c.id === 'string' && c.id.length <= 400 && /^\S+$/.test(c.id) && name(c.name, 100) && hex(c.color)) },
  // read-only calendar links (iCal / ICS: school, sports, holidays): [{ name, url, color }]
  ICS_FEEDS: { type: 'json', check: v => list(v, c => name(c.name, 60) && hex(c.color) && /^(https?|webcal):\/\/[^\s"<>]+$/i.test(c.url || '') && c.url.length <= 1000) }
};
const hex = c => /^#[0-9a-fA-F]{6}$/.test(c || '');
const name = (n, max) => typeof n === 'string' && n.trim().length > 0 && n.length <= max && !/[\r\n<>]/.test(n);
function list(v, ok) {
  let a; try { a = JSON.parse(v); } catch { return 'not a list'; }
  if (!Array.isArray(a) || a.length > 8) return 'at most 8';
  return a.every(x => x && typeof x === 'object' && ok(x)) ? null : 'each needs a name, a color and a valid address';
}

function validTz(v) { try { new Intl.DateTimeFormat('en-US', { timeZone: v }); return true; } catch { return false; } }
function check(key, v) {
  const f = FIELDS[key]; if (!f) return 'unknown setting';
  v = String(v ?? '').trim();
  if (v === '') return null;   // empty = use .env / default
  if (/[\r\n\0]/.test(v)) return 'one line only';   // (json lists are sent as one line too)
  if (f.type === 'text' && v.length > f.max) return `at most ${f.max} characters`;
  if (f.type === 'json' && v.length > 20000) return 'too long';
  if (f.type === 'secret' && v.length > 500) return 'too long';
  if (f.type === 'tz' && !validTz(v)) return 'not a time zone (e.g. America/New_York)';
  if (f.type === 'num' && !(Number.isFinite(+v) && +v >= f.min && +v <= f.max)) return `a number from ${f.min} to ${f.max}`;
  if (f.type === 'enum' && !f.values.includes(v)) return `one of ${f.values.join(', ')}`;
  if (f.type === 'json') { const e = f.check(v); if (e) return e; }
  if (f.type === 'url') { try { const u = new URL(v); if (!/^https?:$/.test(u.protocol) || u.username || u.password) throw 0; } catch { return 'an http(s) address'; } }
  return null;
}

function setup({ db, DATA_DIR }) {
  db.exec('CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, data TEXT NOT NULL)');
  const fileEnv = {};   // what .env / the environment says, before the console's values
  for (const k of Object.keys(FIELDS)) if (process.env[k] !== undefined) fileEnv[k] = process.env[k];

  let keyCache = null;
  function key() {
    if (keyCache) return keyCache;
    if (process.env.SECRET_KEY) return (keyCache = crypto.createHash('sha256').update('fcp-settings:' + process.env.SECRET_KEY).digest());
    const f = path.join(DATA_DIR, 'secret.key');
    if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(32).toString('base64') + '\n', { mode: 0o600 });
    return (keyCache = crypto.createHash('sha256').update('fcp-settings:' + fs.readFileSync(f, 'utf8').trim()).digest());
  }
  const seal = v => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key(), iv); const ct = Buffer.concat([c.update(v, 'utf8'), c.final()]); return 'k1:' + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64'); };
  const open = s => { const b = Buffer.from(String(s).slice(3), 'base64'), d = crypto.createDecipheriv('aes-256-gcm', key(), b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28)); return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'); };

  const load = () => { const r = db.prepare("SELECT data FROM kv WHERE key = 'settings'").get(); try { return r ? JSON.parse(r.data) : {}; } catch { return {}; } };
  const store = s => db.prepare("INSERT INTO kv (key, data) VALUES ('settings', ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data").run(JSON.stringify(s));

  // apply: the console's values win over .env
  const saved = load(), lost = [];
  for (const [k, v] of Object.entries(saved)) {
    if (!FIELDS[k]) continue;
    if (FIELDS[k].type === 'secret') {
      try { process.env[k] = open(v); } catch { lost.push(k); }
    } else process.env[k] = String(v);
  }
  if (lost.length) console.error(`Chalk Planner: couldn't unlock ${lost.join(', ')} (secret.key / SECRET_KEY changed) - enter them again in the admin console`);

  function view() {
    const cur = load(), out = {};
    for (const [k, f] of Object.entries(FIELDS)) {
      const fromConsole = cur[k] !== undefined, fromEnv = fileEnv[k] !== undefined && fileEnv[k] !== '';
      out[k] = { type: f.type, values: f.values, source: fromConsole ? 'console' : fromEnv ? 'env' : 'default' };
      if (f.type === 'secret') out[k].set = (fromConsole && !lost.includes(k)) || fromEnv;   // never sent to the browser
      else { out[k].value = fromConsole ? cur[k] : ''; if (fromEnv) out[k].env = fileEnv[k]; }
    }
    return { fields: out, lost };
  }
  // values: {KEY: 'new value'}; an empty string removes the console's value (back to .env / default).
  // Secrets: leave out (or undefined) to keep; '' to remove.
  function save(values) {
    const cur = load(), errors = {}, changed = [];
    for (const [k, raw] of Object.entries(values || {})) {
      if (!FIELDS[k] || raw === undefined || raw === null) continue;
      const v = String(raw).trim(), e = check(k, v);
      if (e) { errors[k] = e; continue; }
      if (v === '') { if (cur[k] !== undefined) { delete cur[k]; changed.push(k); } continue; }
      if (FIELDS[k].type === 'secret') { cur[k] = seal(v); changed.push(k); }
      else if (cur[k] !== v) { cur[k] = FIELDS[k].type === 'num' ? String(+v) : v; changed.push(k); }
    }
    if (Object.keys(errors).length) return { errors };
    if (changed.length) store(cur);
    return { changed };
  }
  return { view, save, FIELDS, lost };
}

module.exports = { setup, FIELDS, check };
