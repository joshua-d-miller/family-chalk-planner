// ---------------------------------------------------------------------------
// Family Chalk Planner: a chalkboard-style family wall calendar.
//  - Events: any CalDAV calendar (iCloud, Nextcloud, Fastmail...) - read + write
//  - Art, stamps, meal plan, jars, styles: SQLite in DATA_DIR
//  - Live: Server-Sent Events push changes to every open board (wall + tablet)
//
// Copyright (C) 2026 Joshua Miller. Licensed under the GNU AGPL v3 or later;
// see LICENSE. All settings come from the environment (see .env.example).
// ---------------------------------------------------------------------------
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

// ---- Settings: the environment (.env), overridden by what the admin console saved (server/settings.ts) ----
const ENV = process.env;
const num = (v, d) => (v === undefined || v === '' || !Number.isFinite(+v) ? d : +v);
const APP_DIR = path.join(__dirname, '..');
const DATA_DIR = ENV.DATA_DIR || path.join(APP_DIR, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'chalkboard.db'));
const boardSettings = require('./settings.ts').setup({ db, DATA_DIR, importEnv: !['--setting', '--reset-admin'].some(a => process.argv.includes(a)) });   // puts the console's values into ENV
// Command line, for the server's owner (deploy/setting.sh):  --setting get KEY  |  --setting set KEY VALUE
if (process.argv[2] === '--setting') {
  const [, , , op, k, v] = process.argv;
  if (op === 'get' && k) { console.log(boardSettings.get(k)); process.exit(0); }
  if (op === 'set' && k) {
    const r = boardSettings.save({ [k]: v ?? '' });
    if (r.errors) { console.error(`${k}: ${r.errors[k]}`); process.exit(1); }
    console.log(r.changed.length ? `${k} ${v ? 'saved' : 'cleared'} - restart the board to use it` : 'Nothing changed');
    process.exit(0);
  }
  console.error('Usage: --setting get KEY | --setting set KEY [VALUE]   (no VALUE clears it)'); process.exit(2);
}
const PORT = num(ENV.PORT, 3002);
const BIND = ENV.BIND || '0.0.0.0';
const TZ = ENV.TIMEZONE || ENV.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';   // else the server's own time zone
const LAT = num(ENV.LATITUDE, null), LON = num(ENV.LONGITUDE, null);   // weather is off until both are set
const TEMP_UNIT = ENV.TEMP_UNIT === 'celsius' ? 'celsius' : 'fahrenheit';
const TRASH_DAY = /^[0-6]$/.test(ENV.TRASH_DAY || '') ? +ENV.TRASH_DAY : null;   // 0 = Sunday ... 6 = Saturday; empty = off
const HOLIDAYS = ['us', 'ca', 'gb', 'none'].includes((ENV.HOLIDAYS || '').toLowerCase()) ? ENV.HOLIDAYS.toLowerCase() : 'us';
const WEEK_START = (ENV.WEEK_START || '').toLowerCase() === 'monday' ? 1 : 0;   // 0 = weeks start on Sunday
const TIME_24 = /^24/.test(ENV.TIME_FORMAT || '');
const jsonList = v => { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a.slice(0, 8) : []; } catch { return []; } };
const EXTRA_CALS = jsonList(ENV.EXTRA_CALENDARS);   // [{ id, name, color }] more calendars on the same account
const ICS_FEEDS = jsonList(ENV.ICS_FEEDS).map(f => ({ ...f, url: String(f.url || '').replace(/^webcal:/i, 'https:') }));   // read-only links
const BOARD_TITLE = String(ENV.BOARD_TITLE || 'Family Chalk Planner').slice(0, 60);
// AGPL: people using the board can get its source. Point this at your fork if you change the code.
const SOURCE_URL = /^https?:\/\/[^\s"<>]+$/.test(ENV.SOURCE_URL || '') ? ENV.SOURCE_URL : 'https://github.com/joshua-d-miller/family-chalk-planner';
const ICLOUD_USER = ENV.CALDAV_USER || ENV.ICLOUD_USER;            // ICLOUD_* names still work
const ICLOUD_PASS = ENV.CALDAV_PASSWORD || ENV.ICLOUD_APP_PASSWORD;
const CAL_NAME = ENV.CALDAV_CALENDAR || ENV.ICLOUD_CALENDAR;
// Calendar provider: any CalDAV server (iCloud, Nextcloud, Fastmail...) with a password,
// or Google Calendar (Google's CalDAV with a Google sign-in instead of a password).
const PROVIDER = (ENV.CALENDAR_PROVIDER || (ENV.GOOGLE_CLIENT_ID ? 'google' : 'caldav')).toLowerCase() === 'google' ? 'google' : 'caldav';
const G = {
  id: ENV.GOOGLE_CLIENT_ID || '', secret: ENV.GOOGLE_CLIENT_SECRET || '',
  redirect: ENV.GOOGLE_REDIRECT_URI || 'http://localhost',   // default: paste the address back (works without HTTPS)
  auth: ENV.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth',
  token: ENV.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token',
  api: ENV.GOOGLE_API_BASE || 'https://www.googleapis.com',
  dav: ENV.GOOGLE_CALDAV_BASE || 'https://apidata.googleusercontent.com'
};
if (PROVIDER === 'google' && !G.id) console.error('Chalk Planner: CALENDAR_PROVIDER=google but GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set');
if (PROVIDER === 'caldav' && (!ICLOUD_USER || !ICLOUD_PASS || !CAL_NAME)) {
  console.error('Chalk Planner: CALDAV_USER / CALDAV_PASSWORD / CALDAV_CALENDAR are not set - no calendar events');
}
const CALDAV_URL = ENV.CALDAV_URL || 'https://caldav.icloud.com/';

// ---------------------------------------------------------------------------
// Art database
// ---------------------------------------------------------------------------
for (const f of ['chalkboard.db', 'chalkboard.db-wal', 'chalkboard.db-shm']) { try { fs.chmodSync(path.join(DATA_DIR, f), 0o600); } catch { /* not there yet */ } }
try { const ck = Object.values(db.prepare('PRAGMA quick_check').get() || {})[0]; if (ck !== 'ok') console.error(`Chalk Planner: DATABASE CHECK FAILED (${ck}) - restore last night's snapshot from the backup folder`); } catch (e) { console.error('Chalk Planner: database check failed:', e.message); }
// SQLite: one file, WAL so the wall can read while a tablet writes; wait instead of failing if busy.
// The database holds account data too, so it's readable by the service only.
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA busy_timeout = 5000;
  CREATE TABLE IF NOT EXISTS strokes (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    month   TEXT    NOT NULL,
    data    TEXT    NOT NULL,
    created INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS strokes_month ON strokes(month);
  CREATE TABLE IF NOT EXISTS stamps (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    name    TEXT    NOT NULL,
    data    TEXT    NOT NULL,
    created INTEGER NOT NULL
  );
`);
db.exec(`CREATE TABLE IF NOT EXISTS month_meta (month TEXT PRIMARY KEY, data TEXT NOT NULL)`);
db.exec(`CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, data TEXT NOT NULL)`);
const qKvGet = db.prepare('SELECT data FROM kv WHERE key = ?');
const qKvSet = db.prepare('INSERT INTO kv (key, data) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data');
const qMetaGet = db.prepare('SELECT data FROM month_meta WHERE month = ?');
const qMetaSet = db.prepare('INSERT INTO month_meta (month, data) VALUES (?, ?) ON CONFLICT(month) DO UPDATE SET data = excluded.data');
db.exec('DROP TABLE IF EXISTS sessions');   // PIN sign-ins of older versions
const qStampList = db.prepare('SELECT id, name, data FROM stamps ORDER BY id DESC');
const qStampAdd = db.prepare('INSERT INTO stamps (name, data, created) VALUES (?, ?, ?)');
const qStampDel = db.prepare('DELETE FROM stamps WHERE id = ?');
const qStrokes = db.prepare('SELECT id, data FROM strokes WHERE month = ? ORDER BY id');
const qInsert = db.prepare('INSERT INTO strokes (month, data, created) VALUES (?, ?, ?)');
const qLastId = db.prepare('SELECT MAX(id) AS id FROM strokes WHERE month = ?');
const qDelete = db.prepare('DELETE FROM strokes WHERE id = ?');
const qClear = db.prepare('DELETE FROM strokes WHERE month = ?');
const qDelOne = db.prepare('DELETE FROM strokes WHERE id = ? AND month = ?');
const qRestore = db.prepare('INSERT OR IGNORE INTO strokes (id, month, data, created) VALUES (?, ?, ?, ?)');
const qUpdate = db.prepare('UPDATE strokes SET data = ? WHERE id = ? AND month = ?');
const qArtCount = db.prepare('SELECT COUNT(*) AS n FROM strokes WHERE month = ?');

// ---------------------------------------------------------------------------
// Date helpers (everything shown in TIMEZONE): server/dates.ts
// ---------------------------------------------------------------------------
const dates = require('./dates.ts');
const clock = dates.makeClock({ timeZone: TZ, time24: TIME_24, weekStart: WEEK_START, southern: LAT !== null && LAT < 0 });
const nyParts = clock.zoned;
const { addDays } = dates;

// ---------------------------------------------------------------------------
// The calendar (server/calendar/): CalDAV (iCloud, Nextcloud, Fastmail...) or Google, more calendars
// on the same account, read-only calendar links; the routes are registered further down
// ---------------------------------------------------------------------------
const google = require('./calendar/google.ts').createGoogle(G, DATA_DIR);
const { caldavCalendars, createCalendarSource } = require('./calendar/source.ts');
const calendar = createCalendarSource({
  provider: PROVIDER, caldavUrl: CALDAV_URL, user: ICLOUD_USER, password: ICLOUD_PASS, calendarName: CAL_NAME,
  extraCalendars: EXTRA_CALS, feeds: ICS_FEEDS
}, clock, google);
const calProblems = calendar.problems;

// ---------------------------------------------------------------------------
// Weather and trash day (top of the Notes column): server/extras.ts, set up below
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Live updates (Server-Sent Events)
// ---------------------------------------------------------------------------
const live = require('./live.ts').createLive();
const broadcast = live.broadcast;

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json({ limit: '2mb' }));
// NPM sits in front; trust it (and other private-range proxies) for the client address
app.set('trust proxy', process.env.TRUST_PROXY || 'loopback, uniquelocal');

// ---------------------------------------------------------------------------
// Who may do what: paired screens (view / family) and signed-in people (editor / admin),
// plus the admin console. See server/access.js.
// ---------------------------------------------------------------------------
const access = require('./access').setup(app, { db, DATA_DIR, ENV, BOARD_TITLE, broadcast });
if (process.argv.includes('--reset-admin')) {   // deploy/reset-admin.sh
  console.log(`Removed every person, sign-in and paired screen. New setup code: ${access.resetAll()}`);
  console.log('Open /admin on a tablet or computer, enter the code and create the admin again; then pair the screens.');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Nightly snapshot of the database (consistent copy while running) for restic
// ---------------------------------------------------------------------------
const BACKUP_DIR = ENV.BACKUP_DIR || path.join(DATA_DIR, 'backup');   // snapshots, the key, and uploads (media/)
const backup = require('./backup.ts').setup({ db, dataDir: DATA_DIR, backupDir: BACKUP_DIR, secretFromEnv: !!ENV.SECRET_KEY, today: clock.today });
const keyInfo = backup.keyInfo;

const { isYm, isDate } = dates;

app.get('/api/today', (req, res) => {
  const t = nyParts(new Date());
  res.json({ today: t.dateStr, ym: t.dateStr.slice(0, 7) });
});

require('./extras.ts').setup({
  app, broadcast, today: clock.today, trashDay: TRASH_DAY,
  kvGet: k => { const r = qKvGet.get(k); return r ? JSON.parse(r.data) : null; },
  kvSet: (k, v) => qKvSet.run(k, JSON.stringify(v)),
  weather: { lat: LAT, lon: LON, unit: TEMP_UNIT, timeZone: TZ, base: ENV.WEATHER_URL || 'https://api.open-meteo.com' }
});

// ---------------------------------------------------------------------------
// Holidays (server/holidays.ts): worked out here, shown on the board only, any can be hidden
// ---------------------------------------------------------------------------
const holidays = require('./holidays.ts').setup({
  app, country: HOLIDAYS, broadcast, today: clock.today,
  kvGet: k => { const r = qKvGet.get(k); return r ? JSON.parse(r.data) : null; },
  kvSet: (k, v) => qKvSet.run(k, JSON.stringify(v))
});

// The calendar's routes (server/calendar/routes.ts, google.ts)
require('./calendar/google.ts').registerGoogleRoutes(app, {
  google, enabled: PROVIDER === 'google', broadcast, calendarChanged: () => calendar.reset()
});
require('./calendar/routes.ts').registerCalendarRoutes({
  app, source: calendar, clock, broadcast, holidays, showHolidays: HOLIDAYS !== 'none',
  kvGet: k => { const r = qKvGet.get(k); return r ? JSON.parse(r.data) : null; },
  kvSet: (k, v) => qKvSet.run(k, JSON.stringify(v)),
  status: () => {
    if (PROVIDER === 'google') {
      const st = google.load();
      return { provider: 'google', configured: !!G.id, connected: !!st.refresh, calendar: st.calendarName || null,
        problem: st.refresh ? null : st.problem || null, paste: !/\/oauth\/google\/callback$/.test(G.redirect), redirect: G.redirect };
    }
    return { provider: 'caldav', configured: !!(ICLOUD_USER && ICLOUD_PASS && CAL_NAME), calendar: CAL_NAME || null, problems: Object.fromEntries(calProblems) };
  }
});

app.get('/api/art', (req, res) => {
  if (!isYm(req.query.ym)) return res.status(400).json({ error: 'bad month' });
  res.json(qStrokes.all(req.query.ym).map(r => ({ id: r.id, ...JSON.parse(r.data) })));
});

// Art items: strokes {c, w, p:[x,y,...]} or text {k:'t', x, y, s, f, z, c}; m:true = Posca paint, else chalk
const HEX = /^#[0-9a-fA-F]{6}$/;
function cleanItem(it) {
  if (!it || typeof it !== 'object') return null;
  const c = HEX.test(it.c) ? it.c : '#EDEAE0';
  if (it.k === 'g') {   // GIF / animated sticker
    const okSrc = v => typeof v === 'string' && /^\/api\/(media\/[a-z0-9]{16}\.(gif|webp|png|jpg)|anim\/[0-9a-f_]{2,48}\/(gif|svg)|clip\/[a-z0-9-]{1,64}\.svg)$/.test(v);
    if (!okSrc(it.src)) return null;
    const x = +it.x, y = +it.y;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const g = {
      k: 'g', src: it.src, still: okSrc(it.still) ? it.still : it.src,
      x: Math.round(x), y: Math.round(y),
      w: Math.min(Math.max(Math.round(+it.w) || 80, 16), 700), h: Math.min(Math.max(Math.round(+it.h) || 80, 16), 700),
      mode: ['gentle', 'loop', 'still'].includes(it.mode) ? it.mode : 'gentle'
    };
    if (typeof it.g === 'string' && /^[a-z0-9]{1,16}$/.test(it.g)) g.g = it.g;
    return g;
  }
  if (it.k === 't') {
    const s = String(it.s || '').replace(/\r/g, '').slice(0, 160);
    if (!s.trim()) return null;
    const x = +it.x, y = +it.y;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const t = {
      k: 't', s, c,
      x: Math.round(Math.min(Math.max(x, 0), 1252)), y: Math.round(Math.min(Math.max(y, 0), 642)),
      f: Math.min(Math.max(Math.trunc(+it.f) || 0, 0), 7),
      z: Math.min(Math.max(Math.round(+it.z) || 40, 12), 120)
    };
    if (it.m) t.m = true;
    if (typeof it.g === 'string' && /^[a-z0-9]{1,16}$/.test(it.g)) t.g = it.g;
    return t;
  }
  if (!Array.isArray(it.p) || it.p.length < 2 || it.p.length > 20000) return null;
  const st = {
    c,
    w: Math.min(Math.max(+it.w || 4, 1), 60),
    e: !!it.e,
    p: it.p.map(n => Math.round((+n || 0) * 2) / 2)
  };
  if (it.m) st.m = true;
  if (HEX.test(it.fc)) st.fc = it.fc;   // fill color for closed shapes
  if (typeof it.g === 'string' && /^[a-z0-9]{1,16}$/.test(it.g)) st.g = it.g;   // group: placed together, moves together
  return st;
}

// Art is placed on the calendar as it looks at the time. A holiday border makes the days a little smaller,
// so each month remembers which layout its art was placed on (artPad: the border's width, 0 = none); the
// tablet moves the art onto the days when the border changes (/api/art/relayout).
const BORDER_PAD = { s: 26, m: 32, l: 40 };   // picture size + 6 (the board's BORDER_SZ)
const padOf = m => (m && m.border ? BORDER_PAD[m.border.size] || BORDER_PAD.m : 0);
function storedMeta(ym) { const row = qMetaGet.get(ym); return row ? JSON.parse(row.data) : {}; }
function noteArtLayout(ym) {   // the first art of a month is placed on the layout it has now
  const cur = storedMeta(ym);
  if (cur.artPad !== undefined || qArtCount.get(ym).n) return;
  cur.artPad = padOf(metaFor(ym)); qMetaSet.run(ym, JSON.stringify(cur));
}

app.post('/api/art', (req, res) => {
  const { ym, stroke, from } = req.body || {};
  const clean = cleanItem(stroke);
  if (!isYm(ym) || !clean) return res.status(400).json({ error: 'bad stroke' });
  noteArtLayout(ym);
  const info = qInsert.run(ym, JSON.stringify(clean), Date.now());
  const id = Number(info.lastInsertRowid);
  broadcast('stroke', { ym, from, stroke: { id, ...clean } });
  res.json({ id });
});

// Move / re-word / restyle items in place: {items:[{id,...}]} (or legacy {id, stroke})
app.post('/api/art/update', (req, res) => {
  const { ym, from } = req.body || {};
  let list = req.body && req.body.items;
  if (!list && req.body && req.body.stroke) list = [{ ...req.body.stroke, id: req.body.id }];
  if (!isYm(ym) || !Array.isArray(list)) return res.status(400).json({ error: 'bad update' });
  const done = [];
  for (const it of list.slice(0, 5000)) {
    const clean = cleanItem(it);
    if (!clean || !Number.isInteger(it.id)) continue;
    qUpdate.run(JSON.stringify(clean), it.id, ym);
    done.push({ id: it.id, ...clean });
  }
  broadcast('update', { ym, from, items: done });
  res.json({ ok: true });
});

// Several new items at once (stamp placement, copy)
app.post('/api/art/bulk', (req, res) => {
  const { ym, items, from } = req.body || {};
  if (!isYm(ym) || !Array.isArray(items) || items.length > 5000) return res.status(400).json({ error: 'bad items' });
  noteArtLayout(ym);
  const ids = [], added = [];
  for (const it of items) {
    const clean = cleanItem(it);
    if (!clean) { ids.push(null); continue; }
    const id = Number(qInsert.run(ym, JSON.stringify(clean), Date.now()).lastInsertRowid);
    ids.push(id); added.push({ id, ...clean });
  }
  broadcast('restore', { ym, from, items: added });
  res.json({ ids });
});

// Undo of an erase/wipe: put items back with their original ids (keeps layering)
app.post('/api/art/restore', (req, res) => {
  const { ym, items, from } = req.body || {};
  if (!isYm(ym) || !Array.isArray(items)) return res.status(400).json({ error: 'bad restore' });
  noteArtLayout(ym);
  const back = [];
  for (const it of items.slice(0, 5000)) {
    const clean = cleanItem(it);
    if (!clean || !Number.isInteger(it.id)) continue;
    qRestore.run(it.id, ym, JSON.stringify(clean), Date.now());
    back.push({ id: it.id, ...clean });
  }
  broadcast('restore', { ym, from, items: back });
  res.json({ ok: true, restored: back.length });
});

// Eraser: remove whole strokes / text items
app.post('/api/art/delete', (req, res) => {
  const { ym, ids } = req.body || {};
  if (!isYm(ym) || !Array.isArray(ids)) return res.status(400).json({ error: 'bad delete' });
  const list = ids.filter(Number.isInteger).slice(0, 5000);
  for (const id of list) qDelOne.run(id, ym);
  broadcast('remove', { ym, ids: list });
  res.json({ ok: true });
});

app.post('/api/art/undo', (req, res) => {
  const ym = (req.body || {}).ym;
  if (!isYm(ym)) return res.status(400).json({ error: 'bad month' });
  const row = qLastId.get(ym);
  if (row && row.id) {
    qDelete.run(row.id);
    broadcast('undo', { ym, id: row.id });
  }
  res.json({ ok: true });
});

app.post('/api/art/clear', (req, res) => {
  const ym = (req.body || {}).ym;
  if (!isYm(ym)) return res.status(400).json({ error: 'bad month' });
  qClear.run(ym);
  const cur = storedMeta(ym);
  if (cur.artPad !== undefined) { delete cur.artPad; qMetaSet.run(ym, JSON.stringify(cur)); }
  broadcast('clear', { ym });
  res.json({ ok: true });
});

// The border changed: the tablet sends the month's art moved onto the new layout. Done once, by whichever
// screen gets there first ({padFrom, padTo} must match what the server has; 409 = already done).
app.post('/api/art/relayout', (req, res) => {
  const { ym, padFrom, padTo, items, from } = req.body || {};
  if (!isYm(ym) || !Array.isArray(items) || items.length > 5000) return res.status(400).json({ error: 'bad relayout' });
  const cur = storedMeta(ym);
  if ((cur.artPad || 0) !== padFrom || padOf(metaFor(ym)) !== padTo) return res.status(409).json({ error: 'The art was already moved', artPad: cur.artPad || 0 });
  const done = [];
  db.exec('BEGIN');
  try {
    for (const it of items) {
      const clean = cleanItem(it);
      if (!clean || !Number.isInteger(it.id)) continue;
      if (qUpdate.run(JSON.stringify(clean), it.id, ym).changes) done.push({ id: it.id, ...clean });
    }
    cur.artPad = padTo; qMetaSet.run(ym, JSON.stringify(cur));
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  broadcast('update', { ym, from, items: done });
  broadcast('meta', { ym, meta: metaFor(ym) });
  res.json({ ok: true, artPad: padTo, moved: done.length });
});

// Per-month options, e.g. {hideTitle:true} when you hand-letters the month name
// Meal plan: one simple list for "the week", not tied to a month
app.get('/api/meals', (req, res) => {
  const row = qKvGet.get('meals');
  res.json(row ? JSON.parse(row.data) : { items: [] });
});

app.post('/api/meals', (req, res) => {
  const list = (req.body || {}).items;
  if (!Array.isArray(list)) return res.status(400).json({ error: 'bad list' });
  const items = list.slice(0, 14).map(it => ({ t: String((it && it.t) || '').trim().slice(0, 60), done: !!(it && it.done) })).filter(it => it.t);
  const meals = { items, updated: Date.now() };
  qKvSet.run('meals', JSON.stringify(meals));
  broadcast('meals', meals);
  res.json(meals);
});

// Board style ("theme"): a preset name plus your per-part tweaks. The presets
// themselves live in the page; the server only checks the shape of what's saved.
const THEME_FONTS = ['kalam', 'caveat', 'marker', 'pacifico', 'chalk', 'tall', 'scratchy', 'script', 'classic'];
const THEME_KEYS = {
  numF: 'font', numC: 'color', boxes: ['on', 'off'], todayC: 'color', todayS: ['ring', 'circle', 'heart', 'star', 'box'],
  wkF: 'font', wkC: 'color', evF: 'font', evC: 'color', alldayC: 'color', holC: 'color',
  headF: 'font', notesC: 'color', mealsC: 'color', textF: 'font', textC: 'color',
  lineC: 'color', lineS: ['solid', 'dashed', 'dotted'], lineW: ['thin', 'normal', 'bold']
};
const THEME_SURFACES = ['slate', 'green', 'blue', 'cork', 'kraft', 'white', 'wood', 'glass', 'linen', 'peg'];
function cleanTheme(t) {
  const out = { p: typeof t?.p === 'string' && /^[a-z]{2,20}$/.test(t.p) ? t.p : 'classic', o: {} };
  if (THEME_SURFACES.includes(t?.s) && t.s !== 'slate') out.s = t.s;   // board background
  if (t?.z === 1 || t?.z === true) out.z = 1;                            // "change with the season" (off by default)
  for (const [k, v] of Object.entries((t && t.o) || {})) {
    const kind = THEME_KEYS[k];
    if (kind === 'color' ? /^#[0-9a-fA-F]{6}$/.test(v) : kind === 'font' ? THEME_FONTS.includes(v) : Array.isArray(kind) && kind.includes(v)) out.o[k] = v;
  }
  return out;
}
app.get('/api/theme', (req, res) => {
  const r = qKvGet.get('theme');
  res.json(r ? JSON.parse(r.data) : { p: 'classic', o: {} });
});
app.post('/api/theme', (req, res) => {
  const t = cleanTheme(req.body || {});
  qKvSet.run('theme', JSON.stringify(t));
  broadcast('theme', t);
  res.json(t);
});

// Typed month title style: font, color, outline (or none), size
function cleanTitle(t) {
  if (!t || typeof t !== 'object') return null;
  const hex = v => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : null);
  return {
    f: Math.min(Math.max(Math.trunc(+t.f) || 0, 0), 7),
    c: hex(t.c) || '#F6B3CB',
    o: hex(t.o),                                   // null = no outline
    z: [56, 68, 80, 90].includes(+t.z) ? +t.z : 68   // S M L XL
  };
}
function metaFor(ym) {
  const row = qMetaGet.get(ym);
  const m = row ? JSON.parse(row.data) : {};
  const d = qKvGet.get('titleDefault');
  if (d) m.defaultTitle = JSON.parse(d.data);
  // border: this month's own, else the one saved for this month every year ({ off: true } = none this year)
  const yearly = yearlyBorders()[ym.slice(5)];
  m.artPad = m.artPad || 0;   // art from before borders: placed with no border
  if (m.border && m.border.off) delete m.border;
  else if (!m.border && yearly) { m.border = yearly; m.borderYearly = true; }
  return m;
}

// Holiday borders around the calendar: up to 8 pictures (clipart or chalk drawings) repeated around the edge
function yearlyBorders() { const r = qKvGet.get('borders'); return r ? JSON.parse(r.data) : {}; }
function cleanBorder(b) {
  if (!b || typeof b !== 'object' || !Array.isArray(b.items)) return null;
  const f = fluentSet(), g = giSet();
  const items = [...new Set(b.items.filter(n => typeof n === 'string' && /^[a-z0-9-]{1,64}$/.test(n) && (n.startsWith('gi-') ? g.ok.has(n.slice(3)) : f.icons[n])))].slice(0, 8);
  if (!items.length) return null;
  return { items, color: /^#[0-9a-fA-F]{6}$/.test(b.color || '') ? b.color.toUpperCase() : CHALK, size: ['s', 'm', 'l'].includes(b.size) ? b.size : 'm' };
}
// { ym, border: {...} or null, yearly: true = every year in this month }
app.post('/api/border', (req, res) => {
  const { ym, border, yearly } = req.body || {};
  if (!isYm(ym)) return res.status(400).json({ error: 'bad month' });
  const b = cleanBorder(border);
  if (border && !b) return res.status(400).json({ error: 'Pick at least one picture' });
  const row = qMetaGet.get(ym), cur = row ? JSON.parse(row.data) : {}, all = yearlyBorders(), mm = ym.slice(5);
  if (yearly) {
    if (b) all[mm] = b; else delete all[mm];
    delete cur.border;   // this month follows the yearly one
  } else if (b) cur.border = b;
  else cur.border = all[mm] ? { off: true } : undefined;   // none this month, even if there's a yearly one
  if (cur.border === undefined) delete cur.border;
  qKvSet.run('borders', JSON.stringify(all));
  qMetaSet.run(ym, JSON.stringify(cur));
  broadcast('meta', { ym: '*' });
  res.json(metaFor(ym));
});

// Reward jars: one per kid, filled from the iPad (the wall is read-only)
const PIECES = ['heart', 'rainbow', 'star', 'bolt', 'critter'];
const DEFAULT_JARS = [];   // jars are optional; add them from the tablet
function getJars() { const r = qKvGet.get('jars'); return r ? JSON.parse(r.data) : DEFAULT_JARS; }
app.get('/api/jars', (req, res) => res.json(getJars()));

// Chores: the family's checklist (server/chores.ts)
const chores = require('./chores.ts').setup({
  app, broadcast, weekStart: WEEK_START,
  kvGet: k => { const r = qKvGet.get(k); return r ? JSON.parse(r.data) : null; },
  kvSet: (k, v) => qKvSet.run(k, JSON.stringify(v)),
  today: () => nyParts(new Date()).dateStr,
  kidOf: req => access.kidOf(req), who: req => access.whoOf(req)
});
// items: what's actually in the jar, in the order it went in (a kid can ask for a particular piece).
// Kept the same length as count; anything missing is filled in the usual rotation of the jar's pieces.
function jarItems(items, count, pieces) {
  const out = (Array.isArray(items) ? items.filter(p => PIECES.includes(p)) : []).slice(0, count);
  while (out.length < count) out.push(pieces[out.length % pieces.length]);
  return out;
}
app.post('/api/jars', (req, res) => {
  const list = (req.body || {}).jars;
  if (!Array.isArray(list)) return res.status(400).json({ error: 'bad jars' });
  const before = Object.fromEntries(getJars().map(j => [j.id, j]));
  const jars = list.slice(0, 4).map((j, i) => {
    const id = /^[a-z0-9]{1,16}$/.test(j && j.id) ? j.id : `jar${i}`;
    let pieces = (Array.isArray(j.pieces) ? j.pieces.filter(p => PIECES.includes(p)) : []).slice(0, 5);
    if (!pieces.length) pieces = ['star'];
    const count = Math.min(Math.max(Math.round(+j.count) || 0, 0), 200);
    // a page from before 0.9 doesn't send items: keep what was already in that jar
    const items = jarItems(Array.isArray(j.items) ? j.items : before[id] && before[id].items, count, pieces);
    return { id, name: String((j && j.name) || 'Jar').trim().slice(0, 14) || 'Jar', pieces, count, items, goal: Math.min(Math.max(Math.round(+j.goal) || 20, 3), 100) };
  });
  qKvSet.run('jars', JSON.stringify(jars));
  broadcast('jars', { jars });
  res.json(jars);
});

app.get('/api/meta', (req, res) => {
  if (!isYm(req.query.ym)) return res.status(400).json({ error: 'bad month' });
  res.json(metaFor(req.query.ym));
});

// What goes beside the month title: photos (random, or the ones chosen) or art (no photos)
function cleanSide(v) {
  if (!v || typeof v !== 'object') return undefined;
  const mode = v.mode === 'art' ? 'art' : 'photos';
  const ids = (Array.isArray(v.ids) ? v.ids : []).filter(id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(id)).slice(0, 8);
  return { mode, pick: v.pick === 'chosen' && ids.length ? 'chosen' : 'random', ids };   // 'art' keeps the picks for when photos come back
}
app.post('/api/meta', (req, res) => {
  const { ym, hideTitle, title, makeDefault, side } = req.body || {};
  if (!isYm(ym)) return res.status(400).json({ error: 'bad month' });
  const row = qMetaGet.get(ym);
  const cur = row ? JSON.parse(row.data) : {};
  const meta = { hideTitle: hideTitle === undefined ? !!cur.hideTitle : !!hideTitle };
  if (cur.border) meta.border = cur.border;   // set separately (/api/border)
  if (cur.artPad !== undefined) meta.artPad = cur.artPad;   // set with the art (/api/art/relayout)
  const t = title === undefined ? cur.title : cleanTitle(title);
  if (t) meta.title = t;
  const sd = side === undefined ? cur.side : side === null ? undefined : cleanSide(side);   // null = back to the usual setting
  if (sd) meta.side = sd;
  if (makeDefault && t) { qKvSet.run('titleDefault', JSON.stringify(t)); delete meta.title; }
  qMetaSet.run(ym, JSON.stringify(meta));
  if (makeDefault) broadcast('meta', { ym: '*' });
  else broadcast('meta', { ym, meta: metaFor(ym) });
  res.json(metaFor(ym));
});

// ---------------------------------------------------------------------------
// More clipart: Tabler Icons (MIT license, https://tabler.io/icons) - about 5,000
// line drawings. Downloaded once from the npm CDN, cached on disk, searched here.
// Brand logos are left out (trademarks).
// ---------------------------------------------------------------------------
const TABLER_VER = '3.49.0';
const CLIP_DIR = path.join(DATA_DIR, 'clipart-cache');
let tabler = null, tablerLoading = null;
async function loadTabler() {
  if (tabler) return tabler;
  if (tablerLoading) return tablerLoading;
  tablerLoading = (async () => {
    fs.mkdirSync(CLIP_DIR, { recursive: true });
    const get = async name => {
      const file = path.join(CLIP_DIR, `${TABLER_VER}-${name}`);
      if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
      const r = await fetch(`https://cdn.jsdelivr.net/npm/@tabler/icons@${TABLER_VER}/${name}`, { signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error(`Clipart download failed (${r.status})`);
      const text = await r.text();
      fs.writeFileSync(file, text);
      return JSON.parse(text);
    };
    const [meta, nodes] = await Promise.all([get('icons.json'), get('tabler-nodes-outline.json')]);
    const list = [];
    for (const [name, m] of Object.entries(meta)) {
      if (!nodes[name] || m.category === 'Brand' || name.startsWith('brand-')) continue;
      list.push({ name, words: [name.replace(/-/g, ' '), (m.tags || []).join(' '), (m.category || '')].join(' ').toLowerCase(), nodes: nodes[name] });
    }
    tabler = list;
    return list;
  })().finally(() => { tablerLoading = null; });
  return tablerLoading;
}

