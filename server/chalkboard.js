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
const ICAL = require('ical.js');

// ---- Settings: the environment (.env), overridden by what the admin console saved (server/settings.js) ----
const ENV = process.env;
const num = (v, d) => (v === undefined || v === '' || !Number.isFinite(+v) ? d : +v);
const APP_DIR = path.join(__dirname, '..');
const DATA_DIR = ENV.DATA_DIR || path.join(APP_DIR, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'chalkboard.db'));
const boardSettings = require('./settings').setup({ db, DATA_DIR });   // puts the console's values into ENV
const PORT = num(ENV.PORT, 3002);
const BIND = ENV.BIND || '0.0.0.0';
const TZ = ENV.TIMEZONE || ENV.TZ || 'UTC';   // TZ: the usual container variable
const LAT = num(ENV.LATITUDE, null), LON = num(ENV.LONGITUDE, null);   // weather is off until both are set
const TEMP_UNIT = ENV.TEMP_UNIT === 'celsius' ? 'celsius' : 'fahrenheit';
const TRASH_DAY = /^[0-6]$/.test(ENV.TRASH_DAY || '') ? +ENV.TRASH_DAY : null;   // 0 = Sunday ... 6 = Saturday; empty = off
const HOLIDAYS = (ENV.HOLIDAYS || 'us').toLowerCase();   // 'us' or 'none'
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
const AUTH = 'Basic ' + Buffer.from(`${ICLOUD_USER}:${ICLOUD_PASS}`).toString('base64');

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

// ---------------------------------------------------------------------------
// Date helpers (everything shown in TIMEZONE)
// ---------------------------------------------------------------------------
function nyParts(date) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short'
  });
  const p = {};
  for (const x of f.formatToParts(date)) p[x.type] = x.value;
  return {
    y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute,
    dateStr: `${p.year}-${p.month}-${p.day}`
  };
}

