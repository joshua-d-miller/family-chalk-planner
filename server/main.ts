// Family Chalk Planner: a chalkboard-style family wall calendar.
//  - Events: any CalDAV calendar (iCloud, Nextcloud, Fastmail...) or Google - read and write
//  - Art, stamps, meal plan, jars, chores, styles, people and screens: SQLite in DATA_DIR
//  - Live: Server-Sent Events push changes to every open board (wall, tablets, phones)
//
// Copyright (C) 2026 Joshua Miller. Licensed under the GNU AGPL v3 or later; see LICENSE.
// Settings come from the admin console (stored in the database) and the environment (see .env.example).
//
// This file only puts the parts together; each feature is its own module.
import path from 'node:path';
import express from 'express';
import pkg from '../package.json' with { type: 'json' };
import { openDatabase, prepareDatabase } from './db.ts';
import { migrate } from './migrations.ts';
import { readConfig } from './config.ts';
import * as settings from './settings.ts';
import { makeKv } from './kv.ts';
import { makeClock } from './dates.ts';
import { createLive } from './live.ts';
import * as access from './access/access.ts';
import * as backup from './backup.ts';
import * as extras from './extras.ts';
import * as holidays from './holidays.ts';
import { createGoogle, registerGoogleRoutes } from './calendar/google.ts';
import { createCalendarSource } from './calendar/source.ts';
import { registerCalendarRoutes } from './calendar/routes.ts';
import * as clipart from './clipart.ts';
import * as month from './month.ts';
import * as art from './art.ts';
import * as theme from './theme.ts';
import * as meals from './meals.ts';
import * as jars from './jars.ts';
import * as chores from './chores.ts';
import * as reminders from './reminders.ts';
import * as timers from './timers.ts';
import * as pantry from './pantry.ts';
import * as media from './media.ts';
import * as photos from './photos/photos.ts';
import * as pages from './pages.ts';
import { registerSettingsRoutes } from './settings-routes.ts';

const ENV = process.env;
const APP_DIR = path.join(import.meta.dirname, '..');
const DATA_DIR = ENV.DATA_DIR || path.join(APP_DIR, 'data');
const VERSION = 'v' + pkg.version;

const db = openDatabase(DATA_DIR);
// puts what the console saved into ENV (not for the command-line tools below, which work on the stored values)
const boardSettings = settings.setup({
  db,
  DATA_DIR,
  importEnv: !['--setting', '--reset-admin'].some(a => process.argv.includes(a))
});

// Command line, for the server's owner (deploy/setting.sh):  --setting get KEY  |  --setting set KEY VALUE
if (process.argv[2] === '--setting') {
  const [, , , op, k, v] = process.argv;
  if (op === 'get' && k) {
    console.log(boardSettings.get(k));
    process.exit(0);
  }
  if (op === 'set' && k) {
    const r = boardSettings.save({ [k]: v ?? '' });
    if ('errors' in r) {
      console.error(`${k}: ${r.errors[k]}`);
      process.exit(1);
    }
    console.log(r.changed.length ? `${k} ${v ? 'saved' : 'cleared'} - restart the board to use it` : 'Nothing changed');
    process.exit(0);
  }
  console.error('Usage: --setting get KEY | --setting set KEY [VALUE]   (no VALUE clears it)');
  process.exit(2);
}

const cfg = readConfig(ENV, APP_DIR, DATA_DIR);
prepareDatabase(db, DATA_DIR);
try {
  migrate(db);
} catch (e) {
  console.error(`Chalk Planner: ${(e as Error).message}`);
  process.exit(1);
}
const kv = makeKv(db);
const kvGet = kv.get;
const kvSet = kv.set;
const clock = makeClock({
  timeZone: cfg.timeZone,
  time24: cfg.time24,
  weekStart: cfg.weekStart,
  southern: cfg.lat !== null && cfg.lat < 0
});
const live = createLive();
const broadcast = live.broadcast;

const app = express();
app.use(express.json({ limit: '2mb' }));
app.set('trust proxy', cfg.trustProxy);

// Who may do what: paired screens and signed-in people, the admin console (server/access/).
// Registered first: its rules run before every other route.
const who = access.setup(app, { db, kv, dataDir: DATA_DIR, env: ENV, title: cfg.title, broadcast });
if (process.argv.includes('--reset-admin')) {
  // deploy/reset-admin.sh
  console.log(`Removed every person, sign-in and paired screen. New setup code: ${who.resetAll()}`);
  console.log('Open /admin on a tablet or computer, enter the code and create the admin again; then pair the screens.');
  process.exit(0);
}

