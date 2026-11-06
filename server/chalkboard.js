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
const boardSettings = require('./settings.ts').setup({
  db,
  DATA_DIR,
  importEnv: !['--setting', '--reset-admin'].some(a => process.argv.includes(a))
}); // puts the console's values into ENV
// Command line, for the server's owner (deploy/setting.sh):  --setting get KEY  |  --setting set KEY VALUE
if (process.argv[2] === '--setting') {
  const [, , , op, k, v] = process.argv;
  if (op === 'get' && k) {
    console.log(boardSettings.get(k));
    process.exit(0);
  }
  if (op === 'set' && k) {
    const r = boardSettings.save({ [k]: v ?? '' });
    if (r.errors) {
      console.error(`${k}: ${r.errors[k]}`);
      process.exit(1);
    }
    console.log(r.changed.length ? `${k} ${v ? 'saved' : 'cleared'} - restart the board to use it` : 'Nothing changed');
    process.exit(0);
  }
  console.error('Usage: --setting get KEY | --setting set KEY [VALUE]   (no VALUE clears it)');
  process.exit(2);
}
const PORT = num(ENV.PORT, 3002);
const BIND = ENV.BIND || '0.0.0.0';
const TZ = ENV.TIMEZONE || ENV.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; // else the server's own time zone
const LAT = num(ENV.LATITUDE, null),
  LON = num(ENV.LONGITUDE, null); // weather is off until both are set
const TEMP_UNIT = ENV.TEMP_UNIT === 'celsius' ? 'celsius' : 'fahrenheit';
const TRASH_DAY = /^[0-6]$/.test(ENV.TRASH_DAY || '') ? +ENV.TRASH_DAY : null; // 0 = Sunday ... 6 = Saturday; empty = off
const HOLIDAYS = ['us', 'ca', 'gb', 'none'].includes((ENV.HOLIDAYS || '').toLowerCase())
  ? ENV.HOLIDAYS.toLowerCase()
  : 'us';