// Local New York wall-clock time -> real instant
function nyToDate(y, m, d, h, mi) {
  let guess = Date.UTC(y, m - 1, d, h, mi);
  for (let i = 0; i < 2; i++) {
    const p = nyParts(new Date(guess));
    const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
    guess += Date.UTC(y, m - 1, d, h, mi) - asUtc;
  }
  return new Date(guess);
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

function fmtTime(h, mi) {
  const ap = h < 12 ? 'am' : 'pm';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return mi ? `${hh}:${String(mi).padStart(2, '0')}${ap}` : `${hh}${ap}`;
}

function icsUtc(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function icsEscape(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function xmlUnescape(s) {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&#13;/g, '\r').replace(/&amp;/g, '&');
}

// Grid for a month: starts on the Sunday on/before the 1st, 5 or 6 weeks.
function monthGrid(ym) {
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = first.getUTCDay();
  const weeks = Math.ceil((lead + daysInMonth) / 7);
  const start = addDays(`${y}-${String(m).padStart(2, '0')}-01`, -lead);
  const end = addDays(start, weeks * 7); // exclusive
  return { y, m, weeks, start, end, daysInMonth };
}

// ---------------------------------------------------------------------------
// Calendar over CalDAV (iCloud, Nextcloud, Fastmail... or Google with OAuth)
// ---------------------------------------------------------------------------
let calUrl = null;

// Google sign-in: the refresh token and chosen calendar live in DATA_DIR/google-auth.json (mode 600)
const G_FILE = path.join(DATA_DIR, 'google-auth.json');
let gAccess = null;   // { token, exp }
function gLoad() { try { return JSON.parse(fs.readFileSync(G_FILE, 'utf8')); } catch { return {}; } }
function gSave(o) { fs.writeFileSync(G_FILE, JSON.stringify(o), { mode: 0o600 }); fs.chmodSync(G_FILE, 0o600); }
async function gTokenRequest(params) {
  const r = await fetch(G.token, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: G.id, client_secret: G.secret, ...params }), signal: AbortSignal.timeout(20000)
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, j };
}
async function gToken() {
  if (gAccess && gAccess.exp > Date.now() + 60 * 1000) return gAccess.token;
  const st = gLoad();
  if (!st.refresh) throw new Error(st.problem || 'Google isn’t connected yet - connect it in ⚙ Settings on the tablet');
  const { ok, status, j } = await gTokenRequest({ refresh_token: st.refresh, grant_type: 'refresh_token' });
  if (!ok) {
    if (j.error === 'invalid_grant') {   // revoked, or a project left in "Testing" (sign-ins expire after 7 days)
      gSave({ ...st, refresh: null, problem: 'Google sign-in expired or was removed - reconnect in ⚙ Settings' });
    }
    throw new Error(`Google sign-in failed (${j.error || status}) - reconnect in ⚙ Settings`);
  }
  gAccess = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return gAccess.token;
}
async function authHeader() { return PROVIDER === 'google' ? `Bearer ${await gToken()}` : AUTH; }
const sameUrl = (u, base) => { try { return decodeURIComponent(u).startsWith(decodeURIComponent(base)); } catch { return false; } };

async function dav(url, method, body, depth = '0', extraHeaders = {}) {
  const r = await fetch(url, {
    method,
    headers: { Authorization: await authHeader(), 'Content-Type': 'application/xml; charset=utf-8', Depth: depth, ...extraHeaders },
    body,
    signal: AbortSignal.timeout(20000)
  });
  if (!(r.ok || r.status === 207)) throw new Error(`Calendar ${method} returned ${r.status}`);
  return r.text();
}

async function findCalendar() {
  if (calUrl) return calUrl;
  if (PROVIDER === 'google') {
    const st = gLoad();
    if (!st.calendarId) throw new Error(st.refresh ? 'Pick which Google calendar to show in ⚙ Settings on the tablet' : (st.problem || 'Google isn’t connected yet - connect it in ⚙ Settings on the tablet'));
    calUrl = `${G.dav}/caldav/v2/${encodeURIComponent(st.calendarId)}/events/`;
    return calUrl;
  }
  const found = (await caldavCalendars(CALDAV_URL, AUTH)).find(c => c.name === CAL_NAME);
  if (!found) throw new Error(`Calendar "${CAL_NAME}" not found on the server`);
  calUrl = found.url;
  return calUrl;
}
// Every calendar on a CalDAV account: [{ name, url }] (also used by the console's "Find my calendars")
async function caldavCalendars(base, auth) {
  const req = async (url, body, depth = '0') => {
    const r = await fetch(url, { method: 'PROPFIND', headers: { Authorization: auth, 'Content-Type': 'application/xml; charset=utf-8', Depth: depth }, body, signal: AbortSignal.timeout(20000) });
    if (r.status === 401 || r.status === 403) throw new Error('The calendar server didn’t accept that username and password');
    if (!(r.ok || r.status === 207)) throw new Error(`The calendar server answered ${r.status}`);
    return r.text();
  };
  const p = await req(base, '<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>');
  const principal = (p.match(/current-user-principal[^>]*>\s*<(?:\w+:)?href[^>]*>([^<]+)</) || p.match(/>(\/[0-9]+\/principal\/)</) || [])[1];
  if (!principal) throw new Error('Calendar login failed (no principal)');
  const principalUrl = new URL(xmlUnescape(principal.trim()), base).toString();
  const h = await req(principalUrl, '<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>');
  const homeHref = (h.match(/calendar-home-set[^>]*>\s*<(?:\w+:)?href[^>]*>([^<]+)</) || [])[1];
  if (!homeHref) throw new Error('Calendar home not found');
  const home = new URL(xmlUnescape(homeHref.trim()), principalUrl).toString();
  const list = await req(home, '<d:propfind xmlns:d="DAV:"><d:prop><d:displayname/><d:resourcetype/></d:prop></d:propfind>', '1');
  const out = [];
  for (const block of list.split(/<(?:\w+:)?response[\s>]/).slice(1)) {
    const href = (block.match(/<(?:\w+:)?href[^>]*>([^<]+)</) || [])[1];
    const name = (block.match(/<(?:\w+:)?displayname[^>]*>([^<]*)</) || [])[1];
    if (!href || !name || !xmlUnescape(name).trim()) continue;
    if (/resourcetype/.test(block) && !/<(?:\w+:)?calendar[\s/>]/.test(block.split(/resourcetype/)[1] || '')) continue;   // not a calendar (inbox, outbox…)
    let url = new URL(href, home).toString(); if (!url.endsWith('/')) url += '/';
    out.push({ name: xmlUnescape(name).trim(), url });
  }
  return out;
}

// Turn one occurrence into what the board needs.
function toBoardEvent(title, startTime, endTime) {
  if (startTime.isDate) {
    const s = `${startTime.year}-${String(startTime.month).padStart(2, '0')}-${String(startTime.day).padStart(2, '0')}`;
    let e = s;
    if (endTime && endTime.isDate) {
      const ex = `${endTime.year}-${String(endTime.month).padStart(2, '0')}-${String(endTime.day).padStart(2, '0')}`;
      e = addDays(ex, -1); // DTEND is exclusive for all-day events
      if (e < s) e = s;
    }
    return { title, allDay: true, start: s, end: e, time: null, hm: null, minutes: null, sort: 0 };
  }
  const sp = nyParts(startTime.toJSDate());
  let end = sp.dateStr;
  if (endTime) {
    const ep = nyParts(new Date(endTime.toJSDate().getTime() - 1));
    if (ep.dateStr > sp.dateStr) end = ep.dateStr;
  }
  const minutes = endTime ? Math.max(5, Math.round((endTime.toJSDate() - startTime.toJSDate()) / 60000)) : 60;
  return {
    title, allDay: false, start: sp.dateStr, end, time: fmtTime(sp.h, sp.mi),
    hm: `${String(sp.h).padStart(2, '0')}:${String(sp.mi).padStart(2, '0')}`, minutes, sort: sp.h * 60 + sp.mi
  };
}

const monthCache = new Map(); // ym -> { at, events }

async function eventsForMonth(ym) {
  const cached = monthCache.get(ym);
  if (cached && Date.now() - cached.at < 60 * 1000) return cached.events;

  const g = monthGrid(ym);
  const rangeStart = nyToDate(...g.start.split('-').map(Number), 0, 0);
  const rangeEnd = nyToDate(...g.end.split('-').map(Number), 0, 0);
  const url = await findCalendar();

  const xml = await dav(url, 'REPORT', `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><d:getetag/><c:calendar-data/></d:prop>
  <c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT">
    <c:time-range start="${icsUtc(rangeStart)}" end="${icsUtc(rangeEnd)}"/>
  </c:comp-filter></c:comp-filter></c:filter>
</c:calendar-query>`, '1');

  const out = [];
  for (const block of xml.split(/<(?:\w+:)?response[\s>]/).slice(1)) {
    const href = (block.match(/<(?:\w+:)?href[^>]*>([^<]+)</) || [])[1];
    const etag = (block.match(/<(?:\w+:)?getetag[^>]*>([^<]+)</) || [])[1];
    const data = (block.match(/<(?:\w+:)?calendar-data[^>]*>([\s\S]*?)<\/(?:\w+:)?calendar-data>/) || [])[1];
    if (!href || !data) continue;
    const ref = { href: xmlUnescape(href.trim()), etag: etag ? xmlUnescape(etag.trim()) : null };
    try {
      const comp = new ICAL.Component(ICAL.parse(xmlUnescape(data)));
      registerZones(comp);
      const vevents = comp.getAllSubcomponents('vevent');
      const masters = vevents.filter(v => !v.hasProperty('recurrence-id')).map(v => new ICAL.Event(v));
      const exceptions = vevents.filter(v => v.hasProperty('recurrence-id')).map(v => new ICAL.Event(v));
      for (const ev of masters) {
        for (const ex of exceptions) if (ex.uid === ev.uid) ev.relateException(ex);
        const title = ev.summary || '(no title)';
        if (ev.isRecurring()) {
          const it = ev.iterator();
          let next, guard = 0;
          while ((next = it.next()) && guard++ < 1000) {
            const det = ev.getOccurrenceDetails(next);
            const sJs = det.startDate.toJSDate();
            if (sJs >= rangeEnd) break;
            if (det.endDate.toJSDate() <= rangeStart) continue;
            const be = toBoardEvent(det.item.summary || title, det.startDate, det.endDate);
            be.ref = { ...ref, rid: det.recurrenceId.toICALString() };
            be.recurring = true;
            out.push(be);
          }
        } else {
          const be = toBoardEvent(title, ev.startDate, ev.endDate);
          be.ref = { ...ref, rid: null };
          be.recurring = false;
          out.push(be);
        }
      }
    } catch (e) {
      console.error('Chalkboard: skipped an unreadable event:', e.message);
    }
  }

  out.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.sort - b.sort));
  monthCache.set(ym, { at: Date.now(), events: out });
  return out;
}

