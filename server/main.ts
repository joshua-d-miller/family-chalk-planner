/*
===============================================================================
 Family Chalk Planner | Server | main.ts (the start)
===============================================================================
 Version:   0.15.1
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-06
 Updated:   2026-11-10

 Purpose:
     Family Chalk Planner: a chalkboard-style family wall calendar. This
     file only puts the parts together; each feature is its own module.

     - Events: any CalDAV calendar (iCloud, Nextcloud, Fastmail...) or
       Google, read and write
     - Art, stamps, meals, jars, chores, styles, people and screens:
       SQLite in DATA_DIR
     - Live: Server-Sent Events push every change to every open screen

     Copyright (C) 2026 Joshua D. Miller. Licensed under the GNU AGPL v3
     or later; see LICENSE.

 How it fits:
     Settings come from the admin console (stored in the database); only
     where the board listens and keeps its data come from the environment
     (PORT, BIND, DATA_DIR, BACKUP_DIR). The order below matters: the
     access rules are registered first so they run before every other
     route, and the pages last, after every /api route.

     Command line, for the server's owner:
     node server/chalkboard.js --setting get KEY
     node server/chalkboard.js --setting set KEY [VALUE]
     node server/chalkboard.js --reset-admin      (deploy/reset-admin.sh)

 Routes:
     GET    /api/today

 Used by:
     server/chalkboard.js
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    Server and tests are all TypeScript (ES
                        claude    modules).
                        colby
                                  Database migrations; chores, meals and jars
                                  in their own tables.

                                  Reminders, timers, the pantry and the right-
                                  hand column's pages (server).

                                  Google: several calendars at once, read-only
                                  ones, and which calendar a new event goes
                                  in.

                                  ... and 3 more (the board rebuilt in React
                                  and TypeScript)

 0.15.0    2026-11-08   joshua    Favorites get the live updates (a screen's
                        claude    Notes bottom).

 0.15.1    2026-11-10   joshua    The calendar's saved copies.
                        claude
===============================================================================
*/

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
import { makeCalendarCache } from './calendar/cache.ts';
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
import * as updates from './updates.ts';
import * as favorites from './favorites.ts';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------------- //
// | Where things are | //
// -------------------- //
// The board's folder, its data folder and its version (from package.json,   //
// shown in the admin console and /api/health).                              //
const ENV = process.env;
const APP_DIR = path.join(import.meta.dirname, '..');
const DATA_DIR = ENV.DATA_DIR || path.join(APP_DIR, 'data');
const VERSION = 'v' + pkg.version;

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------------------------------------------- //
// | The database and the admin console settings | //
// ----------------------------------------------- //
// What the console saved is put into ENV here, so every module below reads  //
// its settings the same way. Not for the command-line tools, which work on  //
// the stored values themselves.                                             //
const db = openDatabase(DATA_DIR);
// puts what the console saved into ENV (not for the command-line tools below, which work on the stored values)
const boardSettings = settings.setup({
  db,
  DATA_DIR,
  importEnv: !['--setting', '--reset-admin'].some(a => process.argv.includes(a))
});

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------------------------- //
// | Command line: --setting | //
// --------------------------- //
// For deploy/setting.sh: read or change one setting without the admin       //
// console (a wrong https address, a proxy).                                 //
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

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------------------------------------- //
// | Settings, database updates and the clock | //
// -------------------------------------------- //
// The database is brought up to date (server/migrations.ts) before anything //
// reads it; a database from a newer version stops the board here with a     //
// message. The clock knows the board's time zone.                           //
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

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------ //
// | The web server | //
// ------------------ //
const app = express();
app.use(express.json({ limit: '2mb' }));
app.set('trust proxy', cfg.trustProxy);

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------- //
// | Who may do what | //
// ------------------- //
// Who may do what: paired screens and signed-in people, the admin console   //
// (server/access/). Registered first: its rules run before every other      //
// route.                                                                    //
const who = access.setup(app, { db, kv, dataDir: DATA_DIR, env: ENV, title: cfg.title, broadcast });
if (process.argv.includes('--reset-admin')) {
  // deploy/reset-admin.sh
  console.log(`Removed every person, sign-in and paired screen. New setup code: ${who.resetAll()}`);
  console.log('Open /admin on a tablet or computer, enter the code and create the admin again; then pair the screens.');
  process.exit(0);
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------ //
// | Nightly backup | //
// ------------------ //
// Nightly snapshot of the database (a consistent copy while running), for   //
// restic or OneDrive                                                        //
const { keyInfo } = backup.setup({
  db,
  dataDir: DATA_DIR,
  backupDir: cfg.backupDir,
  secretFromEnv: !!ENV.SECRET_KEY,
  today: clock.today
});

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------- //
// | Today's date | //
// ---------------- //
// Today's date: the screens, and the install and update health checks       //
app.get('/api/today', (_req, res) => {
  const today = clock.today();
  // (and how the screens show dates: the first day of the week, 24-hour times)
  res.json({ today, ym: today.slice(0, 7), weekStart: cfg.weekStart, time24: cfg.time24 });
});

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------------------------- //
// | Weather, trash day and the Notes column | //
// ------------------------------------------- //
// Weather, trash day and notes (top of the Notes column)                    //
extras.setup({
  app,
  broadcast,
  today: clock.today,
  trashDay: cfg.trashDay,
  kvGet,
  kvSet,
  weather: { lat: cfg.lat, lon: cfg.lon, unit: cfg.tempUnit, timeZone: cfg.timeZone, base: cfg.weatherUrl }
});

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------ //
// | Holidays | //
// ------------ //
// Holidays: worked out here, shown on the board only, any can be hidden     //
const holidayList = holidays.setup({ app, country: cfg.holidays, broadcast, today: clock.today, kvGet, kvSet });

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------- //
// | The calendar | //
// ---------------- //
// CalDAV (iCloud, Nextcloud...) or Google, plus read-only calendar links.   //
// The status is what the admin console shows (connected, which calendars,   //
// anything wrong).                                                          //
const google = createGoogle(cfg.google, DATA_DIR);
// the last good copy of each calendar's months, for when one can't be reached (server/calendar/cache.ts)
const calendar = createCalendarSource(cfg.calendar, clock, google, makeCalendarCache(db));
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
      const main = calendar.googleMain();
      return {
        provider: 'google',
        configured: !!cfg.google.id,
        connected: !!st.refresh,
        calendar: main?.name || st.calendarName || null,
        calendarId: main?.id || st.calendarId || null,
        calendars: calendar.googleCalendars(), // every calendar shown, with its color and whether it's read-only
        problems: Object.fromEntries(calendar.problems),
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

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------------- //
// | The board itself | //
// -------------------- //
// Each month's options, the art and stamps, the board style, meals, jars    //
// and chores.                                                               //
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

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------------- //
// | Colby's pages | //
// ----------------- //
// Reminders, timers and the pantry (from Colby Way's board).                //
reminders.setup({ app, db, clock, broadcast });
timers.setup({ app, db, broadcast });
pantry.setup({ app, db, today: clock.today, broadcast });

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------------------- //
// | Favorites on the strip | //
// -------------------------- //
// Kept per person when someone is signed in, otherwise per screen.          //
favorites.setup({
  app,
  kv,
  broadcast,
  whose: req => {
    const u = who.userOf(req);
    if (u) return 'p:' + u.id;
    const d = who.deviceOf(req);
    return d ? 's:' + d.id : null;
  }
});

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------------------------------- //
// | Uploads, pictures from links, the GIF library | //
// ------------------------------------------------- //
// Kept inside the backup folder, so they ride along with the backups.       //
media.setup({
  app,
  db,
  kv,
  mediaDir: path.join(cfg.backupDir, 'media'), // inside the backup folder, so they ride along with the backups
  allowPrivateLinks: cfg.allowPrivateLinks,
  testRoutes: cfg.testRoutes
});

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------- //
// | Photos | //
// ---------- //
// A shared album or Immich: the photos beside the month name and the        //
// overnight slideshow.                                                      //
photos.setup({ app, kv, broadcast, today: clock.today, cacheDir: path.join(DATA_DIR, 'photo-cache'), ...cfg.photos });

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------------------------------------- //
// | The pages, the admin console and updates | //
// -------------------------------------------- //
// The pages are served last: first every /api route, then the screens, then //
// any file in public/.                                                      //
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
updates.setup({ app, db, dataDir: DATA_DIR, version: VERSION, updater: ENV.UPDATER, audit: who.audit });
live.serve(app, { version: site.boardVersion, stillAllowed: ck => who.stillAllowed(ck) });
site.serve(); // last: the pages, then any file in public/

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------- //
// | Start listening | //
// ------------------- //
app.listen(cfg.port, cfg.bind, () =>
  console.log(`Family Chalk Planner on ${cfg.bind}:${cfg.port} (data in ${DATA_DIR})`)
);

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
