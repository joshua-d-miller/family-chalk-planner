/*
===============================================================================
 Family Chalk Planner | Server | config.ts
===============================================================================
 Version:   1.2.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-06
 Updated:   2026-11-28

 Purpose:
     The board's settings, read once at start-up: the environment (.env),
     with what the admin console saved already put into it (settings.ts).
     Saving in the console restarts the board, so these never change while
     it runs.

 Used by:
     server/main.ts
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    Server and tests are all TypeScript (ES
                        claude    modules).
                        colby
                                  Immich photos, slideshow extras, a filled-in
                                  today, and the frame's thickness.

 1.1.0    2026-11-17   joshua    Which photos, and how many copies the board
                        claude    keeps (PHOTO_PICK, PHOTO_RANDOM_COUNT,
                                  PHOTO_KEEP, PHOTO_KEEP_COUNT).

 1.2.0    2026-11-21   joshua    language: the board's (LANGUAGE).
                        claude    

 1.3.0    2026-11-28   joshua    photos.moreAlbums.
                        claude
===============================================================================
*/

import path from 'node:path';
import type { Country } from './holidays.ts';
import type { CalendarConfig } from './calendar/source.ts';
import type { MoreAlbum } from './photos/photos.ts';

const num = <D>(v: string | undefined, d: D) => (v === undefined || v === '' || !Number.isFinite(+v) ? d : +v);

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------- //
// | A saved list | //
// ---------------- //
// A list kept as JSON (at most 8), as the console saved it                  //
function jsonList<T>(v: string | undefined): T[] {
  try {
    const a = JSON.parse(v || '[]');
    return Array.isArray(a) ? a.slice(0, 8) : [];
  } catch {
    return [];
  }
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------------------------- //
// | Every setting the board uses | //
// -------------------------------- //
// Read from ENV (with the admin console's values already in it), checked,   //
// and given its default. Saving in the console restarts the board, so none  //
// of these change while it runs.                                            //
export function readConfig(env: NodeJS.ProcessEnv, appDir: string, dataDir: string) {
  const holidays = (env.HOLIDAYS || '').toLowerCase();
  // in the Home Assistant app, its own calendars unless another account was set up
  const asked = (
    env.CALENDAR_PROVIDER ||
    (env.GOOGLE_CLIENT_ID ? 'google' : env.SUPERVISOR_TOKEN && !env.CALDAV_USER ? 'homeassistant' : 'caldav')
  ).toLowerCase();
  const provider =
    asked === 'google'
      ? ('google' as const)
      : asked === 'homeassistant' && env.SUPERVISOR_TOKEN
        ? ('homeassistant' as const)
        : ('caldav' as const);
  const faceDir = env.FACE_DIR || path.join(appDir, 'face');
  const cfg = {
    port: num(env.PORT, 3002),
    haTodoLists: jsonList<{ id: string; name: string }>(env.HA_TODO_LISTS), // the Home Assistant app: on the Chores page
    bind: env.BIND || '0.0.0.0',
    backupDir: env.BACKUP_DIR || path.join(dataDir, 'backup'), // snapshots, the key, and uploads (media/)
    // else the server's own time zone
    timeZone: env.TIMEZONE || env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    lat: num(env.LATITUDE, null), // weather is off until both are set
    lon: num(env.LONGITUDE, null),
    tempUnit: env.TEMP_UNIT === 'celsius' ? ('celsius' as const) : ('fahrenheit' as const),
    trashDay: /^[0-6]$/.test(env.TRASH_DAY || '') ? +env.TRASH_DAY! : null, // 0 = Sunday ... 6 = Saturday; empty = off
    holidays: (['us', 'ca', 'gb', 'none'].includes(holidays) ? holidays : 'us') as Country,
    weekStart: ((env.WEEK_START || '').toLowerCase() === 'monday' ? 1 : 0) as 0 | 1, // 0 = weeks start on Sunday
    time24: /^24/.test(env.TIME_FORMAT || ''),
    language: (env.LANGUAGE === 'es' ? 'es' : 'en') as 'en' | 'es', // the board's; each screen can pick its own
    title: String(env.BOARD_TITLE || 'Family Chalk Planner').slice(0, 60),
    // AGPL: people using the board can get its source. Point this at your fork if you change the code.
    sourceUrl: /^https?:\/\/[^\s"<>]+$/.test(env.SOURCE_URL || '')
      ? env.SOURCE_URL!
      : 'https://github.com/joshua-d-miller/family-chalk-planner',
    // Calendar: any CalDAV server (iCloud, Nextcloud, Fastmail...) with a password, or Google Calendar
    // (Google's CalDAV with a Google sign-in instead of a password). ICLOUD_* names still work.
    calendar: {
      provider,
      caldavUrl: env.CALDAV_URL || 'https://caldav.icloud.com/',
      user: env.CALDAV_USER || env.ICLOUD_USER,
      password: env.CALDAV_PASSWORD || env.ICLOUD_APP_PASSWORD,
      calendarName: env.CALDAV_CALENDAR || env.ICLOUD_CALENDAR,
      extraCalendars: jsonList<CalendarConfig['extraCalendars'][number]>(env.EXTRA_CALENDARS), // [{ id, name, color }] more calendars on the same account
      haCalendars: jsonList<CalendarConfig['haCalendars'][number]>(env.HA_CALENDARS), // the Home Assistant app: its calendars
      feeds: jsonList<CalendarConfig['feeds'][number]>(env.ICS_FEEDS).map(f => ({
        ...f,
        url: String(f.url || '').replace(/^webcal:/i, 'https:')
      })) // read-only links
    },
    google: {
      id: env.GOOGLE_CLIENT_ID || '',
      secret: env.GOOGLE_CLIENT_SECRET || '',
      redirect: env.GOOGLE_REDIRECT_URI || 'http://localhost', // default: paste the address back (works without HTTPS)
      auth: env.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth',
      token: env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token',
      api: env.GOOGLE_API_BASE || 'https://www.googleapis.com',
      dav: env.GOOGLE_CALDAV_BASE || 'https://apidata.googleusercontent.com'
    },
    weatherUrl: env.WEATHER_URL || 'https://api.open-meteo.com',
    photos: {
      album: { url: (env.PHOTO_ALBUM_URL || '').trim(), googleHost: env.PHOTO_GOOGLE_HOST, ckHost: env.PHOTO_CK_HOST },
      immich: {
        url: env.IMMICH_URL || '',
        key: env.IMMICH_API_KEY || '',
        album: env.IMMICH_ALBUM || '',
        videos: env.IMMICH_VIDEOS === 'on' // videos too, up to 2 minutes each
      },
      // more albums (⚙️ Board → Photos → More albums): [{ id, name, url } | { id, name, immich }]
      moreAlbums: jsonList<MoreAlbum>(env.MORE_ALBUMS),
      // which photos, and how many copies the board keeps (server/photos/photos.ts)
      choose: {
        pick: (['picked', 'random'].includes(env.PHOTO_PICK || '') ? env.PHOTO_PICK : 'all') as
          'all' | 'picked' | 'random',
        randomCount: Math.min(1000, Math.max(5, Math.round(Number(env.PHOTO_RANDOM_COUNT) || 50))),
        keep: (env.PHOTO_KEEP === 'few' ? 'few' : 'all') as 'all' | 'few',
        keepCount: Math.min(50, Math.max(2, Math.round(Number(env.PHOTO_KEEP_COUNT) || 5)))
      },
      faceDir,
      facePython: env.FACE_PYTHON || path.join(faceDir, 'venv', 'bin', 'python')
    },
    trustProxy: env.TRUST_PROXY || 'loopback, uniquelocal', // the reverse proxy, for the client address
    allowPrivateLinks: env.ALLOW_PRIVATE_LINKS === '1', // tests only
    testRoutes: env.NODE_ENV === 'test'
  };
  const c = cfg.calendar;
  if (c.provider === 'google' && !cfg.google.id)
    console.error('Chalk Planner: CALENDAR_PROVIDER=google but GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set');
  if (c.provider === 'homeassistant' && !c.haCalendars.length)
    console.error('Chalk Planner: no Home Assistant calendars picked yet (admin console → ⚙️ Board → Calendar)');
  if (c.provider === 'caldav' && (!c.user || !c.password || !c.calendarName))
    console.error('Chalk Planner: CALDAV_USER / CALDAV_PASSWORD / CALDAV_CALENDAR are not set - no calendar events');
  return cfg;
}
export type Config = ReturnType<typeof readConfig>;

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
