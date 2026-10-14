// Board settings: all kept in the database and changed in the admin console (⚙️ Board). There is no
// settings file. Only where the board lives (PORT, BIND, DATA_DIR, BACKUP_DIR) is server-level, set
// by the installer in the service definition (or by Docker).
//
// An install from before 0.7 had a .env file: its settings are moved into the database on the first
// start (once), and after that the environment no longer decides any of these.
//
// Passwords, the Google client secret and anything that works like a password (the calendar account
// name, the photo album link, calendar links that carry a private token) are encrypted with AES-256-GCM
// using a key that is NOT in the database: SECRET_KEY if set, otherwise data/secret.key (mode 600,
// created on first use, copied into the nightly backup). A copy of the database alone reveals none of
// them. If the key is lost, the board keeps working and the console asks for those values again.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FIELDS = {
  // the board
  BOARD_TITLE: { type: 'text', max: 60 },
  TIMEZONE: { type: 'tz' },
  HOLIDAYS: { type: 'enum', values: ['us', 'ca', 'gb', 'none'] },
  WEEK_START: { type: 'enum', values: ['sunday', 'monday'] },
  TIME_FORMAT: { type: 'enum', values: ['12h', '24h'] },
  // weather
  LATITUDE: { type: 'num', min: -90, max: 90 },
  LONGITUDE: { type: 'num', min: -180, max: 180 },
  TEMP_UNIT: { type: 'enum', values: ['fahrenheit', 'celsius'] },
  // calendar
  CALENDAR_PROVIDER: { type: 'enum', values: ['caldav', 'google'] },
  CALDAV_URL: { type: 'url' },
  CALDAV_USER: { type: 'text', max: 200, private: true },
  CALDAV_PASSWORD: { type: 'secret' },
  CALDAV_CALENDAR: { type: 'text', max: 200 },
  GOOGLE_CLIENT_ID: { type: 'text', max: 200 },
  GOOGLE_CLIENT_SECRET: { type: 'secret' },
  GOOGLE_REDIRECT_URI: { type: 'url' },
  // more calendars on the same account, shown with their own color: [{ id, name, color }]
  // (id = the calendar's address for CalDAV, the calendar id for Google)
  EXTRA_CALENDARS: { type: 'json', check: v => list(v, c => typeof c.id === 'string' && c.id.length <= 400 && /^\S+$/.test(c.id) && name(c.name, 100) && hex(c.color)) },
  // read-only calendar links (iCal / ICS: school, sports, holidays): [{ name, url, color }]
  ICS_FEEDS: { type: 'json', private: true, check: v => list(v, c => name(c.name, 60) && hex(c.color) && /^(https?|webcal):\/\/[^\s"<>]+$/i.test(c.url || '') && c.url.length <= 1000) },
  // photos
  PHOTO_ALBUM_URL: { type: 'url', private: true },
  // the board on your network
  PUBLIC_URL: { type: 'url' },
  TRUST_PROXY: { type: 'proxy' },
  ALLOW_UNPAIRED_VIEW: { type: 'enum', values: ['true', 'false'] },
  UPDATE_CHANNEL: { type: 'enum', values: ['release', 'main'] },
  SOURCE_URL: { type: 'url' }
};
const hex = c => /^#[0-9a-fA-F]{6}$/.test(c || '');
const name = (n, max) => typeof n === 'string' && n.trim().length > 0 && n.length <= max && !/[\r\n<>]/.test(n);
function list(v, ok) {
  let a; try { a = JSON.parse(v); } catch { return 'not a list'; }
  if (!Array.isArray(a) || a.length > 8) return 'at most 8';
  return a.every(x => x && typeof x === 'object' && ok(x)) ? null : 'each needs a name, a color and a valid address';
}
// TRUST_PROXY: addresses / ranges of the reverse proxy, or Express's names for groups of them
const proxyOk = v => v.split(/\s*,\s*/).every(p => /^(loopback|linklocal|uniquelocal)$/.test(p) ||
  /^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/.test(p) || /^[0-9a-f:]+(\/\d{1,3})?$/i.test(p));

function validTz(v) { try { new Intl.DateTimeFormat('en-US', { timeZone: v }); return true; } catch { return false; } }
function check(key, v) {
  const f = FIELDS[key]; if (!f) return 'unknown setting';
  v = String(v ?? '').trim();
  if (v === '') return null;   // empty = the default
  if (/[\r\n\0]/.test(v)) return 'one line only';   // (json lists are sent as one line too)
  if (f.type === 'text' && v.length > f.max) return `at most ${f.max} characters`;
  if (f.type === 'json' && v.length > 20000) return 'too long';
  if (f.type === 'secret' && v.length > 500) return 'too long';
  if (f.type === 'tz' && !validTz(v)) return 'not a time zone (e.g. America/New_York)';
  if (f.type === 'num' && !(Number.isFinite(+v) && +v >= f.min && +v <= f.max)) return `a number from ${f.min} to ${f.max}`;
  if (f.type === 'enum' && !f.values.includes(v)) return `one of ${f.values.join(', ')}`;
  if (f.type === 'json') { const e = f.check(v); if (e) return e; }
  if (f.type === 'proxy' && (v.length > 300 || !proxyOk(v))) return 'an IP address (e.g. 192.168.1.10), a range (10.0.0.0/8), or several separated by commas';
  if (f.type === 'url') { try { const u = new URL(v); if (!/^https?:$/.test(u.protocol) || u.username || u.password) throw 0; } catch { return 'an http(s) address'; } }
  return null;
}
const sealed = f => f.type === 'secret' || f.private;

function setup({ db, DATA_DIR, log = console, importEnv = true }) {
  db.exec('CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, data TEXT NOT NULL)');

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
  const reveal = v => (String(v).startsWith('k1:') ? open(v) : String(v));   // values saved before they were encrypted are plain
  const kvGet = k => { const r = db.prepare('SELECT data FROM kv WHERE key = ?').get(k); try { return r ? JSON.parse(r.data) : null; } catch { return null; } };
  const kvSet = (k, v) => db.prepare('INSERT INTO kv (key, data) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data').run(k, JSON.stringify(v));
  const load = () => kvGet('settings') || {};
  const store = s => kvSet('settings', s);
  const keep = (k, v) => (sealed(FIELDS[k]) ? seal(v) : FIELDS[k].type === 'num' ? String(+v) : v);

  // ---- once: move an old .env's settings into the database ----
  let imported = kvGet('settings_imported');
  if (!imported && importEnv) {
    const cur = load(), moved = [], skipped = [];
    const legacy = { CALDAV_USER: 'ICLOUD_USER', CALDAV_PASSWORD: 'ICLOUD_APP_PASSWORD', CALDAV_CALENDAR: 'ICLOUD_CALENDAR' };
    for (const k of Object.keys(FIELDS)) {
      const v = String(process.env[k] ?? process.env[legacy[k]] ?? '').trim().replace(/^"(.*)"$/, '$1');
      if (!v || cur[k] !== undefined) continue;
      if (check(k, v)) { skipped.push(k); continue; }
      cur[k] = keep(k, v); moved.push(k);
    }
    if (moved.length) store(cur);
    imported = { at: Date.now(), moved, skipped };
    kvSet('settings_imported', imported);
    if (moved.length) log.log(`Chalk Planner: moved ${moved.length} setting(s) from the environment/.env into the admin console (${moved.join(', ')}). The .env file isn't needed any more.`);
    if (skipped.length) log.error(`Chalk Planner: these .env settings weren't valid and were left out: ${skipped.join(', ')} - set them in the admin console`);
  }

  // ---- apply: the database decides; nothing from the environment leaks through ----
  const saved = load(), lost = [];
  for (const k of Object.keys(FIELDS)) delete process.env[k];
  for (const k of Object.values({ a: 'ICLOUD_USER', b: 'ICLOUD_APP_PASSWORD', c: 'ICLOUD_CALENDAR' })) delete process.env[k];
  for (const [k, v] of Object.entries(saved)) {
    if (!FIELDS[k]) continue;
    try { process.env[k] = sealed(FIELDS[k]) ? reveal(v) : String(v); } catch { lost.push(k); }
  }
  if (lost.length) log.error(`Chalk Planner: couldn't unlock ${lost.join(', ')} (secret.key / SECRET_KEY changed) - enter them again in the admin console`);

  function view() {
    const cur = load(), out = {};
    for (const [k, f] of Object.entries(FIELDS)) {
      const has = cur[k] !== undefined && !lost.includes(k);
      out[k] = { type: f.type, values: f.values, source: has ? 'console' : 'default' };
      if (f.type === 'secret') out[k].set = has;   // never sent to the browser
      else out[k].value = !has ? '' : f.private ? reveal(cur[k]) : cur[k];
    }
    return { fields: out, lost, imported: imported && imported.moved && imported.moved.length ? imported : null };
  }
  // values: {KEY: 'new value'}; an empty string clears it (back to the default).
  // Secrets: leave out (or undefined) to keep; '' to remove.
  function save(values) {
    const cur = load(), errors = {}, changed = [];
    for (const [k, raw] of Object.entries(values || {})) {
      if (!FIELDS[k] || raw === undefined || raw === null) continue;
      const v = String(raw).trim(), e = check(k, v);
      if (e) { errors[k] = e; continue; }
      if (v === '') { if (cur[k] !== undefined) { delete cur[k]; changed.push(k); } continue; }
      const now = cur[k] === undefined ? undefined : sealed(FIELDS[k]) ? (() => { try { return reveal(cur[k]); } catch { return undefined; } })() : cur[k];
      if (FIELDS[k].type === 'secret' || now !== v) { cur[k] = keep(k, v); changed.push(k); }
    }
    if (Object.keys(errors).length) return { errors };
    if (changed.length) store(cur);
    return { changed };
  }
  // for the server's command line (deploy/setting.sh): read one value
  function get(k) { const cur = load(); if (!FIELDS[k] || cur[k] === undefined) return ''; return sealed(FIELDS[k]) ? reveal(cur[k]) : cur[k]; }
  return { view, save, get, FIELDS, lost };
}

module.exports = { setup, FIELDS, check };
