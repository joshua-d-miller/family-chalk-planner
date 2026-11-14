/*
===============================================================================
 Family Chalk Planner | Server | settings.ts
===============================================================================
 Version:   0.13.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-06
 Updated:   2026-11-07

 Purpose:
     Board settings: all kept in the database and changed in the admin
     console (⚙️ Board). There is no settings file. Only where the board
     lives (PORT, BIND, DATA_DIR, BACKUP_DIR) is server-level, set by the
     installer in the service definition (or by Docker).

     An install from before 0.7 had a .env file: its settings are moved
     into the database on the first start (once), and after that the
     environment no longer decides any of these.

     Passwords, the Google client secret and anything that works like a
     password (the calendar account name, the photo album link, calendar
     links that carry a private token) are encrypted with AES-256-GCM
     using a key that is NOT in the database: SECRET_KEY if set, otherwise
     data/secret.key (mode 600, created on first use, copied into the
     nightly backup). A copy of the database alone reveals none of them.
     If the key is lost, the board keeps working and the console asks for
     those values again.

 Used by:
     server/main.ts
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    Settings (admin console → ⚙️ Board) in
                        claude    TypeScript, same behavior.
                        colby
                                  Immich photos, slideshow extras, a filled-in
                                  today, and the frame's thickness.

                                  Home-network sign-in: just a password for
                                  the board at home, off unless turned on.

                                  Updates: database backup and restore, a real
                                  health check, Update now and nightly
                                  updates.
===============================================================================
*/

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------------- //
// | Checking a value | //
// -------------------- //
type Field =
  | { type: 'text'; max: number; private?: boolean }
  | { type: 'enum'; values: string[] }
  | { type: 'num'; min: number; max: number }
  | { type: 'json'; private?: boolean; check: (v: string) => string | null }
  | { type: 'tz' | 'url' | 'secret' | 'proxy'; private?: boolean };

const isHex = (c: unknown) => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c);
const isName = (n: unknown, max: number) =>
  typeof n === 'string' && n.trim().length > 0 && n.length <= max && !/[\r\n<>]/.test(n);