// Nightly snapshot of the database (a consistent copy while running), for restic or OneDrive
const { keyInfo } = backup.setup({
  db,
  dataDir: DATA_DIR,
  backupDir: cfg.backupDir,
  secretFromEnv: !!ENV.SECRET_KEY,
  today: clock.today
});

// today's date: the screens, and the install and update health checks
app.get('/api/today', (_req, res) => {
  const today = clock.today();
  res.json({ today, ym: today.slice(0, 7) });
});

// Weather, trash day and notes (top of the Notes column)
extras.setup({
  app,
  broadcast,
  today: clock.today,
  trashDay: cfg.trashDay,
  kvGet,
  kvSet,
  weather: { lat: cfg.lat, lon: cfg.lon, unit: cfg.tempUnit, timeZone: cfg.timeZone, base: cfg.weatherUrl }
});

// Holidays: worked out here, shown on the board only, any can be hidden
const holidayList = holidays.setup({ app, country: cfg.holidays, broadcast, today: clock.today, kvGet, kvSet });

// The calendar (server/calendar/)
const google = createGoogle(cfg.google, DATA_DIR);
const calendar = createCalendarSource(cfg.calendar, clock, google);
registerGoogleRoutes(app, {
  google,
  enabled: cfg.calendar.provider === 'google',
  broadcast,
  calendarChanged: () => calendar.reset()
});
registerCalendarRoutes({
  app,
  source: calendar,
  clock,
  broadcast,
  holidays: holidayList,
  showHolidays: cfg.holidays !== 'none',
  kvGet,
  kvSet,
  status: () => {
    const c = cfg.calendar;
    if (c.provider === 'google') {
      const st = google.load();
      return {
        provider: 'google',
        configured: !!cfg.google.id,
        connected: !!st.refresh,
        calendar: st.calendarName || null,
        problem: st.refresh ? null : st.problem || null,
        paste: !/\/oauth\/google\/callback$/.test(cfg.google.redirect),
        redirect: cfg.google.redirect
      };
    }
    return {
      provider: 'caldav',
      configured: !!(c.user && c.password && c.calendarName),
      calendar: c.calendarName || null,
      problems: Object.fromEntries(calendar.problems)
    };
  }
});

// Each month's options, the art layer and stamps, board style, meals, jars, chores
const pictures = clipart.setup({ app, cacheDir: path.join(DATA_DIR, 'clipart-cache') });
const months = month.setup({ app, db, kv, broadcast, chalk: clipart.CHALK, pictureOk: pictures.pictureOk });
art.setup({ app, db, month: months, broadcast });
theme.setup({ app, kv, broadcast });
meals.setup({ app, db, broadcast });
jars.setup({ app, db, broadcast });
chores.setup({
  app,
  broadcast,
  weekStart: cfg.weekStart,
  db,
  today: clock.today,
  kidOf: req => who.kidOf(req),
  who: req => who.whoOf(req)
});

// Reminders, timers and the pantry (from Colby Way's board)
reminders.setup({ app, db, clock, broadcast });
timers.setup({ app, db, broadcast });
pantry.setup({ app, db, today: clock.today, broadcast });

// Uploads, pictures from links, the GIF library
media.setup({
  app,
  db,
  kv,
  mediaDir: path.join(cfg.backupDir, 'media'), // inside the backup folder, so they ride along with the backups
  allowPrivateLinks: cfg.allowPrivateLinks,
  testRoutes: cfg.testRoutes
});

// Photos from a shared album: beside the month name and the overnight slideshow
photos.setup({ app, kv, broadcast, cacheDir: path.join(DATA_DIR, 'photo-cache'), ...cfg.photos });

// The pages, icons, manifests and fonts; the admin console's ⚙️ Board
const site = pages.setup({
  app,
  publicDir: path.join(APP_DIR, 'public'),
  appDir: APP_DIR,
  serverFile: import.meta.filename,
  title: cfg.title,
  sourceUrl: cfg.sourceUrl,
  version: VERSION,
  broadcast
});
registerSettingsRoutes(app, {
  settings: boardSettings,
  env: ENV,
  version: VERSION,
  problems: () => ({
    ...Object.fromEntries(calendar.problems),
    ...(site.fontsGone.length
      ? {
          Fonts: `not installed (${site.fontsGone.join(', ')}) - screens use plain fonts. On the server run: sudo bash deploy/update.sh`
        }
      : {})
  }),
  proxySeen: who.proxySeen,
  keyInfo,
  audit: who.audit
});
live.serve(app, { version: site.boardVersion, stillAllowed: ck => who.stillAllowed(ck) });
site.serve(); // last: the pages, then any file in public/

app.listen(cfg.port, cfg.bind, () =>
  console.log(`Family Chalk Planner on ${cfg.bind}:${cfg.port} (data in ${DATA_DIR})`)
);