async function addEvent({ title, date, allDay, time, minutes, through }) {
  const url = await findCalendar();
  const uid = crypto.randomUUID();
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Family Chalk Planner//EN',
    'BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${icsUtc(new Date())}`, `SUMMARY:${icsEscape(title)}`
  ];
  if (allDay) {
    const last = through && through >= date ? through : date;
    lines.push(`DTSTART;VALUE=DATE:${date.replace(/-/g, '')}`);
    lines.push(`DTEND;VALUE=DATE:${addDays(last, 1).replace(/-/g, '')}`);
  } else {
    const [y, m, d] = date.split('-').map(Number);
    const [h, mi] = time.split(':').map(Number);
    const start = nyToDate(y, m, d, h, mi);
    const end = new Date(start.getTime() + (minutes || 60) * 60000);
    lines.push(`DTSTART:${icsUtc(start)}`, `DTEND:${icsUtc(end)}`);
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');

  const r = await fetch(`${url}${uid}.ics`, {
    method: 'PUT',
    headers: { Authorization: await authHeader(), 'Content-Type': 'text/calendar; charset=utf-8', 'If-None-Match': '*' },
    body: lines.join('\r\n') + '\r\n',
    signal: AbortSignal.timeout(20000)
  });
  if (!r.ok) throw new Error(`The calendar refused the event (${r.status})`);
  monthCache.clear();
  return new URL(`${url}${uid}.ics`).pathname;
}

// ---------------------------------------------------------------------------
// Editing / deleting existing events
//   scope 'all' = the whole event (or whole series); 'one' = just this occurrence
// ---------------------------------------------------------------------------
function registerZones(comp) {
  for (const tz of comp.getAllSubcomponents('vtimezone')) {
    try { ICAL.TimezoneService.register(tz); } catch (e) { /* already known */ }
  }
}

function setTime(vevent, name, time) {
  vevent.removeAllProperties(name);
  const p = new ICAL.Property(name);
  p.setValue(time);
  const tzid = time.zone && time.zone.tzid;
  if (!time.isDate && tzid && tzid !== 'UTC' && tzid !== 'Z' && tzid !== 'floating') p.setParameter('tzid', tzid);
  vevent.addProperty(p);
  return p;
}

// New start/end from the edit card
function newTimes({ date, allDay, time, minutes, through }) {
  if (allDay) {
    const [y, m, d] = date.split('-').map(Number);
    const last = through && through >= date ? through : date;
    const [ly, lm, ld] = addDays(last, 1).split('-').map(Number);
    return {
      start: ICAL.Time.fromData({ year: y, month: m, day: d, isDate: true }),
      end: ICAL.Time.fromData({ year: ly, month: lm, day: ld, isDate: true })
    };
  }
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const startJs = nyToDate(y, m, d, h, mi);
  return {
    start: ICAL.Time.fromJSDate(startJs, true),
    end: ICAL.Time.fromJSDate(new Date(startJs.getTime() + (minutes || 60) * 60000), true)
  };
}

// The occurrence's RECURRENCE-ID as a time in the master's zone/type
function ridTime(master, rid) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(rid || '');
  if (!m) throw new Error('bad occurrence id');
  const base = master.getFirstPropertyValue('dtstart');
  if (m[7] && !base.isDate) {
    const utc = ICAL.Time.fromData({ year: +m[1], month: +m[2], day: +m[3], hour: +m[4], minute: +m[5], second: +m[6] }, ICAL.Timezone.utcTimezone);
    return utc.convertToZone(base.zone);
  }
  const t = base.clone();
  t.year = +m[1]; t.month = +m[2]; t.day = +m[3];
  if (!t.isDate) { t.hour = +(m[4] || 0); t.minute = +(m[5] || 0); t.second = +(m[6] || 0); }
  return t;
}

function bumpSequence(vevent) {
  const seq = Number(vevent.getFirstPropertyValue('sequence') || 0) + 1;
  vevent.updatePropertyWithValue('sequence', seq);
  vevent.updatePropertyWithValue('dtstamp', ICAL.Time.now());
}

// Returns { del: true } to remove the whole resource, or { text } to PUT back
function applyEventChange(icsText, ref, scope, change) {
  const cal = new ICAL.Component(ICAL.parse(icsText));
  registerZones(cal);
  const vevents = cal.getAllSubcomponents('vevent');
  const master = vevents.find(v => !v.hasProperty('recurrence-id')) || vevents[0];
  if (!master) throw new Error('No event found in that entry');
  const recurring = master.hasProperty('rrule') || master.hasProperty('rdate');

  // Whole event / whole series
  if (!recurring || scope === 'all' || !ref.rid) {
    if (!change) return { del: true };
    master.updatePropertyWithValue('summary', change.title);
    if (!recurring) {
      const t = newTimes(change);
      setTime(master, 'dtstart', t.start);
      master.removeAllProperties('duration');
      setTime(master, 'dtend', t.end);
    } else {
      // Series: title, time of day and length can change; moving the series' day can't (it would fight the repeat rule)
      const occ = ridTime(master, ref.rid);
      if (change.date !== `${occ.year}-${String(occ.month).padStart(2, '0')}-${String(occ.day).padStart(2, '0')}`) {
        throw new Error('To move a repeating event to another day, choose “Just this one” or use Apple Calendar');
      }
      const ms = master.getFirstPropertyValue('dtstart');
      if (!!change.allDay !== !!ms.isDate) throw new Error('Switch a repeating event to/from all-day in Apple Calendar');
      if (!ms.isDate) {
        // shift by the wall-clock difference between the old and new time of day, keeping the series' time zone
        const [h, mi] = change.time.split(':').map(Number);
        const delta = (h * 60 + mi) - (occ.hour * 60 + occ.minute);
        const start = ms.clone(); start.adjust(0, 0, delta, 0);
        const end = start.clone(); end.adjust(0, 0, change.minutes || 60, 0);
        setTime(master, 'dtstart', start);
        master.removeAllProperties('duration');
        setTime(master, 'dtend', end);
        if (delta) {
          // skipped days (EXDATE) and one-off changes (RECURRENCE-ID) are keyed by the old start time:
          // move them with the series so they keep matching, like Apple Calendar does
          for (const p of master.getAllProperties('exdate')) {
            p.setValues(p.getValues().map(t => { if (t.isDate) return t; const c = t.clone(); c.adjust(0, 0, delta, 0); return c; }));
          }
          for (const v of vevents) {
            if (v === master || !v.hasProperty('recurrence-id')) continue;
            const rp = v.getFirstProperty('recurrence-id');
            const c = rp.getFirstValue().clone(); c.adjust(0, 0, delta, 0);
            rp.setValue(c);
          }
        }
      }
    }
    bumpSequence(master);
    return { text: cal.toString() };
  }

  // Just this occurrence of a repeating event
  const occ = ridTime(master, ref.rid);
  const occMs = occ.toJSDate().getTime();
  const uid = master.getFirstPropertyValue('uid');
  for (const v of vevents) {
    if (v !== master && v.hasProperty('recurrence-id') && v.getFirstPropertyValue('recurrence-id').toJSDate().getTime() === occMs) {
      cal.removeSubcomponent(v);
    }
  }
  if (!change) return { text: rebuildExdates(cal, master, icsText, occ) };   // skip this date (EXDATE)
  const ex = new ICAL.Component('vevent');
  ex.addPropertyWithValue('uid', uid);
  ex.addPropertyWithValue('dtstamp', ICAL.Time.now());
  setTime(ex, 'recurrence-id', occ);
  const t = newTimes(change);
  setTime(ex, 'dtstart', t.start);
  setTime(ex, 'dtend', t.end);
  ex.addPropertyWithValue('summary', change.title);
  ex.addPropertyWithValue('sequence', Number(master.getFirstPropertyValue('sequence') || 0) + 1);
  cal.addSubcomponent(ex);
  return { text: cal.toString() };
}