// a setting that is a JSON list of up to 8 objects, each passing `ok`
function jsonList(v: string, ok: (item: Record<string, unknown>) => boolean): string | null {
  let a: unknown;
  try {
    a = JSON.parse(v);
  } catch {
    return 'not a list';
  }
  if (!Array.isArray(a) || a.length > 8) return 'at most 8';
  return a.every(x => x && typeof x === 'object' && ok(x)) ? null : 'each needs a name, a color and a valid address';
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------------- //
// | Every setting | //
// ----------------- //
// Its type, its default, and whether it's kept encrypted. The admin console //
// builds its form from this list.                                           //
export const FIELDS: Record<string, Field> = {
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
  CALENDAR_PROVIDER: { type: 'enum', values: ['caldav', 'google', 'homeassistant'] },
  // the Home Assistant app: which of its calendars, the main one first: [{ id, name, color, main }]
  HA_CALENDARS: {
    type: 'json',
    check: v =>
      jsonList(
        v,
        c =>
          typeof c.id === 'string' &&
          /^calendar\.[a-z0-9_]{1,200}$/.test(c.id) &&
          isName(c.name, 100) &&
          isHex(c.color) &&
          (c.main === undefined || typeof c.main === 'boolean')
      )
  },
  CALDAV_URL: { type: 'url' },
  CALDAV_USER: { type: 'text', max: 200, private: true },
  CALDAV_PASSWORD: { type: 'secret' },
  CALDAV_CALENDAR: { type: 'text', max: 200 },
  GOOGLE_CLIENT_ID: { type: 'text', max: 200 },
  GOOGLE_CLIENT_SECRET: { type: 'secret' },
  GOOGLE_REDIRECT_URI: { type: 'url' },
  // more calendars on the same account, shown with their own color: [{ id, name, color }]
  // (id = the calendar's address for CalDAV, the calendar id for Google)
  EXTRA_CALENDARS: {
    type: 'json',
    check: v =>
      jsonList(
        v,
        c =>
          typeof c.id === 'string' && c.id.length <= 400 && /^\S+$/.test(c.id) && isName(c.name, 100) && isHex(c.color)
      )
  },
  // read-only calendar links (iCal / ICS: school, sports, holidays): [{ name, url, color }]
  ICS_FEEDS: {
    type: 'json',
    private: true,
    check: v =>
      jsonList(
        v,
        c =>
          isName(c.name, 60) &&
          isHex(c.color) &&
          typeof c.url === 'string' &&
          /^(https?|webcal):\/\/[^\s"<>]+$/i.test(c.url) &&
          c.url.length <= 1000
      )
  },
  // photos
  PHOTO_ALBUM_URL: { type: 'url', private: true },
  // or Immich (from Colby Way's board): the server's address, an API key, and which photos
  IMMICH_URL: { type: 'url' },
  IMMICH_API_KEY: { type: 'secret' },
  IMMICH_ALBUM: { type: 'text', max: 200 },
  // the board on your network
  PUBLIC_URL: { type: 'url' },
  TRUST_PROXY: { type: 'proxy' },
  ALLOW_UNPAIRED_VIEW: { type: 'enum', values: ['true', 'false'] },
  // board sign-in with just a password on the home network, when the board is opened by its IP address
  HOME_SIGNIN: { type: 'enum', values: ['off', 'on'] },
  UPDATE_CHANNEL: { type: 'enum', values: ['release', 'main'] },
  // install minor and patch releases by themselves, overnight (deploy/update.sh --nightly)
  AUTO_UPDATE: { type: 'enum', values: ['off', 'on'] },
  SOURCE_URL: { type: 'url' }
};

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------------------------- //
// | Trusted proxies and time zones | //
// ---------------------------------- //
// TRUST_PROXY: addresses / ranges of the reverse proxy, or Express's names  //
// for groups of them                                                        //
const proxyOk = (v: string) =>
  v
    .split(/\s*,\s*/)
    .every(
      p =>
        /^(loopback|linklocal|uniquelocal)$/.test(p) ||
        /^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/.test(p) ||
        /^[0-9a-f:]+(\/\d{1,3})?$/i.test(p)
    );

function validTz(v: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: v });
    return true;
  } catch {
    return false;
  }
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------------------------- //
// | What's wrong with a value | //
// ----------------------------- //
// What's wrong with a value for a setting, or null if it's fine ('' always  //
// is: it means the default)                                                 //
export function check(key: string, value: unknown): string | null {
  const f = FIELDS[key];
  if (!f) return 'unknown setting';
  const v = String(value ?? '').trim();
  if (v === '') return null;
  if (/[\r\n\0]/.test(v)) return 'one line only'; // (json lists are sent as one line too)
  switch (f.type) {
    case 'text':
      return v.length > f.max ? `at most ${f.max} characters` : null;
    case 'secret':
      return v.length > 500 ? 'too long' : null;
    case 'tz':
      return validTz(v) ? null : 'not a time zone (e.g. America/New_York)';
    case 'num':
      return Number.isFinite(+v) && +v >= f.min && +v <= f.max ? null : `a number from ${f.min} to ${f.max}`;
    case 'enum':
      return f.values.includes(v) ? null : `one of ${f.values.join(', ')}`;
    case 'json':
      return v.length > 20000 ? 'too long' : f.check(v);
    case 'proxy':
      return v.length <= 300 && proxyOk(v)
        ? null
        : 'an IP address (e.g. 192.168.1.10), a range (10.0.0.0/8), or several separated by commas';
    case 'url':
      try {
        const u = new URL(v);
        if (!/^https?:$/.test(u.protocol) || u.username || u.password) throw new Error();
        return null;
      } catch {
        return 'an http(s) address';
      }
  }
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------ //
// | Kept encrypted | //
// ------------------ //
// Kept encrypted in the database                                            //
const isSealed = (f: Field) => f.type === 'secret' || ('private' in f && !!f.private);

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------ //
// | Old .env names | //
// ------------------ //
// The old names some settings had in .env files before 0.6                  //
const LEGACY_NAMES: Record<string, string> = {
  CALDAV_USER: 'ICLOUD_USER',
  CALDAV_PASSWORD: 'ICLOUD_APP_PASSWORD',
  CALDAV_CALENDAR: 'ICLOUD_CALENDAR'
};

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------- //
// | Types | //
// --------- //
interface Imported {
  at: number;
  moved: string[];
  skipped: string[];
}
export interface FieldView {
  type: Field['type'];
  values?: string[];
  source: 'console' | 'default';
  set?: boolean; // secrets: only whether one is set, never the value
  value?: string;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------------------- //
// | Settings in the database | //
// ---------------------------- //
export function setup({
  db,
  DATA_DIR,
  log = console,
  importEnv = true
}: {
  db: DatabaseSync;
  DATA_DIR: string;
  log?: Pick<Console, 'log' | 'error'>;
  importEnv?: boolean;
}) {
  db.exec('CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, data TEXT NOT NULL)');

  // The encryption key. Only saving makes a new one; reading never does (a missing key = values to re-enter).
  let keyCache: Buffer | null = null;
  // ---------------------- //
  // | The encryption key | //
  // ---------------------- //
  // SECRET_KEY if set, otherwise data/secret.key (mode 600, created on      //
  // first use). AES-256-GCM; a lost key only means typing those values      //
  // again.                                                                  //
  function key(create = false): Buffer {
    if (keyCache) return keyCache;
    const derive = (secret: string) =>
      crypto
        .createHash('sha256')
        .update('fcp-settings:' + secret)
        .digest();
    if (process.env.SECRET_KEY) return (keyCache = derive(process.env.SECRET_KEY));
    const file = path.join(DATA_DIR, 'secret.key');
    if (!fs.existsSync(file)) {
      if (!create) throw new Error('no key');
      fs.writeFileSync(file, crypto.randomBytes(32).toString('base64') + '\n', { mode: 0o600 });
    }
    return (keyCache = derive(fs.readFileSync(file, 'utf8').trim()));
  }
  // 'k1:' + base64(iv | tag | ciphertext)
  function seal(v: string) {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', key(true), iv);
    const ct = Buffer.concat([c.update(v, 'utf8'), c.final()]);
    return 'k1:' + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
  }
  function unseal(s: string) {
    const b = Buffer.from(s.slice(3), 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', key(), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
  }
  // values saved before they were encrypted are plain
  const reveal = (v: unknown) => (String(v).startsWith('k1:') ? unseal(String(v)) : String(v));

  const kvGet = (k: string): unknown => {
    const r = db.prepare('SELECT data FROM kv WHERE key = ?').get(k) as { data: string } | undefined;
    try {
      return r ? JSON.parse(r.data) : null;
    } catch {
      return null;
    }
  };
  const kvSet = (k: string, v: unknown) =>
    db
      .prepare('INSERT INTO kv (key, data) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data')
      .run(k, JSON.stringify(v));
  const load = () => (kvGet('settings') as Record<string, string> | null) || {};
  const store = (s: Record<string, string>) => kvSet('settings', s);
  const toStored = (k: string, v: string) =>
    isSealed(FIELDS[k]) ? seal(v) : FIELDS[k].type === 'num' ? String(+v) : v;

  // ---- once: move an old .env's settings into the database ----
  let imported = kvGet('settings_imported') as Imported | null;
  if (!imported && importEnv) {
    const cur = load();
    const moved: string[] = [];
    const skipped: string[] = [];
    for (const k of Object.keys(FIELDS)) {
      const v = String(process.env[k] ?? process.env[LEGACY_NAMES[k]] ?? '')
        .trim()
        .replace(/^"(.*)"$/, '$1');
      if (!v || cur[k] !== undefined) continue;
      if (check(k, v)) {
        skipped.push(k);
        continue;
      }
      cur[k] = toStored(k, v);
      moved.push(k);
    }
    if (moved.length) store(cur);
    imported = { at: Date.now(), moved, skipped };
    kvSet('settings_imported', imported);
    if (moved.length)
      log.log(
        `Chalk Planner: moved ${moved.length} setting(s) from the environment/.env into the admin console (${moved.join(', ')}). The .env file isn't needed any more.`
      );
    if (skipped.length)
      log.error(
        `Chalk Planner: these .env settings weren't valid and were left out: ${skipped.join(', ')} - set them in the admin console`
      );
  }

  // ---- apply: the database decides; nothing from the environment leaks through ----
  const saved = load();
  const lost: string[] = [];
  for (const k of Object.keys(FIELDS)) delete process.env[k];
  for (const k of Object.values(LEGACY_NAMES)) delete process.env[k];
  for (const [k, v] of Object.entries(saved)) {
    if (!FIELDS[k]) continue;
    try {
      process.env[k] = isSealed(FIELDS[k]) ? reveal(v) : String(v);
    } catch {
      lost.push(k);
    }
  }
  if (lost.length)
    log.error(
      `Chalk Planner: couldn't unlock ${lost.join(', ')} (secret.key / SECRET_KEY changed) - enter them again in the admin console`
    );

  // -------------------------- //
  // | What the console shows | //
  // -------------------------- //
  // What the console shows: every field, where its value comes from, and    //
  // the value (never a secret's)                                            //
  function view() {
    const cur = load();
    const fields: Record<string, FieldView> = {};
    for (const [k, f] of Object.entries(FIELDS)) {
      const has = cur[k] !== undefined && !lost.includes(k);
      const out: FieldView = {
        type: f.type,
        values: 'values' in f ? f.values : undefined,
        source: has ? 'console' : 'default'
      };
      if (f.type === 'secret') out.set = has;
      else out.value = !has ? '' : isSealed(f) ? reveal(cur[k]) : cur[k];
      fields[k] = out;
    }
    return { fields, lost, imported: imported?.moved?.length ? imported : null };
  }

  // ---------- //
  // | Saving | //
  // ---------- //
  // Values: {KEY: 'new value'}; an empty string clears it (back to the      //
  // default). Secrets: leave out (or undefined) to keep; '' to remove.      //
  function save(
    values: Record<string, unknown> | null | undefined
  ): { errors: Record<string, string> } | { changed: string[] } {
    const cur = load();
    const errors: Record<string, string> = {};
    const changed: string[] = [];
    for (const [k, raw] of Object.entries(values || {})) {
      if (!FIELDS[k] || raw === undefined || raw === null) continue;
      const v = String(raw).trim();
      const e = check(k, v);
      if (e) {
        errors[k] = e;
        continue;
      }
      if (v === '') {
        if (cur[k] !== undefined) {
          delete cur[k];
          changed.push(k);
        }
        continue;
      }
      let now: string | undefined;
      if (cur[k] !== undefined) {
        try {
          now = isSealed(FIELDS[k]) ? reveal(cur[k]) : cur[k];
        } catch {
          now = undefined;
        }
      }
      if (FIELDS[k].type === 'secret' || now !== v) {
        cur[k] = toStored(k, v);
        changed.push(k);
      }
    }
    if (Object.keys(errors).length) return { errors };
    if (changed.length) store(cur);
    return { changed };
  }

  // ------------------------ //
  // | For the command line | //
  // ------------------------ //
  // For the server's command line (deploy/setting.sh): read one value       //
  function get(k: string) {
    const cur = load();
    if (!FIELDS[k] || cur[k] === undefined) return '';
    return isSealed(FIELDS[k]) ? reveal(cur[k]) : cur[k];
  }

  return { view, save, get, FIELDS, lost };
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