const WEEK_START = (ENV.WEEK_START || '').toLowerCase() === 'monday' ? 1 : 0; // 0 = weeks start on Sunday
const TIME_24 = /^24/.test(ENV.TIME_FORMAT || '');
const jsonList = v => {
  try {
    const a = JSON.parse(v || '[]');
    return Array.isArray(a) ? a.slice(0, 8) : [];
  } catch {
    return [];
  }
};
const EXTRA_CALS = jsonList(ENV.EXTRA_CALENDARS); // [{ id, name, color }] more calendars on the same account
const ICS_FEEDS = jsonList(ENV.ICS_FEEDS).map(f => ({ ...f, url: String(f.url || '').replace(/^webcal:/i, 'https:') })); // read-only links
const BOARD_TITLE = String(ENV.BOARD_TITLE || 'Family Chalk Planner').slice(0, 60);
// AGPL: people using the board can get its source. Point this at your fork if you change the code.
const SOURCE_URL = /^https?:\/\/[^\s"<>]+$/.test(ENV.SOURCE_URL || '')
  ? ENV.SOURCE_URL
  : 'https://github.com/joshua-d-miller/family-chalk-planner';
const ICLOUD_USER = ENV.CALDAV_USER || ENV.ICLOUD_USER; // ICLOUD_* names still work
const ICLOUD_PASS = ENV.CALDAV_PASSWORD || ENV.ICLOUD_APP_PASSWORD;
const CAL_NAME = ENV.CALDAV_CALENDAR || ENV.ICLOUD_CALENDAR;
// Calendar provider: any CalDAV server (iCloud, Nextcloud, Fastmail...) with a password,
// or Google Calendar (Google's CalDAV with a Google sign-in instead of a password).
const PROVIDER =
  (ENV.CALENDAR_PROVIDER || (ENV.GOOGLE_CLIENT_ID ? 'google' : 'caldav')).toLowerCase() === 'google'
    ? 'google'
    : 'caldav';
const G = {
  id: ENV.GOOGLE_CLIENT_ID || '',
  secret: ENV.GOOGLE_CLIENT_SECRET || '',
  redirect: ENV.GOOGLE_REDIRECT_URI || 'http://localhost', // default: paste the address back (works without HTTPS)
  auth: ENV.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth',
  token: ENV.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token',
  api: ENV.GOOGLE_API_BASE || 'https://www.googleapis.com',
  dav: ENV.GOOGLE_CALDAV_BASE || 'https://apidata.googleusercontent.com'
};
if (PROVIDER === 'google' && !G.id)
  console.error('Chalk Planner: CALENDAR_PROVIDER=google but GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set');
if (PROVIDER === 'caldav' && (!ICLOUD_USER || !ICLOUD_PASS || !CAL_NAME)) {
  console.error('Chalk Planner: CALDAV_USER / CALDAV_PASSWORD / CALDAV_CALENDAR are not set - no calendar events');
}
const CALDAV_URL = ENV.CALDAV_URL || 'https://caldav.icloud.com/';

// ---------------------------------------------------------------------------
// Art database
// ---------------------------------------------------------------------------
for (const f of ['chalkboard.db', 'chalkboard.db-wal', 'chalkboard.db-shm']) {
  try {
    fs.chmodSync(path.join(DATA_DIR, f), 0o600);
  } catch {
    /* not there yet */
  }
}
try {
  const ck = Object.values(db.prepare('PRAGMA quick_check').get() || {})[0];
  if (ck !== 'ok')
    console.error(
      `Chalk Planner: DATABASE CHECK FAILED (${ck}) - restore last night's snapshot from the backup folder`
    );
} catch (e) {
  console.error('Chalk Planner: database check failed:', e.message);
}
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
const qKvSet = db.prepare(
  'INSERT INTO kv (key, data) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data'
);
db.exec('DROP TABLE IF EXISTS sessions'); // PIN sign-ins of older versions

// ---------------------------------------------------------------------------
// Date helpers (everything shown in TIMEZONE): server/dates.ts
// ---------------------------------------------------------------------------
const dates = require('./dates.ts');
const clock = dates.makeClock({
  timeZone: TZ,
  time24: TIME_24,
  weekStart: WEEK_START,
  southern: LAT !== null && LAT < 0
});
const nyParts = clock.zoned;
const { addDays } = dates;

// ---------------------------------------------------------------------------
// The calendar (server/calendar/): CalDAV (iCloud, Nextcloud, Fastmail...) or Google, more calendars
// on the same account, read-only calendar links; the routes are registered further down
// ---------------------------------------------------------------------------
const google = require('./calendar/google.ts').createGoogle(G, DATA_DIR);
const { caldavCalendars, createCalendarSource } = require('./calendar/source.ts');
const calendar = createCalendarSource(
  {
    provider: PROVIDER,
    caldavUrl: CALDAV_URL,
    user: ICLOUD_USER,
    password: ICLOUD_PASS,
    calendarName: CAL_NAME,
    extraCalendars: EXTRA_CALS,
    feeds: ICS_FEEDS
  },
  clock,
  google
);
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
// plus the admin console. See server/access/.
// ---------------------------------------------------------------------------
const kv = require('./kv.ts').makeKv(db);
const access = require('./access/access.ts').setup(app, {
  db,
  kv,
  dataDir: DATA_DIR,
  env: ENV,
  title: BOARD_TITLE,
  broadcast
});
if (process.argv.includes('--reset-admin')) {
  // deploy/reset-admin.sh
  console.log(`Removed every person, sign-in and paired screen. New setup code: ${access.resetAll()}`);
  console.log('Open /admin on a tablet or computer, enter the code and create the admin again; then pair the screens.');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Nightly snapshot of the database (consistent copy while running) for restic
// ---------------------------------------------------------------------------
const BACKUP_DIR = ENV.BACKUP_DIR || path.join(DATA_DIR, 'backup'); // snapshots, the key, and uploads (media/)
const backup = require('./backup.ts').setup({
  db,
  dataDir: DATA_DIR,
  backupDir: BACKUP_DIR,
  secretFromEnv: !!ENV.SECRET_KEY,
  today: clock.today
});
const keyInfo = backup.keyInfo;

const { isYm, isDate } = dates;

app.get('/api/today', (req, res) => {
  const t = nyParts(new Date());
  res.json({ today: t.dateStr, ym: t.dateStr.slice(0, 7) });
});

require('./extras.ts').setup({
  app,
  broadcast,
  today: clock.today,
  trashDay: TRASH_DAY,
  kvGet: k => {
    const r = qKvGet.get(k);
    return r ? JSON.parse(r.data) : null;
  },
  kvSet: (k, v) => qKvSet.run(k, JSON.stringify(v)),
  weather: { lat: LAT, lon: LON, unit: TEMP_UNIT, timeZone: TZ, base: ENV.WEATHER_URL || 'https://api.open-meteo.com' }
});

// ---------------------------------------------------------------------------
// Holidays (server/holidays.ts): worked out here, shown on the board only, any can be hidden
// ---------------------------------------------------------------------------
const holidays = require('./holidays.ts').setup({
  app,
  country: HOLIDAYS,
  broadcast,
  today: clock.today,
  kvGet: k => {
    const r = qKvGet.get(k);
    return r ? JSON.parse(r.data) : null;
  },
  kvSet: (k, v) => qKvSet.run(k, JSON.stringify(v))
});

// The calendar's routes (server/calendar/routes.ts, google.ts)
require('./calendar/google.ts').registerGoogleRoutes(app, {
  google,
  enabled: PROVIDER === 'google',
  broadcast,
  calendarChanged: () => calendar.reset()
});
require('./calendar/routes.ts').registerCalendarRoutes({
  app,
  source: calendar,
  clock,
  broadcast,
  holidays,
  showHolidays: HOLIDAYS !== 'none',
  kvGet: k => {
    const r = qKvGet.get(k);
    return r ? JSON.parse(r.data) : null;
  },
  kvSet: (k, v) => qKvSet.run(k, JSON.stringify(v)),
  status: () => {
    if (PROVIDER === 'google') {
      const st = google.load();
      return {
        provider: 'google',
        configured: !!G.id,
        connected: !!st.refresh,
        calendar: st.calendarName || null,
        problem: st.refresh ? null : st.problem || null,
        paste: !/\/oauth\/google\/callback$/.test(G.redirect),
        redirect: G.redirect
      };
    }
    return {
      provider: 'caldav',
      configured: !!(ICLOUD_USER && ICLOUD_PASS && CAL_NAME),
      calendar: CAL_NAME || null,
      problems: Object.fromEntries(calProblems)
    };
  }
});

// ---------------------------------------------------------------------------
// Each month's options (month.ts), the art layer and stamps (art.ts), board style, meals, jars
// ---------------------------------------------------------------------------
const clipart = require('./clipart.ts').setup({ app, cacheDir: path.join(DATA_DIR, 'clipart-cache') });
const month = require('./month.ts').setup({ app, db, kv, broadcast, chalk: '#EDEAE0', pictureOk: clipart.pictureOk });
require('./art.ts').setup({ app, db, month, broadcast });
require('./theme.ts').setup({ app, kv, broadcast });
require('./meals.ts').setup({ app, kv, broadcast });
require('./jars.ts').setup({ app, kv, broadcast });

// Chores: the family's checklist (server/chores.ts)
const chores = require('./chores.ts').setup({
  app,
  broadcast,
  weekStart: WEEK_START,
  kvGet: k => {
    const r = qKvGet.get(k);
    return r ? JSON.parse(r.data) : null;
  },
  kvSet: (k, v) => qKvSet.run(k, JSON.stringify(v)),
  today: () => nyParts(new Date()).dateStr,
  kidOf: req => access.kidOf(req),
  who: req => access.whoOf(req)
});
// Pictures: clipart, chalk drawings and animated emoji (clipart.ts); uploads, links and the GIF library (media.ts)
require('./media.ts').setup({
  app,
  db,
  kv,
  mediaDir: path.join(BACKUP_DIR, 'media'),
  allowPrivateLinks: ENV.ALLOW_PRIVATE_LINKS === '1',
  testRoutes: ENV.NODE_ENV === 'test'
});

// Photos from a shared album: beside the month name and the overnight slideshow (server/photos/)
const FACE_DIR = ENV.FACE_DIR || path.join(APP_DIR, 'face');
require('./photos/photos.ts').setup({
  app,
  kv,
  broadcast,
  album: { url: (ENV.PHOTO_ALBUM_URL || '').trim(), googleHost: ENV.PHOTO_GOOGLE_HOST, ckHost: ENV.PHOTO_CK_HOST },
  cacheDir: path.join(DATA_DIR, 'photo-cache'),
  faceDir: FACE_DIR,
  facePython: ENV.FACE_PYTHON || path.join(FACE_DIR, 'venv', 'bin', 'python')
});

// The pages, icons, manifests and fonts (pages.ts); the admin console's ⚙️ Board (settings-routes.ts)
const APP_VERSION = 'v' + require('../package.json').version;
const pages = require('./pages.ts').setup({
  app,
  publicDir: path.join(APP_DIR, 'public'),
  appDir: APP_DIR,
  serverFile: __filename,
  title: BOARD_TITLE,
  sourceUrl: SOURCE_URL,
  version: APP_VERSION,
  broadcast
});
require('./settings-routes.ts').registerSettingsRoutes(app, {
  settings: boardSettings,
  env: ENV,
  version: APP_VERSION,
  problems: () => ({
    ...Object.fromEntries(calProblems),
    ...(pages.fontsGone.length
      ? {
          Fonts: `not installed (${pages.fontsGone.join(', ')}) - screens use plain fonts. On the server run: sudo bash deploy/update.sh`
        }
      : {})
  }),
  proxySeen: () => access.proxySeen(),
  keyInfo,
  audit: (req, what, info) => access.audit(req, what, info)
});
live.serve(app, { version: pages.boardVersion, stillAllowed: ck => access.stillAllowed(ck) });
pages.serve();

app.listen(PORT, BIND, () => console.log(`Family Chalk Planner on ${BIND}:${PORT} (data in ${DATA_DIR})`));