// Keep any EXDATEs the series already had, plus the new one
function rebuildExdates(cal, master, originalText, occ) {
  const orig = new ICAL.Component(ICAL.parse(originalText));
  const om = orig.getAllSubcomponents('vevent').find(v => !v.hasProperty('recurrence-id'));
  master.removeAllProperties('exdate');
  for (const p of (om ? om.getAllProperties('exdate') : [])) master.addProperty(p);
  const np = new ICAL.Property('exdate');
  np.setValue(occ);
  if (!occ.isDate && occ.zone && occ.zone.tzid && !['UTC', 'Z', 'floating'].includes(occ.zone.tzid)) np.setParameter('tzid', occ.zone.tzid);
  master.addProperty(np);
  bumpSequence(master);
  return cal.toString();
}

async function changeEvent(ref, scope, change) {
  const base = await findCalendar();
  const url = new URL(ref.href, base).toString();
  if (!sameUrl(url, base)) throw new Error('That event isn’t in the family calendar');
  const g = await fetch(url, { headers: { Authorization: await authHeader() }, signal: AbortSignal.timeout(20000) });
  if (g.status === 404) { monthCache.clear(); throw new Error('That event was already removed'); }
  if (!g.ok) throw new Error(`Calendar returned ${g.status}`);
  const etag = g.headers.get('etag') || ref.etag;
  if (ref.etag && etag && ref.etag !== etag) {
    monthCache.clear();
    throw new Error('Someone changed this event a moment ago - the board has refreshed, try again');
  }
  const result = applyEventChange(await g.text(), ref, scope, change);
  const headers = { Authorization: await authHeader() };
  if (etag) headers['If-Match'] = etag;
  let r;
  if (result.del) {
    r = await fetch(url, { method: 'DELETE', headers, signal: AbortSignal.timeout(20000) });
  } else {
    headers['Content-Type'] = 'text/calendar; charset=utf-8';
    r = await fetch(url, { method: 'PUT', headers, body: result.text, signal: AbortSignal.timeout(20000) });
  }
  monthCache.clear();
  if (r.status === 412) throw new Error('Someone changed this event a moment ago - the board has refreshed, try again');
  if (!r.ok) throw new Error(`Calendar refused the change (${r.status})`);
}

// ---------------------------------------------------------------------------
// Weather (Open-Meteo, no account) and trash day
// ---------------------------------------------------------------------------
let weatherCache = null;
let weatherAt = 0;

function weatherKind(code) {
  if (code === 0) return 'sun';
  if (code <= 2) return 'partly';
  if (code === 3) return 'cloud';
  if (code === 45 || code === 48) return 'fog';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  return 'cloud';
}