app.get('/api/clipart/search', async (req, res) => {
  const q = String(req.query.q || '').toLowerCase().trim().slice(0, 40);
  if (!q) return res.json({ items: [] });
  try {
    const list = await loadTabler();
    const terms = q.split(/\s+/);
    const scored = [];
    for (const it of list) {
      if (!terms.every(t => it.words.includes(t))) continue;
      if (it.name.endsWith('-off') && !q.includes('off')) continue;   // crossed-out variants
      // name matches first, then tag matches; skip "-off" variants unless asked
      let score = it.name.includes(terms[0]) ? 0 : 1;
      if (it.name.endsWith('-off') && !q.includes('off')) score += 5;
      scored.push([score, it]);
    }
    scored.sort((a, b) => a[0] - b[0] || a[1].name.length - b[1].name.length);
    res.json({ items: scored.slice(0, 60).map(([, it]) => ({ name: it.name, nodes: it.nodes })), total: scored.length });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// GIFs
//  - your own uploads: stored in backup/media (inside the synced backup folder,
//    so they ride along to OneDrive with everything else)
//  - animated emoji: Noto Animated Emoji (Google, CC BY 4.0), fetched once and
//    served from here so the wall never depends on the internet to show one
// ---------------------------------------------------------------------------
const MEDIA_DIR = path.join(BACKUP_DIR, 'media');   // your uploads ride along with the backups
const ANIM_DIR = path.join(CLIP_DIR, 'anim');
const MAGIC = [
  ['gif', b => b.slice(0, 6).toString('latin1').startsWith('GIF8')],
  ['png', b => b.readUInt32BE(0) === 0x89504e47],
  ['jpg', b => b[0] === 0xff && b[1] === 0xd8],
  ['webp', b => b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP']
];
const MIME = { gif: 'image/gif', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml' };

app.post('/api/media', express.raw({ type: () => true, limit: '10mb' }), (req, res) => {
  const buf = req.body;
  if (!Buffer.isBuffer(buf) || buf.length < 16) return res.status(400).json({ error: 'No image received' });
  const kind = (MAGIC.find(([, test]) => test(buf)) || [])[0];
  if (!kind) return res.status(400).json({ error: 'That file isn’t a GIF, PNG, JPEG or WebP' });
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  const file = `${crypto.randomBytes(8).toString('hex')}.${kind}`;
  fs.writeFileSync(path.join(MEDIA_DIR, file), buf);
  res.json({ src: `/api/media/${file}` });
});

// "Add from link": paste a link to a GIF (or a GIPHY / Tenor / KLIPY page) and the board downloads it once
// and keeps it with your uploads, so it works offline and never depends on that site later.
// The board only fetches public internet addresses: never anything on your own network (no SSRF).
const dnsMod = require('node:dns'), netMod = require('node:net'), httpMod = require('node:http'), httpsMod = require('node:https');
const LINK_MAX = 10 * 1024 * 1024;
const ALLOW_PRIVATE_LINKS = ENV.ALLOW_PRIVATE_LINKS === '1';   // tests only (the mock sites run on 127.0.0.1)
function privateIp(ip) {
  if (netMod.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19));
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return privateIp(v.slice(7));
  return v === '::' || v === '::1' || /^(fc|fd|fe[89ab]|ff)/.test(v);
}
function safeLookup(host, opts, cb) {
  dnsMod.lookup(host, { ...opts, all: true }, (err, addrs) => {
    if (err) return cb(err);
    if (!addrs.length || (!ALLOW_PRIVATE_LINKS && addrs.some(a => privateIp(a.address)))) return cb(new Error('That link points at a private network address'));
    if (opts.all) cb(null, addrs); else cb(null, addrs[0].address, addrs[0].family);
  });
}
function linkGet(url, hops = 0) {
  return new Promise((resolve, reject) => {
    let u; try { u = new URL(url); } catch { return reject(new Error('That isn’t a link')); }
    if (!/^https?:$/.test(u.protocol) || u.username || u.password) return reject(new Error('Only http(s) links work'));
    if (u.port && !['80', '443'].includes(u.port) && !ALLOW_PRIVATE_LINKS) return reject(new Error('Only normal web links work'));
    const host = u.hostname.replace(/^\[|\]$/g, '');
    if (netMod.isIP(host) && privateIp(host) && !ALLOW_PRIVATE_LINKS) return reject(new Error('That link points at a private network address'));
    const req = (u.protocol === 'https:' ? httpsMod : httpMod).get(u, {
      lookup: safeLookup, timeout: 15000,
      headers: { 'User-Agent': 'FamilyChalkPlanner/1 (+link import)', Accept: 'image/gif,image/webp,image/*;q=0.9,text/html;q=0.8' }
    }, r => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
        r.resume();
        if (hops >= 4) return reject(new Error('Too many redirects'));
        return resolve(linkGet(new URL(r.headers.location, u).href, hops + 1));
      }
      if (r.statusCode !== 200) { r.resume(); return reject(new Error(`The site answered ${r.statusCode}`)); }
      if (+r.headers['content-length'] > LINK_MAX) { r.destroy(); return reject(Object.assign(new Error('That GIF is over 10 MB'), { big: true })); }
      const parts = []; let n = 0;
      r.on('data', c => { n += c.length; if (n > LINK_MAX) { r.destroy(); reject(Object.assign(new Error('That GIF is over 10 MB'), { big: true })); } else parts.push(c); });
      r.on('end', () => resolve({ buf: Buffer.concat(parts), type: String(r.headers['content-type'] || ''), url: u.href }));
      r.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('The site took too long')));
    req.on('error', reject);
  });
}
// a GIPHY page or media link -> its id (GIPHY pages are built by script, so read the id from the link)
function giphyId(u) {
  const m = /giphy\.com\/(?:gifs|stickers|clips|embed)\/(?:[\w-]*-)?([A-Za-z0-9]{8,40})(?:[/?#]|$)/.exec(u) || /giphy\.com\/media\/(?:v1\.[^/]+\/)?([A-Za-z0-9]{8,40})\//.exec(u) || /i\.giphy\.com\/(?:media\/)?([A-Za-z0-9]{8,40})/.exec(u);
  return m && m[1];
}
function pageImage(html, base) {
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map(t => t[0]);
  const val = (want) => {
    for (const t of metas) {
      const key = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(t), c = /content\s*=\s*["']([^"']+)["']/i.exec(t);
      if (key && c && want.includes(key[1].toLowerCase())) { try { return new URL(c[1].replace(/&amp;/g, '&'), base).href; } catch {} }
    }
    return null;
  };
  const all = metas.map(t => /content\s*=\s*["']([^"']+\.(?:gif|webp)(?:\?[^"']*)?)["']/i.exec(t)).filter(Boolean).map(m => m[1].replace(/&amp;/g, '&'));
  return all.find(x => /\.gif/i.test(x)) || val(['og:image', 'twitter:image', 'og:image:url']) || all[0] || null;
}
async function imageFromLink(link) {
  const gid = giphyId(link);
  // GIPHY: the 200-pixel copy is plenty for the board and far lighter for the wall (originals can be 7 MB+)
  const tries = gid ? [`https://media.giphy.com/media/${gid}/200.gif`, `https://media.giphy.com/media/${gid}/giphy.gif`] : [link];
  let got, lastErr;
  for (const t of tries) { try { got = await linkGet(t); break; } catch (e) { lastErr = e; } }
  if (!got) throw lastErr;
  let kind = (MAGIC.find(([, test]) => got.buf.length > 16 && test(got.buf)) || [])[0];
  if (!kind && /html/i.test(got.type)) {   // a web page: take the picture it shares
    const img = pageImage(got.buf.toString('utf8', 0, 2e6), got.url);
    if (!img) throw new Error('No GIF found on that page — try “Copy image address” / “Copy GIF link”');
    if (giphyId(img)) return imageFromLink(img);
    got = await linkGet(img);
    kind = (MAGIC.find(([, test]) => got.buf.length > 16 && test(got.buf)) || [])[0];
  }
  if (!kind) throw new Error('That link isn’t a GIF, PNG, JPEG or WebP');
  return { buf: got.buf, kind };
}
const linkTries = new Map();
app.post('/api/media/fromlink', async (req, res) => {
  const link = String((req.body || {}).url || '').trim().slice(0, 2000);
  const now = Date.now(), t = (linkTries.get(req.ip) || []).filter(x => now - x < 60e3); t.push(now); linkTries.set(req.ip, t);
  if (t.length > 20) return res.status(429).json({ error: 'Too many links at once — wait a minute' });
  try {
    const { buf, kind } = await imageFromLink(link);
    fs.mkdirSync(MEDIA_DIR, { recursive: true });
    const file = `${crypto.randomBytes(8).toString('hex')}.${kind}`;
    fs.writeFileSync(path.join(MEDIA_DIR, file), buf);
    res.json({ src: `/api/media/${file}` });
  } catch (e) {
    res.status(400).json({ error: e.message || 'That link didn’t work' });
  }
});

app.get('/api/media/:file', (req, res) => {
  const m = /^([a-z0-9]{16})\.(gif|webp|png|jpg)$/.exec(req.params.file);
  if (!m) return res.sendStatus(404);
  res.set('Cache-Control', 'public, max-age=31536000, immutable').type(MIME[m[2]]);
  res.sendFile(path.join(MEDIA_DIR, req.params.file), err => { if (err && !res.headersSent) res.sendStatus(404); });
});

// Tidy-up: uploaded/linked pictures that nothing uses any more (not on any month, not in the GIF library,
// not in a stamp) and are over 30 days old are removed once a day, so backups don't grow forever.
function mediaInUse() {
  const used = new Set(), grab = t => { for (const m of String(t).matchAll(/\/api\/media\/([a-z0-9]{16}\.(?:gif|webp|png|jpg))/g)) used.add(m[1]); };
  for (const r of db.prepare("SELECT data FROM strokes WHERE data LIKE '%/api/media/%'").all()) grab(r.data);
  for (const r of db.prepare("SELECT data FROM stamps WHERE data LIKE '%/api/media/%'").all()) grab(r.data);
  for (const r of db.prepare("SELECT data FROM kv WHERE data LIKE '%/api/media/%'").all()) grab(r.data);
  for (const r of db.prepare("SELECT data FROM month_meta WHERE data LIKE '%/api/media/%'").all()) grab(r.data);
  return used;
}
function cleanMedia(maxAgeDays = 30) {
  let removed = 0;
  try {
    if (!fs.existsSync(MEDIA_DIR)) return 0;
    const used = mediaInUse(), cutoff = Date.now() - maxAgeDays * 86400e3;
    for (const f of fs.readdirSync(MEDIA_DIR)) {
      if (!/^[a-z0-9]{16}\.(gif|webp|png|jpg)$/.test(f) || used.has(f)) continue;
      const full = path.join(MEDIA_DIR, f);
      if (fs.statSync(full).mtimeMs < cutoff) { fs.unlinkSync(full); removed++; }
    }
    if (removed) console.log(`Chalkboard: removed ${removed} unused picture(s) from media`);
  } catch (e) { console.error('Chalkboard: media tidy-up failed:', e.message); }
  return removed;
}
setTimeout(cleanMedia, 60e3).unref();
setInterval(cleanMedia, 24 * 3600e3).unref();
if (ENV.NODE_ENV === 'test') app.post('/api/test/clean-media', (req, res) => res.json({ removed: cleanMedia(+req.body.days || 0) }));

// Your GIF library (what you have uploaded)
const gifList = () => { const r = qKvGet.get('gifs'); return r ? JSON.parse(r.data) : []; };
app.get('/api/gifs', (req, res) => res.json(gifList()));
app.post('/api/gifs/add', (req, res) => {
  const { src, still, w, h } = req.body || {};
  const ok = v => typeof v === 'string' && /^\/api\/media\/[a-z0-9]{16}\.(gif|webp|png|jpg)$/.test(v);
  if (!ok(src)) return res.status(400).json({ error: 'bad gif' });
  const list = gifList();
  const item = { id: crypto.randomBytes(6).toString('hex'), src, still: ok(still) ? still : src, w: Math.min(Math.max(+w || 100, 1), 4000), h: Math.min(Math.max(+h || 100, 1), 4000) };
  list.unshift(item);
  qKvSet.run('gifs', JSON.stringify(list.slice(0, 200)));
  res.json(item);
});
app.post('/api/gifs/delete', (req, res) => {
  const id = (req.body || {}).id;
  qKvSet.run('gifs', JSON.stringify(gifList().filter(g => g.id !== id)));
  res.json({ ok: true });   // files stay, in case a GIF on some month still uses it
});

// Clipart: Fluent Emoji (flat) by Microsoft, MIT - installed with the board (npm), so it works offline.
// /api/clip/list = every name; /api/clip/<name>.svg = one picture.
let fluent = null;
function fluentSet() {
  if (!fluent) {
    const j = require('@iconify-json/fluent-emoji-flat/icons.json');
    const icons = { ...j.icons };
    for (const [a, v] of Object.entries(j.aliases || {})) if (icons[v.parent]) icons[a] = icons[v.parent];
    fluent = { icons, w: j.width || 32, h: j.height || 32, names: Object.keys(icons).filter(n => /^[a-z0-9-]{1,64}$/.test(n)).sort() };
  }
  return fluent;
}
// Chalk drawings: a hand-picked, family-friendly part of Game Icons (game-icons.net, CC BY 3.0) - one-color
// silhouettes drawn in any color. Named "gi-<name>", and "gi-<name>--<rrggbb>" for a color (default chalk white).
const GI_GROUPS = {
  'Halloween': 'pumpkin pumpkin-lantern pumpkin-mask witch-face witch-flight mummy-head vampire-dracula female-vampire frankenstein-creature floating-ghost ghost bat moon-bats spider-web cobweb hanging-spider cauldron magic-broom broom tombstone candle-light candles cat owl moon skeleton wizard-face pointy-hat',
  'Fall & Thanksgiving': 'corn cornucopia acorn wheat scarecrow pilgrim-hat pumpkin falling-leaf maple-leaf oak-leaf chestnut-leaf curled-leaf oak sunflower shiny-apple pie-slice mushroom-gills mushrooms squirrel hedgehog barn-owl',
  'Winter & Christmas': 'snowman snowflake-1 snowflake-2 present gingerbread-man ringing-bell pine-tree candy-canes star-formation sparkles winter-hat igloo penguin polar-bear',
  'Spring & Easter': 'easter-egg rabbit rabbit-head flower-pot daisy butterfly bee ladybug clover shamrock rainbow-star umbrella sprout seedling bird-house',
  'Summer': 'sun sunrise beach-ball beach-bucket palm-tree watermelon ice-cream-cone ice-cream-scoop sailboat firework-rocket balloons kite crab',
  'Party & love': 'cake-slice cupcake balloons party-popper present crown trophy-cup medal hearts heart-bottle love-letter',
  'Animals': 'cat dog-house horse-head cow pig sheep rooster chicken duck turtle frog unicorn dinosaur-rex elephant-head lion bear-head owl'
};
let gi = null;
function giSet() {
  if (!gi) {
    const j = require('@iconify-json/game-icons/icons.json'), groups = {}, ok = new Set();
    for (const [g, s] of Object.entries(GI_GROUPS)) groups[g] = s.split(' ').filter(n => j.icons[n] && ok.add(n)).map(n => 'gi-' + n);
    gi = { icons: j.icons, w: j.width || 512, h: j.height || 512, ok, groups };
  }
  return gi;
}
const CHALK = '#EDEAE0';
function giSvg(name) {   // "gi-pumpkin" or "gi-pumpkin--f2d479"
  const m = /^gi-([a-z0-9]+(?:-[a-z0-9]+)*?)(?:--([0-9a-f]{6}))?$/.exec(name);
  if (!m) return null;
  const g = giSet(); if (!g.ok.has(m[1])) return null;
  const i = g.icons[m[1]], col = m[2] ? '#' + m[2] : CHALK;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${i.width || g.w} ${i.height || g.h}" width="256" height="256" color="${col}">${i.body.replace(/fill="#000"/g, 'fill="currentColor"').replace(/fill="#fff"/g, 'fill="none"')}</svg>`;
}
app.get('/api/clip/list', (req, res) => {
  try { res.set('Cache-Control', 'public, max-age=86400').json(fluentSet().names.concat(...Object.values(giSet().groups))); } catch (e) { res.status(500).json({ error: 'Clipart isn’t installed (run npm ci)' }); }
});
app.get('/api/clip/drawings', (req, res) => {
  try { res.set('Cache-Control', 'public, max-age=86400').json(giSet().groups); } catch (e) { res.status(500).json({ error: 'Clipart isn’t installed (run npm ci)' }); }
});
app.get('/api/clip/:name.svg', (req, res) => {
  if (req.params.name.startsWith('gi-')) {
    let svg; try { svg = /^[a-z0-9-]{1,64}$/.test(req.params.name) && giSvg(req.params.name); } catch (e) { return res.sendStatus(500); }
    if (!svg) return res.sendStatus(404);
    return res.set('Cache-Control', 'public, max-age=31536000, immutable').type('image/svg+xml').send(svg);
  }
  let f; try { f = fluentSet(); } catch (e) { return res.sendStatus(500); }
  const i = /^[a-z0-9-]{1,64}$/.test(req.params.name) && f.icons[req.params.name];
  if (!i) return res.sendStatus(404);
  res.set('Cache-Control', 'public, max-age=31536000, immutable').type('image/svg+xml')
    .send(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${i.left || 0} ${i.top || 0} ${i.width || f.w} ${i.height || f.h}" width="256" height="256">${i.body}</svg>`);
});

// Animated emoji index + cached files
let animIndex = null;
app.get('/api/anim/list', async (req, res) => {
  try {
    if (!animIndex) {
      fs.mkdirSync(CLIP_DIR, { recursive: true });
      const file = path.join(CLIP_DIR, 'noto-anim-api.json');
      let data;
      if (fs.existsSync(file)) data = JSON.parse(fs.readFileSync(file, 'utf8'));
      else {
        const r = await fetch('https://googlefonts.github.io/noto-emoji-animation/data/api.json', { signal: AbortSignal.timeout(30000) });
        if (!r.ok) throw new Error(`Animated emoji list download failed (${r.status})`);
        const text = await r.text(); fs.writeFileSync(file, text); data = JSON.parse(text);
      }
      animIndex = (data.icons || []).filter(i => /^[0-9a-f_]{2,48}$/.test(i.codepoint))
        .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
        .map(i => ({ cp: i.codepoint, tags: (i.tags || []).join(' ').replace(/:/g, '').replace(/-/g, ' '), cat: (i.categories || [])[0] || '' }));
    }
    res.json(animIndex);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});
app.get('/api/anim/:cp/:kind', async (req, res) => {
  const { cp, kind } = req.params;
  if (!/^[0-9a-f_]{2,48}$/.test(cp) || !['gif', 'svg'].includes(kind)) return res.sendStatus(404);
  const file = path.join(ANIM_DIR, `${cp}.${kind}`);
  try {
    if (!fs.existsSync(file)) {
      const r = await fetch(`https://fonts.gstatic.com/s/e/notoemoji/latest/${cp}/${kind === 'gif' ? '512.gif' : 'emoji.svg'}`, { signal: AbortSignal.timeout(20000) });
      if (!r.ok) return res.sendStatus(404);
      fs.mkdirSync(ANIM_DIR, { recursive: true });
      fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
    }
    res.set('Cache-Control', 'public, max-age=31536000, immutable').type(MIME[kind]).sendFile(file);
  } catch (e) {
    res.sendStatus(502);
  }
});

// Stamp library: saved designs you can place again on any month
app.get('/api/stamps', (req, res) => {
  res.json(qStampList.all().map(r => ({ id: r.id, name: r.name, items: JSON.parse(r.data) })));
});

app.post('/api/stamps', (req, res) => {
  const { name, items } = req.body || {};
  const nm = String(name || '').trim().slice(0, 40);
  if (!nm || !Array.isArray(items) || !items.length || items.length > 5000) return res.status(400).json({ error: 'Give it a name and pick something to save' });
  const clean = items.map(cleanItem).filter(Boolean);
  if (!clean.length) return res.status(400).json({ error: 'Nothing to save' });
  const id = Number(qStampAdd.run(nm, JSON.stringify(clean), Date.now()).lastInsertRowid);
  res.json({ id });
});

app.post('/api/stamps/delete', (req, res) => {
  const id = (req.body || {}).id;
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad id' });
  qStampDel.run(id);
  res.json({ ok: true });
});

live.serve(app, { version: () => boardVersion(), stillAllowed: ck => access.stillAllowed(ck) });

// ---------------------------------------------------------------------------
// Photos: a shared album feeds the photos beside the month name and the
// overnight slideshow. PHOTO_ALBUM_URL = the album's share link, either
//  - an iCloud Shared Album (link sharing, "anyone with the link"), read the way
//    Apple's own web page reads it (CloudKit, no Apple ID login), or
//  - a Google Photos shared album (Share -> Create link), read the way Google's
//    own album page reads it (no Google sign-in).
// Neither is an official API, so either company could change it without notice.
// Every photo is copied into photo-cache/ so the wall never waits on the album.
// ---------------------------------------------------------------------------
const PHOTO_DIR = path.join(DATA_DIR, 'photo-cache');
// Face finding (optional): OpenCV's YuNet model run by face/facefocus.py in its
// own Python venv. Each photo is checked once; the result sits next to it as
// <id>.json so the board can frame people instead of cropping the middle.
const FACE_DIR = ENV.FACE_DIR || path.join(APP_DIR, 'face');
const FACE_PY = process.env.FACE_PYTHON || path.join(FACE_DIR, 'venv', 'bin', 'python');
const faceReady = () => [FACE_PY, path.join(FACE_DIR, 'facefocus.py'), path.join(FACE_DIR, 'yunet.onnx')].every(f => fs.existsSync(f));
function findFaces(files) {
  return new Promise(resolve => {
    if (!files.length || !faceReady()) return resolve([]);
    require('child_process').execFile(FACE_PY, [path.join(FACE_DIR, 'facefocus.py'), path.join(FACE_DIR, 'yunet.onnx'), ...files],
      { timeout: 10 * 60 * 1000, maxBuffer: 4 << 20 }, (err, stdout) => {
        if (err && !stdout) console.error('Face finder:', err.message);
        resolve(String(stdout || '').split('\n').map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean));
      });
  });
}
const PHOTO_URL = (process.env.PHOTO_ALBUM_URL || '').trim();
const PHOTO_KIND = /^https:\/\/(photos\.app\.goo\.gl|goo\.gl\/photos|photos\.google\.com\/(u\/\d+\/)?share)\//i.test(PHOTO_URL) || process.env.PHOTO_GOOGLE_HOST ? 'google' : 'icloud';
const GP_HOST = process.env.PHOTO_GOOGLE_HOST || 'https://photos.google.com';   // override only for testing
const GP_UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', 'Accept-Language': 'en' };
const CK = 'database/1/com.apple.photos.cloud/production';
const CK_HOST = process.env.PHOTO_CK_HOST || 'https://ckdatabasews.icloud.com';   // override only for testing
const photoState = { list: [], synced: 0, error: null, running: false };
const PHOTO_CFG_DEFAULT = { frame: true, night: true, from: '21:00', to: '06:00', every: 20, dim: 50 };
function photoCfg() {
  const r = qKvGet.get('photoCfg');
  return { ...PHOTO_CFG_DEFAULT, ...(r ? JSON.parse(r.data) : {}) };
}
{ const r = qKvGet.get('photos'); if (r) photoState.list = JSON.parse(r.data); }

async function ckPost(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`iCloud said ${r.status}`);
  return r.json();
}

// Apple's records -> [{id, url, w, h, date}], newest first.
// CPLAsset = the photo in the album (date, hidden, edits); CPLMaster = the
// file, with ready-made JPEG versions. resJPEGMedRes is ~2048 px and already
// upright, the right size for the wall. Videos are skipped.
function photoAssets(records) {
  const masters = new Map(records.filter(r => r.recordType === 'CPLMaster' && !r.deleted && r.fields).map(r => [r.recordName, r.fields]));
  const out = [], seen = new Set();
  for (const r of records) {
    if (r.recordType !== 'CPLAsset' || r.deleted || !r.fields) continue;
    const f = r.fields, v = k => (f[k] ? f[k].value : undefined);
    if (v('isHidden') || v('isDeleted') || v('trashReason')) continue;
    const m = masters.get(((f.masterRef || {}).value || {}).recordName);
    if (!m) continue;
    if (/movie|mpeg|video/i.test(String((m.itemType || {}).value))) continue;
    // an edited photo carries its own rendered JPEG; otherwise use the master's
    // small JPEG/PNG originals get no resized copy from Apple, so use the original itself
    const origOk = /^public\.(jpeg|png)$/.test(String((m.resOriginalFileType || {}).value)) && ((m.resOriginalRes || {}).value || {}).size < 20e6;
    const pick = [[f, 'resJPEGMedRes', 'resJPEGMed'], [f, 'resJPEGFullRes', 'resJPEGFull'], [m, 'resJPEGMedRes', 'resJPEGMed'], [m, 'resJPEGFullRes', 'resJPEGFull']]
      .concat(origOk ? [[m, 'resOriginalRes', 'resOriginal']] : [])
      .find(([src, k]) => src[k] && src[k].value && src[k].value.downloadURL);
    if (!pick) continue;
    const [src, k, p] = pick;
    const same = (src[k].value.fileChecksum || '') + '|' + (f.masterRef.value.recordName || '');
    if (seen.has(same) || seen.has(src[k].value.fileChecksum)) continue;   // the same picture added twice shows once
    seen.add(same); if (src[k].value.fileChecksum) seen.add(src[k].value.fileChecksum);
    out.push({
      id: crypto.createHash('sha1').update(r.recordName + '|' + (src[k].value.fileChecksum || '')).digest('hex').slice(0, 24),
      url: src[k].value.downloadURL.replace('${f}', 'photo.jpg'),
      w: (src[p + 'Width'] || {}).value || 0,
      h: (src[p + 'Height'] || {}).value || 0,
      date: v('assetDate') || v('addedDate') || 0
    });
  }
  return out.sort((a, b) => b.date - a.date);
}

// Google Photos shared album -> [{id, url, w, h, date}], newest first.
// Each item is [itemId, [imageUrl, w, h, ...], takenMs, hash, ?, addedMs, ..., {extra}].
// Image URLs take size options: "=w2048-h2048" = fit inside 2048 px, already upright.
function gpItems(items) {
  const out = [];
  for (const e of items || []) {
    if (!Array.isArray(e) || typeof e[0] !== 'string' || !Array.isArray(e[1]) || typeof e[1][0] !== 'string') continue;
    const extra = e.find(x => x && typeof x === 'object' && !Array.isArray(x)) || {};
    if ('76647426' in extra) continue;   // a video
    const [url, w, h] = e[1];
    out.push({ id: 'g' + crypto.createHash('sha1').update(e[0]).digest('hex').slice(0, 23), url: url + '=w2048-h2048', w: +w || 0, h: +h || 0, date: +e[2] || +e[5] || 0 });
  }
  return out;
}
async function googleAlbum() {
  const page = await fetch(PHOTO_URL.replace(/^https:\/\/photos\.google\.com/i, GP_HOST), { headers: GP_UA, redirect: 'follow', signal: AbortSignal.timeout(30000) });
  if (page.status === 404) throw new Error('Google Photos album not found - check the link, and that link sharing is on');
  if (!page.ok) throw new Error(`Google Photos said ${page.status}`);
  const html = await page.text();
  const at = new URL(page.url), id = (/\/share\/([\w-]{10,})/.exec(at.pathname) || [])[1], key = at.searchParams.get('key');
  if (!id || !key) throw new Error('That Google Photos link doesn’t open a shared album (Share -> Create link)');
  // first page is in the page itself; later pages come from the same call Google's page makes
  let items = [], next = null;
  const m = /AF_initDataCallback\(\{key: 'ds:1'[\s\S]*?data:([\s\S]*?), sideChannel: \{\}\}\);<\/script>/.exec(html);
  if (m) { try { const d = JSON.parse(m[1]); items = d[1] || []; next = d[2] || null; } catch { /* fall through to the call below */ } }
  const rpc = async token => {
    const body = new URLSearchParams({ 'f.req': JSON.stringify([[['snAcKc', JSON.stringify([id, token, null, key])]]]) });
    const r = await fetch(`${GP_HOST}/_/PhotosUi/data/batchexecute`, { method: 'POST', headers: { ...GP_UA, 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body, signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`Google Photos said ${r.status}`);
    const list = JSON.parse((await r.text()).replace(/^\)\]\}'/, ''));
    const hit = list.find(x => Array.isArray(x) && x[1] === 'snAcKc');
    if (!hit || !hit[2]) throw new Error('Google Photos sent something unexpected (it may have changed how albums work)');
    const d = JSON.parse(hit[2]);
    return { items: d[1] || [], next: d[2] || null };
  };
  if (!m) ({ items, next } = await rpc(null));
  for (let i = 0; next && i < 40; i++) { const p = await rpc(next); items = items.concat(p.items); next = p.next; }
  return gpItems(items).sort((a, b) => b.date - a.date);
}
async function icloudAlbum() {
  const guid = (/\/album\/([A-Za-z0-9_-]{10,})/.exec(PHOTO_URL) || [])[1];
  if (!guid) throw new Error('PHOTO_ALBUM_URL doesn’t look like an iCloud or Google Photos shared album link');
  {
    const res = (await ckPost(`${CK_HOST}/${CK}/public/records/resolve?remapEnums=true`, { shortGUIDs: [{ value: guid, shouldFetchRootRecord: true }] })).results[0];
    if (!res || !res.anonymousPublicAccess) throw new Error('album isn’t shared by link (set “anyone with the link”)');
    const part = String(res.anonymousPublicAccess.databasePartition || '');
    const host = /^https:\/\/[a-z0-9-]+\.icloud\.com(:443)?$/.test(part) ? part.replace(/:443$/, '') : CK_HOST;
    const qs = `?remapEnums=true&sharing_url_key=${encodeURIComponent(guid)}&publicAccessAuthToken=${encodeURIComponent(res.anonymousPublicAccess.token)}`;
    let records = [], syncToken, more = true;
    for (let i = 0; more && i < 50; i++) {
      const z = (await ckPost(`${host}/${CK}/shared/changes/zone${qs}`, { zones: [{ zoneID: res.zoneID, ...(syncToken ? { syncToken } : {}) }] })).zones[0];
      records = records.concat(z.records || []);
      syncToken = z.syncToken; more = z.moreComing;
    }
    return photoAssets(records);
  }
}
// only download from the album service's own image hosts
const photoHostOk = u => (PHOTO_KIND === 'google'
  ? !!process.env.PHOTO_GOOGLE_HOST || /^https:\/\/lh\d\.googleusercontent\.com\//.test(u)
  : !!process.env.PHOTO_CK_HOST || /^https:\/\/[a-z0-9.-]+\.(icloud-content\.com|icloud\.com)\//.test(u));
const isJpegPng = b => b.length > 8 && ((b[0] === 0xff && b[1] === 0xd8) || b.readUInt32BE(0) === 0x89504e47);
async function getImage(url) {
  const r = await fetch(url, { headers: PHOTO_KIND === 'google' ? { ...GP_UA, Accept: 'image/jpeg,image/png' } : {}, signal: AbortSignal.timeout(60000) });
  if (!r.ok) return null;
  let buf = Buffer.from(await r.arrayBuffer());
  if (!isJpegPng(buf) && PHOTO_KIND === 'google' && !url.endsWith('-rj')) return getImage(url + '-rj');   // ask Google for JPEG explicitly
  return isJpegPng(buf) ? buf : null;   // JPEG or PNG only (the wall can't show HEIC)
}

async function syncPhotos() {
  if (!PHOTO_URL || photoState.running) return;
  photoState.running = true;
  try {
    const assets = PHOTO_KIND === 'google' ? await googleAlbum() : await icloudAlbum();
    fs.mkdirSync(PHOTO_DIR, { recursive: true });
    for (const a of assets) {
      const file = path.join(PHOTO_DIR, `${a.id}.jpg`);
      if (fs.existsSync(file)) continue;
      if (!photoHostOk(a.url)) continue;
      const buf = await getImage(a.url);
      if (!buf) continue;
      fs.writeFileSync(file + '.part', buf);
      fs.renameSync(file + '.part', file);
    }
    const have = assets.filter(a => fs.existsSync(path.join(PHOTO_DIR, `${a.id}.jpg`)));
    const todo = have.filter(a => !fs.existsSync(path.join(PHOTO_DIR, `${a.id}.json`))).map(a => path.join(PHOTO_DIR, `${a.id}.jpg`));
    for (const r of await findFaces(todo)) {
      if (r.error || !r.w) continue;
      fs.writeFileSync(path.join(PHOTO_DIR, path.basename(r.file, '.jpg') + '.json'), JSON.stringify({ w: r.w, h: r.h, faces: r.faces }));
    }
    const list = have.map(({ id, w, h, date }) => {
      let f = null;
      try { f = JSON.parse(fs.readFileSync(path.join(PHOTO_DIR, `${id}.json`), 'utf8')); } catch {}
      return f ? { id, w: f.w, h: f.h, date, faces: f.faces } : { id, w, h, date };
    });
    const keep = new Set(list.flatMap(p => [`${p.id}.jpg`, `${p.id}.json`]));
    for (const f of fs.readdirSync(PHOTO_DIR)) if (!keep.has(f)) fs.rmSync(path.join(PHOTO_DIR, f), { force: true });   // removed from the album
    const changed = JSON.stringify(list) !== JSON.stringify(photoState.list);
    photoState.list = list; photoState.synced = Date.now(); photoState.error = null;
    if (changed) { qKvSet.run('photos', JSON.stringify(list)); broadcast('photos', {}); }
  } catch (e) {
    photoState.error = e.message;
    console.error('Photo sync:', e.message);
  } finally { photoState.running = false; }
}
if (PHOTO_URL) { setTimeout(syncPhotos, 5000); setInterval(syncPhotos, 15 * 60 * 1000); }

app.get('/api/photos', (req, res) => {
  res.json({ enabled: !!PHOTO_URL, photos: photoState.list, cfg: photoCfg(), synced: photoState.synced, error: photoState.error });
});
app.get('/api/photos/img/:id', (req, res) => {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(req.params.id)) return res.sendStatus(404);
  const file = path.join(PHOTO_DIR, `${req.params.id}.jpg`);
  let png = false;
  try { const fd = fs.openSync(file, 'r'), b = Buffer.alloc(4); fs.readSync(fd, b, 0, 4, 0); fs.closeSync(fd); png = b.readUInt32BE(0) === 0x89504e47; } catch { return res.sendStatus(404); }
  res.set('Cache-Control', 'public, max-age=31536000, immutable').type(png ? 'image/png' : 'image/jpeg');
  res.sendFile(file, err => { if (err && !res.headersSent) res.sendStatus(404); });
});
app.post('/api/photos/settings', (req, res) => {
  const b = req.body || {}, hm = v => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : null);
  const cur = photoCfg();
  const cfg = {
    frame: b.frame === undefined ? cur.frame : !!b.frame,
    night: b.night === undefined ? cur.night : !!b.night,
    from: hm(b.from) || cur.from,
    to: hm(b.to) || cur.to,
    every: [10, 20, 30, 60].includes(+b.every) ? +b.every : cur.every,
    dim: [30, 50, 70, 100].includes(+b.dim) ? +b.dim : cur.dim   // slideshow brightness, %
  };
  qKvSet.run('photoCfg', JSON.stringify(cfg));
  broadcast('photos', {});
  res.json(cfg);
});
app.post('/api/photos/sync', async (req, res) => {
  await syncPhotos();
  res.json({ photos: photoState.list.length, error: photoState.error });
});

const PUBLIC = path.join(APP_DIR, 'public');
// App icons, built in so there are no image files to copy
const ICONS = {
  'apple-touch-icon.png': 'iVBORw0KGgoAAAANSUhEUgAAALQAAAC0CAIAAACyr5FlAAAEOklEQVR4nO3dvY7UVgCGYW+UMtewWdFRpEJKTZFmocodZAu4h1xG2lCEJmmpUFrKiDYFHQKugZ4UIznG9ufx3/hvn0cUMOM9Gum8HJ/1zHqvnjy6KaDNN2u/ALZLHETiIBIHkTiIxEEkDiJxEImDSBxE4iASB5E4iMRBJA6ib2cZ5e3Hz7OMw4x+/P67iSNMjUMWm3WamimJjI9DFrswJZGRew5l7Mu4+bIhJRoTh2Vjj0bMmpWDaHAclo39Gjp3Vg4icRCJg0gcROIgEgeROIjEQSQOInEQiYNIHETiIJrnA8Y1r18+v8SwdHv6y+/zDniROIoLvNDS65fPDd46+OxjOq0QiYNIHETiIBIHkTiIxEEkDiJxEImDSBxE4iASB5E4iMRBJA6iS33YZy7v3zyr/vPB4xdrvZJ7aLtx1LIoH3z3YfGXcl9t9LTSWsbJw5svHc/2H4ezNhrHWX1m/XSMPkbb4mmlOp3VTcagaa4e/P7NM5uVEVZYObrnuGMiHzx+0bOV2iDKGGfpOPos9eWzUyZ1lkHuuUXjqC313QekSX334Wr6IPSxaBy1pb42tSN2js1BmNHSp5Wyj+4yuv/Hp0EKy8asVtiQNjeVIy6D1gYp/8z3MtnAdY4LXSC3bEy3Thwd36xOH2ToOCSrrRzN+Rsxo7UrH62PMNqap5W5rlOVXyuLea18+dwOY8vW35CyWeIgEgfR1ZNHN4O+oM+vgnLDuFX0ueHYoF8w64Zxxxl89jGdVojEQSQOInEQiYNIHERb/NGE7fj0x9/NB6/vbs8e0zxsj8TRLk15+dRp7nsetlNOKy06prx6TM/D5nhF6xBH3ezTud8+nFa+8sOXn6/vbsvpbD0pNCe7+7DTgHs8v1g56rrLaEqHlY/vd+UQx/+qs9hRRv81oHrkHhMRB5E4xri+uz2tCnvcSfQnjvGOXUYhjqrZtwg9NzGbJQ4icXzl36tX5d8nLh57XzYKcbSafoli6MWSbRJHXfUKaTGqj9qX77cPcbTo+aZ8q9rB+y2jEEcyro8jlVGIo8PQPg5WRiGObj37aH624wBlFOI4q9lHrYOe7+DvkTjOa052GcSByyh82Ken2ve3xdGzOLFy9FW+E5ueXfLFLEMcMzhkGYU4hjpqB63EQWRDOlj1x5mOvZCIY6RjZ3HitEIkDiJ3EzwOdxPc9w3/3E2QgxAHkTiIxEEkDiJxEImDSBxE4iASB5E4iMRBJA4icRCJg0gcROIgEgeROIjEQSQOInEQiYNIHETiIBIHkTiIxEEkDiJxEImDSBxE4iASB5E4iMRB5G6Cx7GPuwle7p55LMlphUgcROIgGrzn+PPXny7xOljGb3/90/9gKweROIjEQSQOInEQiYNIHETiIBIH0eC37Lk/rBxE4iASB5E4iMRBJA4icRCJg0gcROIgEgeROIjEQSQOov8AHDhtx321wTQAAAAASUVORK5CYII=',
  'icon-192.png': 'iVBORw0KGgoAAAANSUhEUgAAAMAAAADACAIAAADdvvtQAAAEYklEQVR4nO3dvY4TVxyH4dmIkmuAFV2KVEjUFGmAijsIBdxDLiNtKKBJ2lSIljKiTZEOJVwDPRSWLDP+mOPzm/HMHD9PhbzmrKXz6j9n12a4efrwtoNaP8z9Alg3AREREBEBEREQEQERERARAREREBEBEREQEQERERARAREREBEBEbkz1kIf//8y1lJcxqP7d/NFRghIOiu12bgwoygg6TQgzKj+DKSellTvpkM0kcqAjJ/21O2pCUSkJiDjp1UVO2sCEREQEQERERARAREREBEBEREQEQERERARAREREBEBEREQEQERGe2f9ex79/bVdItzrme//D7FshMG1E32orfevX3lWxR+i4lWdgkjIiAiAiIiICICIiIgIgIiIiAiAiIiICICIiIgIgIiIiAiAiIiICICIjLtJxJH9OnDy94jDx6/nuWVsGsdE2i/nmMPcmErCOjTh5fHhs2Pt19lNK8VBNQNDZvyhtQ2uqWfgXa3fHcOnZuCdCay6Al0YtcfPH5d3tPuV5U0ruUG1Dv6+JlrmWYOqHByHKvn3/9uBpfqXQSFOK55zkCD15FjRx+WZp4JlByHz1pKiFNbxBmod8hNdt15+cJmC6hXxmaz67a8ZCnjZyJzTqCDG3/iCdVLqWc6M1/Cjm1txY9LJ5Y6+2VRbP4z0P4GV2/5iEtRaP6Auu+3Odxyv3u8sKW8FzbiZuvmkhYxgVgvAREREBEBEbl5+vD23L9T+L+Lu0/0ohTeSfjR/btnLes+0dfyLSZa2SWMiICICIiIgIgIiIiAiCzlzdS1+Pzm/cHH7714Uv3MVTOBSn1+8/5YE933uZQ/swEmUJGSXS8vY/PMNkaRCTRsopnRxigygQb89PX5vRdPtpt9cGwcTGHwmZtl1z6HTKBhp+s5+PiJZ26/1MYEEtApvYEx1rK7S609IwERcQYax9qPMtVMICICKjXiYWXt555dAjrlAhemtV/7BDTgn5u/tn8eZXJM9JPdXAR0UYO/UlodAQ3r/dqmeg713nBtoyEB1ahoqPdX2qinE1Ch8o/7HNRqPZ2Ayu2+jbVR2FDD9XQCOte52992PZ2AKpSfqZuvpxPQKPYb2g+ryXo6AdU5fabe76nVejoBVSs/UzdcT+fjHKHdT7t213Ho6TGBUgcruYZ0NgQ0iWbeqRgkoBFcSSsHCWgS15OUQ/Q4rqeYHhOIiICICIiI+0RfC/eJPqCZmzi7TzRXSkBEBEREQEQERERARAREREBEBEREQEQERERARAREREBEBEREQEQERERARAREREBEBEREQEQERERARAREREBEBEREQEQERERARAREREBEBEREQEQERERARAREREBE3Cf6WqzvPtFT3/uYJXAJIyIgIgIiIiAiNYfoP379efTXwUL89uffZz3fBCIiICICIiIgIgIiIiAiAiIiICICIlLzeSDYMoGICIiIgIgIiIiAiAiIiICICIiIgIgIiIiAiAiIiICICIiIgIh8A+FpZAV4rYwkAAAAAElFTkSuQmCC',
  'icon-512.png': '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',
  'icon-maskable-512.png': 'iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAIAAAB7GkOtAAANFElEQVR4nO3dPY4Udx6A4Z4VIWfAyNkGjpCIHWwCRL4BBOYOe4xNcQDJbuoIkTpckRJsZi2cgdwbjDXbwHxUVVdVV/f7PHJgAVP9H2n699bXVF88ffRwB0DPX469AACOQwAAogQAIEoAAKIEACBKAACiBAAgSgAAogQAIEoAAKIEACBKAACiBAAgSgAAogQAIEoAAKIEACBKAACiBAAgSgAAogQAIEoAAKIEACBKAACiBAAgSgAAogQAIEoAAKIEACBKAACiBAAgSgAAogQAIEoAAKIEACBKAACiBAAgSgAAogQAIEoAAKIEACBKAACiBAAgSgAAogQAIEoAAKIEACBKAACiBAAgSgAAogQAIEoAAKIEACBKAACiBAAgSgAAogQAIEoAAKIEACBKAACiBAAgSgAAogQAIEoAAKIEACBKAACiBAAgSgAAogQAIEoAAKIEACBKAACiBAAgSgAAogQAIEoAAKIEACBKAACiBAAgSgAAou4dewGn5/3Hz8deAnC9x9/dP/YSTokADGLow0nYf6uKwZ0E4A5GP5yoyzevDNxCAG5k9MMZkIFbCMA1jH44MzJwLXcBfc30h3Pl3f0VAfiCnw84b97j+wTg//xkQIF3+hUB+JOfCejwfr8kALudnwbo8a7fCcDOzwFUee/XA+AnAMriE6AeAICsdADi8Qd27TmQDgBAWTcA5ewD+7LToBsAgLhoALLBB67VnAnRAAAgAABRAgAQVQxA82QfcLvgZCgGAICdAABkCQBAlAAARAkAQJQAAEQJAECUAABECQBAlAAARAkAQJQAAEQJAECUAABECQBAlAAARAkAQJQAAEQJAECUAABECQBAlAAARAkAQJQAAEQJAECUAABECQBAlAAARAkAQJQAAEQJAECUAABECQBAlAAARAkAQJQAAEQJAECUAABE3Tv2As7Z2zcvj70EOAfPnr869hLOkyOApZj+MJe3b156Qy1BAACiBAAgyjWANZzHGcz9Y3Df0Tad93fE7BwBAEQJAECUAABECQBAlAAARAkAQJQAAEQJAECUAABECQBAlAAARAkAQJQAAEQJAECUAABECQBAlAAARAkAQJQAAEQJAECUAABECQBAlAAARAkAQJQAAEQJAECUAABECQBAlAAARAkA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'
};
app.get('/icons/:name', (req, res) => {
  const b64 = ICONS[req.params.name];
  if (!b64) return res.sendStatus(404);
  res.set('Cache-Control', 'public, max-age=604800').type('png').send(Buffer.from(b64, 'base64'));
});

// Installable app: the wall opens full-screen at "/", the iPad opens "/edit"
const MANIFESTS = {
  wall: { name: BOARD_TITLE, short_name: 'Chalk Planner', start_url: '/', scope: '/', display: 'fullscreen', orientation: 'landscape' },
  edit: { name: BOARD_TITLE + ' (edit)', short_name: 'Planner edit', start_url: '/edit', scope: '/', display: 'standalone', orientation: 'any' },
  chores: { name: 'Chores', short_name: 'Chores', start_url: '/chores', scope: '/', display: 'standalone', orientation: 'any' }
};
for (const [kind, m] of Object.entries(MANIFESTS)) {
  app.get(`/manifest-${kind}.webmanifest`, (req, res) => {
    res.type('application/manifest+json').json({
      ...m, id: m.start_url, background_color: '#1c130b', theme_color: '#1c130b',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
      ]
    });
  });
}
// Board version = when the page and server were last changed. The wall reloads itself when it changes.
const PAGE_FILE = path.join(PUBLIC, 'index.html');
const SERVER_MTIME = Math.round(fs.statSync(__filename).mtimeMs);
let pageMtime = 0;
function boardVersion() {
  try { pageMtime = Math.round(fs.statSync(PAGE_FILE).mtimeMs); } catch (e) { /* keep last */ }
  return `${SERVER_MTIME}-${pageMtime}`;
}
let lastVersion = boardVersion();
setInterval(() => {   // a new index.html dropped in (no restart needed): tell every open page
  const v = boardVersion();
  if (v !== lastVersion) { lastVersion = v; broadcast('hello', { v }); }
}, 15000);

function sendBoard(kind) {
  return (req, res) => {
    fs.readFile(path.join(PUBLIC, 'index.html'), 'utf8', (err, html) => {
      if (err) return res.status(500).send('Board page missing');
      res.set('Cache-Control', 'no-cache').type('html')
        .send(html.replace(/<title>[^<]*<\/title>/, `<title>${BOARD_TITLE.replace(/[<>&"]/g, '')}</title>`).replace(/__SOURCE_URL__/g, SOURCE_URL).replace(/__APP_VERSION__/g, APP_VERSION).replace('<!--MANIFEST-->', `<link rel="manifest" href="/manifest-${kind}.webmanifest">\n<meta name="board-version" content="${boardVersion()}">`));
    });
  };
}
const APP_VERSION = 'v' + require('../package.json').version;
// ---- Admin console → ⚙️ Board: settings that used to need .env (server/settings.ts) ----
// Saving restarts the board (a few seconds) so everything picks the new values up; screens reconnect.
function restartSoon(why) {
  setTimeout(() => { console.log(`Chalk Planner: restarting to apply ${why}`); process.exit(3); }, 400);   // the service manager starts it again
}
app.get('/api/board-settings', (req, res) => {
  res.set('Cache-Control', 'no-store').json({ ...boardSettings.view(), version: APP_VERSION, problems: { ...Object.fromEntries(calProblems), ...(FONTS_GONE.length ? { Fonts: `not installed (${FONTS_GONE.join(', ')}) - screens use plain fonts. On the server run: sudo bash deploy/update.sh` } : {}) }, proxySeen: access.proxySeen(), key: keyInfo(), here: `${req.protocol}://${req.get('host')}`, timezones: typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [] });
});
app.post('/api/board-settings', (req, res) => {
  const r = boardSettings.save((req.body || {}).values);
  if (r.errors) return res.status(400).json({ error: 'Some settings need fixing', errors: r.errors });
  if (!r.changed.length) return res.json({ ok: true, restarting: false });
  access.audit(req, 'settings.changed', { target: 'board settings', detail: r.changed.join(', ') });   // names only, never values
  res.json({ ok: true, restarting: true, changed: r.changed });
  restartSoon('new settings');
});
// "Find my calendars": try a CalDAV account and list its calendars (the password may be the saved one)
app.post('/api/board-settings/caldav-test', async (req, res) => {
  const b = req.body || {}, url = String(b.url || ENV.CALDAV_URL || 'https://caldav.icloud.com/').trim();
  const user = String(b.user ?? ENV.CALDAV_USER ?? '').trim(), pass = b.password ? String(b.password) : (ENV.CALDAV_PASSWORD || ENV.ICLOUD_APP_PASSWORD || '');
  try { const u = new URL(url); if (!/^https?:$/.test(u.protocol)) throw 0; } catch { return res.status(400).json({ error: 'The server address should start with https://' }); }
  if (!user || !pass) return res.status(400).json({ error: 'Enter the username and password first' });
  try {
    const cals = await caldavCalendars(url, 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64'));
    res.json({ calendars: cals.map(c => c.name), list: cals });
  } catch (e) { res.status(400).json({ error: e.name === 'TimeoutError' ? 'The calendar server didn’t answer' : e.message }); }
});
// Weather location: search a town (Open-Meteo geocoding, no account)
app.get('/api/board-settings/geocode', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 80);
  if (q.length < 2) return res.json({ places: [] });
  try {
    const r = await fetch(`${ENV.GEOCODE_URL || 'https://geocoding-api.open-meteo.com'}/v1/search?count=6&language=en&format=json&name=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(10000) });
    const j = await r.json();
    res.json({ places: (j.results || []).map(p => ({ name: [p.name, p.admin1, p.country].filter(Boolean).join(', '), lat: Math.round(p.latitude * 1e4) / 1e4, lon: Math.round(p.longitude * 1e4) / 1e4, timezone: p.timezone || null })) });
  } catch { res.status(502).json({ error: 'Couldn’t search right now - you can type the latitude and longitude instead' }); }
});

// Fonts: bundled from npm (@fontsource, SIL Open Font License) and served by the board itself, so no
// screen ever calls Google and the board looks right with the internet down.
const FONTS = [['kalam', [400, 700]], ['dancing-script', [700]], ['cormorant-garamond', [600]], ['caveat', [600]], ['permanent-marker', [400]],
  ['pacifico', [400]], ['fredericka-the-great', [400]], ['amatic-sc', [700]], ['rock-salt', [400]]];
// The board's fonts are installed with its packages (npm ci). If they're missing, say so at start-up and in
// the console (⚙️ Board), and never let browsers keep an incomplete list. deploy/update.sh installs them.
const fontsMissing = () => FONTS.filter(([pkg, ws]) => ws.some(w => { try { require.resolve(`@fontsource/${pkg}/${w}.css`); return false; } catch { return true; } })).map(([pkg]) => pkg);
const FONTS_GONE = fontsMissing();
if (FONTS_GONE.length) console.error(`Chalk Planner: the board's fonts aren't installed (${FONTS_GONE.join(', ')}) - screens fall back to plain fonts. Fix: sudo bash ${APP_DIR}/deploy/update.sh`);
let fontsCss = null;
app.get('/fonts.css', (req, res) => {
  if (fontsCss === null) {
    const css = FONTS.map(([pkg, ws]) => ws.map(w => {
      try { return fs.readFileSync(require.resolve(`@fontsource/${pkg}/${w}.css`), 'utf8').replace(/url\(\.\/files\//g, `url(/fonts/${pkg}/files/`); }
      catch { return ''; }
    }).join('\n')).join('\n');
    if (fontsMissing().length) return res.set('Cache-Control', 'no-store').type('text/css').send(css);   // incomplete: never cached
    fontsCss = css;
  }
  res.set('Cache-Control', 'public, max-age=86400').type('text/css').send(fontsCss);
});
app.get('/fonts/:pkg/files/:file', (req, res) => {
  const { pkg, file } = req.params;
  if (!FONTS.some(([p]) => p === pkg) || !/^[a-z0-9-]+\.woff2?$/.test(file)) return res.sendStatus(404);
  let dir; try { dir = path.dirname(require.resolve(`@fontsource/${pkg}/package.json`)); } catch { return res.sendStatus(404); }
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.sendFile(path.join(dir, 'files', file), err => { if (err && !res.headersSent) res.sendStatus(404); });
});

app.get('/', sendBoard('wall'));
app.get('/edit', sendBoard('edit'));
app.get('/chores', sendBoard('chores'));   // the chores page on a phone (same page, chores mode)
// the admin console (sign-in, screens, people, my account) and invite links
for (const p of ['/admin', '/join']) app.get(p, (req, res) => res.set('Cache-Control', 'no-cache').sendFile(path.join(PUBLIC, 'admin.html')));
app.use(express.static(PUBLIC));

app.listen(PORT, BIND, () => console.log(`Family Chalk Planner on ${BIND}:${PORT} (data in ${DATA_DIR})`));