async function weather() {
  if (LAT === null || LON === null) return null;
  if (weatherCache && Date.now() - weatherAt < 10 * 60 * 1000) return weatherCache;   // fresh enough to catch rain starting
  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${LAT}&longitude=${LON}`
    + '&current=temperature_2m,weather_code'
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max'
    + `&temperature_unit=${TEMP_UNIT}&timezone=${encodeURIComponent(TZ)}&forecast_days=2`;
  const j = await (await fetch(url, { signal: AbortSignal.timeout(8000) })).json();
  const d = j.daily;
  weatherCache = {
    now: { temp: Math.round(j.current.temperature_2m), kind: weatherKind(j.current.weather_code) },
    today: { hi: Math.round(d.temperature_2m_max[0]), lo: Math.round(d.temperature_2m_min[0]), rain: d.precipitation_probability_max[0] },
    tomorrow: { hi: Math.round(d.temperature_2m_max[1]), lo: Math.round(d.temperature_2m_min[1]), rain: d.precipitation_probability_max[1], kind: weatherKind(d.weather_code[1]) }
  };
  weatherAt = Date.now();
  return weatherCache;
}

// Trash & recycling: set from the tablet (⚙ Settings); TRASH_DAY in .env is only the starting value.
//   { day: 0-6 | null, recycle: { mode: 'same' | 'day' | 'biweekly' | 'off', day: 0-6, anchor: 'YYYY-MM-DD' } }
// 'biweekly' = every other week on recycle.day, counting from anchor (a known pickup date).
const DOW = ['Sun', 'Mon', 'Tues', 'Wed', 'Thurs', 'Fri', 'Sat'];
function trashCfg() {
  const r = qKvGet.get('trash');
  return r ? JSON.parse(r.data) : { day: TRASH_DAY, recycle: { mode: 'same' } };
}
// Which part of the bottom of the Notes column shows: the reward jars, or "Up next" events
function notesCfg() { const r = qKvGet.get('notes'); return r ? JSON.parse(r.data) : { bottom: 'jars' }; }
function cleanTrash(b) {
  const d = v => (Number.isInteger(+v) && +v >= 0 && +v <= 6 && v !== '' && v !== null ? +v : null);
  const r = (b && b.recycle) || {};
  const mode = ['same', 'day', 'biweekly', 'off'].includes(r.mode) ? r.mode : 'same';
  const out = { day: d(b && b.day), recycle: { mode } };
  if (mode === 'day' || mode === 'biweekly') out.recycle.day = d(r.day) ?? out.day ?? 0;
  if (mode === 'biweekly') out.recycle.anchor = isDate(r.anchor) ? r.anchor : nyParts(new Date()).dateStr;
  return out;
}
const dayNum = ds => Date.UTC(+ds.slice(0, 4), +ds.slice(5, 7) - 1, +ds.slice(8, 10)) / 864e5;
function binsOn(cfg, ds) {   // what goes out on this date
  const dow = new Date(dayNum(ds) * 864e5).getUTCDay(), r = cfg.recycle || { mode: 'same' }, out = [];
  if (cfg.day === dow) out.push('trash');
  if ((r.mode === 'same' && cfg.day === dow) || (r.mode === 'day' && r.day === dow) ||
      (r.mode === 'biweekly' && r.day === dow && (((dayNum(ds) - dayNum(r.anchor)) / 7) % 2 + 2) % 2 === 0)) out.push('recycle');
  return out;
}
function trash() {
  const cfg = trashCfg(), r = cfg.recycle || { mode: 'same' };
  if (cfg.day === null && (r.mode === 'same' || r.mode === 'off')) return null;
  const today = nyParts(new Date()).dateStr;
  const next = kind => { for (let i = 0; i < 21; i++) { const ds = addDays(today, i); if (binsOn(cfg, ds).includes(kind)) return { i, ds }; } return null; };
  const when = (n, dayIdx) => (n.i === 0 ? 'today' : n.i === 1 ? 'tomorrow' : `${DOW[dayIdx]} · in ${n.i} days`);
  const t = cfg.day === null ? null : next('trash'), rc = r.mode === 'off' ? null : next('recycle');
  const dow = n => new Date(dayNum(n.ds) * 864e5).getUTCDay();
  if (t && (r.mode === 'same' || (rc && rc.ds === t.ds))) {   // both go out together next time
    return { title: r.mode === 'off' ? 'Trash' : 'Trash & recycling', days: t.i, label: t.i === 0 ? 'Pickup today' : t.i === 1 ? 'Tomorrow - cans out tonight' : when(t, dow(t)),
      sub: null, cfg };
  }
  if (t && !rc) return { title: 'Trash', days: t.i, label: t.i === 0 ? 'Pickup today' : t.i === 1 ? 'Tomorrow - cans out tonight' : when(t, dow(t)), sub: null, cfg };
  if (!t && rc) return { title: 'Recycling', days: rc.i, label: rc.i === 0 ? 'Pickup today' : rc.i === 1 ? 'Tomorrow - bin out tonight' : when(rc, dow(rc)), sub: null, cfg };
  return { title: 'Trash', days: t.i, label: t.i === 0 ? 'Pickup today' : t.i === 1 ? 'Tomorrow - cans out tonight' : when(t, dow(t)), sub: `♻️ Recycling ${when(rc, dow(rc))}`, cfg };   // different days: trash big, recycling below
}


// ---------------------------------------------------------------------------
// Live updates (Server-Sent Events)
// ---------------------------------------------------------------------------
const clients = new Set();
function broadcast(type, data) {
  const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}

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
const BACKUP_DIR = ENV.BACKUP_DIR || path.join(DATA_DIR, 'backup');
const KEEP_SNAPSHOTS = 14;
function snapshotDb() {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const file = path.join(BACKUP_DIR, `chalkboard-${nyParts(new Date()).dateStr}.db`);
    if (fs.existsSync(file)) return;
    db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    fs.chmodSync(file, 0o600);
    // the key for passwords saved in the console rides along, so a restore just works
    const keyFile = path.join(DATA_DIR, 'secret.key');
    if (fs.existsSync(keyFile)) { fs.copyFileSync(keyFile, path.join(BACKUP_DIR, 'secret.key')); fs.chmodSync(path.join(BACKUP_DIR, 'secret.key'), 0o600); }
    const old = fs.readdirSync(BACKUP_DIR).filter(f => /^chalkboard-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().reverse().slice(KEEP_SNAPSHOTS);
    for (const f of old) fs.unlinkSync(path.join(BACKUP_DIR, f));
    console.log(`Chalkboard: snapshot ${path.basename(file)}`);
  } catch (e) {
    console.error('Chalkboard: snapshot failed:', e.message);
  }
}
snapshotDb();
setInterval(snapshotDb, 10 * 60 * 1000); // makes one per day, shortly after midnight

const isYm = s => /^\d{4}-(0[1-9]|1[0-2])$/.test(s || '');
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

app.get('/api/today', (req, res) => {
  const t = nyParts(new Date());
  res.json({ today: t.dateStr, ym: t.dateStr.slice(0, 7) });
});

app.get('/api/month', async (req, res) => {
  const ym = req.query.ym;
  if (!isYm(ym)) return res.status(400).json({ error: 'bad month' });
  try {
    const g = monthGrid(ym);
    const marks = countdownMarks(), colors = eventColors();
    const events = (await eventsForMonth(ym)).map(e => {
      if (!e.ref) return e;
      const c = colors[cdKey(e.ref)] || colors[`${e.ref.href}|`];   // this occurrence, else the whole series
      return { ...e, ...(marks[cdKey(e.ref)] ? { countdown: true } : {}), ...(c ? { color: c } : {}) };
    });
    res.json({ ym, grid: g, events: (HOLIDAYS === 'none' ? [] : holidaysBetween(g.start, addDays(g.start, g.weeks * 7 - 1))).concat(events), today: nyParts(new Date()).dateStr });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/api/extras', async (req, res) => {
  let w = null;
  try { w = await weather(); } catch (e) { /* board still works without weather */ }
  const cfg = trashCfg();
  res.json({ weather: w, trash: trash(), trashDay: cfg.day, bins: cfg, notes: notesCfg() });
});
app.post('/api/trash', (req, res) => {
  const cfg = cleanTrash(req.body || {});
  qKvSet.run('trash', JSON.stringify(cfg));
  broadcast('extras', {});
  res.json(trash() || { cfg });
});
app.post('/api/notes', (req, res) => {
  const b = (req.body || {}).bottom;
  const cfg = { bottom: ['jars', 'upnext', 'today', 'photos', 'none'].includes(b) ? b : 'jars' };
  qKvSet.run('notes', JSON.stringify(cfg));
  broadcast('extras', {});
  res.json(cfg);
});

// "Up next": the next events from today on (two weeks ahead), for the bottom of the Notes column
app.get('/api/upnext', async (req, res) => {
  try {
    const now = nyParts(new Date()), today = now.dateStr, nowMin = now.h * 60 + now.mi, until = addDays(today, 14);
    const yms = [...new Set([today.slice(0, 7), until.slice(0, 7)])];
    const colors = eventColors(), all = [];
    for (const ym of yms) for (const e of await eventsForMonth(ym)) {
      if (e.end < today || e.start > until) continue;
      if (e.start === today && !e.allDay && e.sort + (e.minutes || 60) < nowMin) continue;   // already over
      const c = e.ref && (colors[cdKey(e.ref)] || colors[`${e.ref.href}|`]);
      all.push({ date: e.start < today ? today : e.start, title: e.title, time: e.allDay ? null : e.time, sort: e.allDay ? -1 : e.sort, color: c || null });
    }
    const seen = new Set();
    const list = all.sort((a, b) => (a.date === b.date ? a.sort - b.sort : a.date < b.date ? -1 : 1))
      .filter(e => { const k = e.date + e.title + e.time; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 12);
    res.json({ today, events: list });
  } catch (e) { res.json({ today: nyParts(new Date()).dateStr, events: [], error: e.message }); }
});

// ---------------------------------------------------------------------------
// US holidays (computed here, shown on the board only - never written to iCloud)
// ---------------------------------------------------------------------------
const pad2 = n => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`;
function nthDow(y, m, dow, n) {   // n-th weekday of a month (n = -1: last)
  if (n > 0) { const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); return ymd(y, m, 1 + ((dow - first + 7) % 7) + (n - 1) * 7); }
  const lastDay = new Date(Date.UTC(y, m, 0)), back = (lastDay.getUTCDay() - dow + 7) % 7;
  return ymd(y, m, lastDay.getUTCDate() - back);
}
function easter(y) {   // anonymous Gregorian algorithm
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(y, mo, da);
}
// big: also counted down to in the Notes column
function holidaysOfYear(y) {
  return [
    [ymd(y, 1, 1), '🎉', "New Year's Day", true],
    [nthDow(y, 1, 1, 3), '🕊️', 'Martin Luther King Jr. Day'],
    [ymd(y, 2, 14), '❤️', "Valentine's Day", true],
    [nthDow(y, 2, 1, 3), '🇺🇸', "Presidents' Day"],
    [nthDow(y, 3, 0, 2), '⏰', 'Clocks spring forward'],
    [ymd(y, 3, 17), '☘️', "St. Patrick's Day", true],
    [easter(y), '🐣', 'Easter', true],
    [ymd(y, 4, 22), '🌎', 'Earth Day'],
    [nthDow(y, 5, 0, 2), '💐', "Mother's Day", true],
    [nthDow(y, 5, 1, -1), '🇺🇸', 'Memorial Day'],
    [nthDow(y, 6, 0, 3), '👔', "Father's Day", true],
    [ymd(y, 6, 19), '✊', 'Juneteenth'],
    [ymd(y, 7, 4), '🎆', 'Independence Day', true],
    [nthDow(y, 9, 1, 1), '🛠️', 'Labor Day'],
    [nthDow(y, 10, 1, 2), '🌎', "Indigenous Peoples' Day"],
    [ymd(y, 10, 31), '🎃', 'Halloween', true],
    [nthDow(y, 11, 0, 1), '⏰', 'Clocks fall back'],
    [ymd(y, 11, 11), '🇺🇸', 'Veterans Day'],
    [nthDow(y, 11, 4, 4), '🦃', 'Thanksgiving', true],
    [ymd(y, 12, 24), '🎄', 'Christmas Eve'],
    [ymd(y, 12, 25), '🎄', 'Christmas', true],
    [ymd(y, 12, 31), '🥳', "New Year's Eve"]
  ].map(([date, icon, title, big]) => ({ date, icon, title, big: !!big }));
}
function holidaysBetween(from, to) {
  const out = [];
  for (let y = +from.slice(0, 4); y <= +to.slice(0, 4); y++) {
    for (const h of holidaysOfYear(y)) {
      if (h.date >= from && h.date <= to) out.push({ title: h.title, icon: h.icon, holiday: true, allDay: true, start: h.date, end: h.date, time: null, sort: -1 });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Calendar settings (tablet ⚙ Settings). Google sign-in uses OAuth with PKCE; by default
// Google sends the browser to http://localhost (nothing there) and the address is pasted
// back here, so it works without HTTPS. With GOOGLE_REDIRECT_URI=https://<board>/oauth/google/callback
// it completes by itself.
// ---------------------------------------------------------------------------
app.get('/api/calendar/status', (req, res) => {
  if (PROVIDER === 'google') {
    const st = gLoad();
    return res.json({ provider: 'google', configured: !!G.id, connected: !!st.refresh, calendar: st.calendarName || null,
      problem: st.refresh ? null : st.problem || null, paste: !/\/oauth\/google\/callback$/.test(G.redirect), redirect: G.redirect });
  }
  res.json({ provider: 'caldav', configured: !!(ICLOUD_USER && ICLOUD_PASS && CAL_NAME), calendar: CAL_NAME || null });
});
const gPending = new Map();   // state -> { verifier, at }
app.post('/api/google/start', (req, res) => {
  if (PROVIDER !== 'google' || !G.id) return res.status(400).json({ error: 'Google isn’t set up on the server yet (admin console → ⚙️ Board → Calendar: Google client ID and secret)' });
  for (const [k, v] of gPending) if (Date.now() - v.at > 15 * 60 * 1000) gPending.delete(k);
  const state = crypto.randomBytes(16).toString('hex'), verifier = crypto.randomBytes(32).toString('base64url');
  gPending.set(state, { verifier, at: Date.now() });
  const u = new URL(G.auth);
  u.search = new URLSearchParams({
    client_id: G.id, redirect_uri: G.redirect, response_type: 'code', scope: 'https://www.googleapis.com/auth/calendar',
    access_type: 'offline', prompt: 'consent', state,
    code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256'
  }).toString();
  res.json({ url: u.toString() });
});
async function gFinish(code, state) {
  const p = gPending.get(state);
  if (!p) throw new Error('That sign-in has expired or was already used - start again');
  gPending.delete(state);
  const { ok, status, j } = await gTokenRequest({ code, redirect_uri: G.redirect, grant_type: 'authorization_code', code_verifier: p.verifier });
  if (!ok) throw new Error(`Google didn’t accept the sign-in (${j.error_description || j.error || status})`);
  if (!j.refresh_token) throw new Error('Google didn’t give the board a lasting sign-in - remove the app at myaccount.google.com/connections and try again');
  const st = gLoad();
  gSave({ refresh: j.refresh_token, calendarId: st.calendarId || null, calendarName: st.calendarName || null, at: Date.now() });
  gAccess = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  calUrl = null; monthCache.clear();
  broadcast('calendar', { ym: 'any' });
}
app.post('/api/google/finish', async (req, res) => {
  const raw = String((req.body || {}).pasted || '').trim();
  let u = null;
  try { u = new URL(raw); } catch { /* not an address */ }
  if (u && u.searchParams.get('error')) return res.status(400).json({ error: `Google said: ${u.searchParams.get('error')}` });
  const code = u && u.searchParams.get('code'), state = u && u.searchParams.get('state');
  if (!code || !state) return res.status(400).json({ error: `Paste the whole address from the browser's address bar (it starts with ${G.redirect})` });
  try { await gFinish(code, state); res.json({ ok: true }); } catch (e) { res.status(400).json({ error: e.message }); }
});
app.get('/oauth/google/callback', async (req, res) => {
  if (req.query.error) return res.status(400).type('text').send(`Google said: ${req.query.error}. Go back to the tablet and try again.`);
  try { await gFinish(String(req.query.code || ''), String(req.query.state || '')); res.redirect('/edit#settings'); }
  catch (e) { res.status(400).type('text').send(`${e.message}. Go back to the tablet and try again.`); }
});
app.post('/api/google/calendars', async (req, res) => {
  try {
    const r = await fetch(`${G.api}/calendar/v3/users/me/calendarList?minAccessRole=writer`, { headers: { Authorization: `Bearer ${await gToken()}` }, signal: AbortSignal.timeout(20000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j.error && j.error.message) || `Google returned ${r.status}`);
    res.json((j.items || []).map(c => ({ id: c.id, name: c.summaryOverride || c.summary || c.id, primary: !!c.primary, color: c.backgroundColor || null })));
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/google/calendar', (req, res) => {
  const { id, name } = req.body || {};
  if (typeof id !== 'string' || !id || id.length > 300) return res.status(400).json({ error: 'bad calendar' });
  const st = gLoad();
  if (!st.refresh) return res.status(400).json({ error: 'Connect Google first' });
  gSave({ ...st, calendarId: id, calendarName: String(name || id).slice(0, 100) });
  calUrl = null; monthCache.clear();
  broadcast('calendar', { ym: 'any' });
  res.json({ ok: true });
});
app.post('/api/google/disconnect', (req, res) => {
  fs.rmSync(G_FILE, { force: true });
  gAccess = null; calUrl = null; monthCache.clear();
  broadcast('calendar', { ym: 'any' });
  res.json({ ok: true });
});

// Countdowns: big holidays + birthdays (automatic) + events you marks
// ---------------------------------------------------------------------------
const cdKey = ref => `${ref.href}|${ref.rid || ''}`;
// Event colors: board-only (iCloud never sees them), keyed like countdown marks.
// A color set with "All of them" (or on a one-off event) is stored for the whole series.
function eventColors() { const r = qKvGet.get('evcolors'); return r ? JSON.parse(r.data) : {}; }
app.post('/api/evcolor', (req, res) => {
  const { ref, color } = req.body || {};
  if (!ref || typeof ref.href !== 'string' || ref.href.length > 500 || (color != null && !/^#[0-9a-fA-F]{6}$/.test(color))) return res.status(400).json({ error: 'bad color' });
  const all = eventColors(), key = cdKey(ref);
  if (color) all[key] = color.toUpperCase(); else delete all[key];
  if (!ref.rid && !color) for (const k of Object.keys(all)) if (k.startsWith(`${ref.href}|`)) delete all[k];   // clearing a series clears its one-offs too
  qKvSet.run('evcolors', JSON.stringify(all));
  broadcast('calendar', { ym: 'any' });   // every open month redraws
  res.json({ ok: true });
});
function countdownMarks() { const r = qKvGet.get('countdowns'); return r ? JSON.parse(r.data) : {}; }
app.post('/api/countdowns', (req, res) => {
  const { ref, title, date, on } = req.body || {};
  if (!ref || typeof ref.href !== 'string' || ref.href.length > 500 || !isDate(date)) return res.status(400).json({ error: 'bad countdown' });
  const marks = countdownMarks(), key = cdKey(ref);
  if (on) marks[key] = { title: String(title || '').slice(0, 80), date };
  else delete marks[key];
  // forget marks that are long past
  const today = nyParts(new Date()).dateStr;
  for (const k of Object.keys(marks)) if (marks[k].date < addDays(today, -2)) delete marks[k];
  qKvSet.run('countdowns', JSON.stringify(marks));
  broadcast('countdowns', {});
  res.json({ ok: true });
});
app.get('/api/countdowns', async (req, res) => {
  const today = nyParts(new Date()).dateStr, horizon = addDays(today, 60);
  const items = [];
  for (const h of holidaysBetween(today, horizon)) {
    const big = holidaysOfYear(+h.start.slice(0, 4)).find(x => x.date === h.start && x.title === h.title);
    if (big && big.big) items.push({ icon: h.icon, title: h.title, date: h.start });
  }
  for (const m of Object.values(countdownMarks())) if (m.date >= today && m.date <= horizon) items.push({ icon: '⭐', title: m.title, date: m.date });
  // birthdays this month and next, straight from the calendar
  try {
    const ym = today.slice(0, 7), next = addDays(`${ym}-28`, 7).slice(0, 7);
    for (const e of [...await eventsForMonth(ym), ...await eventsForMonth(next)]) {
      if (/birthday|bday|🎂/i.test(e.title) && e.start >= today && e.start <= horizon) items.push({ icon: '🎂', title: e.title.replace(/🎂/g, '').trim(), date: e.start });
    }
  } catch (e) { /* calendar down: holidays still count down */ }
  const seen = new Set();
  const list = items.filter(i => { const k = i.date + i.title; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map(i => ({ ...i, days: Math.round((Date.parse(i.date) - Date.parse(today)) / 864e5) }));
  res.json(list.slice(0, 3));
});

app.post('/api/events', async (req, res) => {
  const { title, date, allDay, time, minutes, through } = req.body || {};
  if (!title || !String(title).trim() || !isDate(date)) return res.status(400).json({ error: 'Title and date are required' });
  if (!allDay && !/^\d{2}:\d{2}$/.test(time || '')) return res.status(400).json({ error: 'Pick a time, or choose All day' });
  if (through && !isDate(through)) return res.status(400).json({ error: 'bad end date' });
  try {
    const href = await addEvent({ title: String(title).trim().slice(0, 200), date, allDay: !!allDay, time, minutes: +minutes || 60, through });
    broadcast('calendar', { ym: date.slice(0, 7) });
    res.json({ ok: true, href });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

function validRef(ref) {
  return ref && typeof ref.href === 'string' && ref.href.length < 500 &&
    (ref.etag == null || typeof ref.etag === 'string') && (ref.rid == null || /^[0-9TZ]{8,16}$/.test(ref.rid));
}

app.post('/api/events/update', async (req, res) => {
  const { ref, scope, title, date, allDay, time, minutes, through, origDate } = req.body || {};
  if (!validRef(ref)) return res.status(400).json({ error: 'bad event' });
  if (!title || !String(title).trim() || !isDate(date)) return res.status(400).json({ error: 'Title and date are required' });
  if (!allDay && !/^\d{2}:\d{2}$/.test(time || '')) return res.status(400).json({ error: 'Pick a time, or choose All day' });
  if (through && !isDate(through)) return res.status(400).json({ error: 'bad end date' });
  try {
    await changeEvent(ref, scope === 'one' ? 'one' : 'all',
      { title: String(title).trim().slice(0, 200), date, allDay: !!allDay, time, minutes: +minutes || 60, through });
    broadcast('calendar', { ym: date.slice(0, 7) });
    if (isDate(origDate) && origDate.slice(0, 7) !== date.slice(0, 7)) broadcast('calendar', { ym: origDate.slice(0, 7) });
    res.json({ ok: true });
  } catch (err) {
    res.status(err.message.includes('moment ago') ? 409 : 502).json({ error: err.message });
  }
});

app.post('/api/events/delete', async (req, res) => {
  const { ref, scope, origDate } = req.body || {};
  if (!validRef(ref)) return res.status(400).json({ error: 'bad event' });
  try {
    await changeEvent(ref, scope === 'one' ? 'one' : 'all', null);
    if (isDate(origDate)) broadcast('calendar', { ym: origDate.slice(0, 7) });
    res.json({ ok: true });
  } catch (err) {
    res.status(err.message.includes('moment ago') ? 409 : 502).json({ error: err.message });
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

app.post('/api/art', (req, res) => {
  const { ym, stroke, from } = req.body || {};
  const clean = cleanItem(stroke);
  if (!isYm(ym) || !clean) return res.status(400).json({ error: 'bad stroke' });
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
  broadcast('clear', { ym });
  res.json({ ok: true });
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
const THEME_SURFACES = ['slate', 'green', 'blue', 'cork', 'kraft', 'white'];
function cleanTheme(t) {
  const out = { p: typeof t?.p === 'string' && /^[a-z]{2,20}$/.test(t.p) ? t.p : 'classic', o: {} };
  if (THEME_SURFACES.includes(t?.s) && t.s !== 'slate') out.s = t.s;   // board background
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
    z: [56, 68, 80].includes(+t.z) ? +t.z : 68
  };
}
function metaFor(ym) {
  const row = qMetaGet.get(ym);
  const m = row ? JSON.parse(row.data) : {};
  const d = qKvGet.get('titleDefault');
  if (d) m.defaultTitle = JSON.parse(d.data);
  return m;
}

// Reward jars: one per kid, filled from the iPad (the wall is read-only)
const PIECES = ['heart', 'rainbow', 'star', 'bolt', 'critter'];
const DEFAULT_JARS = [];   // jars are optional; add them from the tablet
function getJars() { const r = qKvGet.get('jars'); return r ? JSON.parse(r.data) : DEFAULT_JARS; }
app.get('/api/jars', (req, res) => res.json(getJars()));
app.post('/api/jars', (req, res) => {
  const list = (req.body || {}).jars;
  if (!Array.isArray(list)) return res.status(400).json({ error: 'bad jars' });
  const jars = list.slice(0, 4).map((j, i) => ({
    id: /^[a-z0-9]{1,16}$/.test(j && j.id) ? j.id : `jar${i}`,
    name: String((j && j.name) || 'Jar').trim().slice(0, 14) || 'Jar',
    pieces: (Array.isArray(j.pieces) ? j.pieces.filter(p => PIECES.includes(p)) : []).slice(0, 5).concat([]),
    count: Math.min(Math.max(Math.round(+j.count) || 0, 0), 200),
    goal: Math.min(Math.max(Math.round(+j.goal) || 20, 3), 100)
  })).map(j => (j.pieces.length ? j : { ...j, pieces: ['star'] }));
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
  return mode === 'art' ? { mode } : { mode, pick: v.pick === 'chosen' && ids.length ? 'chosen' : 'random', ids };
}
app.post('/api/meta', (req, res) => {
  const { ym, hideTitle, title, makeDefault, side } = req.body || {};
  if (!isYm(ym)) return res.status(400).json({ error: 'bad month' });
  const row = qMetaGet.get(ym);
  const cur = row ? JSON.parse(row.data) : {};
  const meta = { hideTitle: hideTitle === undefined ? !!cur.hideTitle : !!hideTitle };
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
app.get('/api/clip/list', (req, res) => {
  try { res.set('Cache-Control', 'public, max-age=86400').json(fluentSet().names); } catch (e) { res.status(500).json({ error: 'Clipart isn’t installed (run npm ci)' }); }
});
app.get('/api/clip/:name.svg', (req, res) => {
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

app.get('/api/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  res.write(`event: hello\ndata: ${JSON.stringify({ v: boardVersion() })}\n\n`);   // pages compare this with their own
  clients.add(res);
  const ck = req.get('cookie') || '';
  const ping = setInterval(() => {   // visible to pages, so they can tell they're still connected
    if (!access.stillAllowed(ck)) { clients.delete(res); res.end(); return; }   // removed screen / ended sign-in: no more updates
    res.write('event: ping\ndata: {}\n\n');
  }, 25000);
  req.on('close', () => { clearInterval(ping); clients.delete(res); });
});

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
  edit: { name: BOARD_TITLE + ' (edit)', short_name: 'Planner edit', start_url: '/edit', scope: '/', display: 'standalone', orientation: 'any' }
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
// ---- Admin console → ⚙️ Board: settings that used to need .env (server/settings.js) ----
// Saving restarts the board (a few seconds) so everything picks the new values up; screens reconnect.
function restartSoon(why) {
  setTimeout(() => { console.log(`Chalk Planner: restarting to apply ${why}`); process.exit(3); }, 400);   // the service manager starts it again
}
app.get('/api/board-settings', (req, res) => {
  res.set('Cache-Control', 'no-store').json({ ...boardSettings.view(), version: APP_VERSION, timezones: typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [] });
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
    res.json({ calendars: cals.map(c => c.name) });
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
let fontsCss = null;
app.get('/fonts.css', (req, res) => {
  if (fontsCss === null) {
    fontsCss = FONTS.map(([pkg, ws]) => ws.map(w => {
      try { return fs.readFileSync(require.resolve(`@fontsource/${pkg}/${w}.css`), 'utf8').replace(/url\(\.\/files\//g, `url(/fonts/${pkg}/files/`); }
      catch { return ''; }
    }).join('\n')).join('\n');
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
// the admin console (sign-in, screens, people, my account) and invite links
for (const p of ['/admin', '/join']) app.get(p, (req, res) => res.set('Cache-Control', 'no-cache').sendFile(path.join(PUBLIC, 'admin.html')));
app.use(express.static(PUBLIC));

app.listen(PORT, BIND, () => console.log(`Family Chalk Planner on ${BIND}:${PORT} (data in ${DATA_DIR})`));
