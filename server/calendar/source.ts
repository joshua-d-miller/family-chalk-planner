/*
===============================================================================
 Family Chalk Planner | Server | Calendar | source.ts
===============================================================================
 Version:   0.15.1
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-06
 Updated:   2026-11-10

 Purpose:
     The family's calendar: any CalDAV server (iCloud, Nextcloud,
     Fastmail...) with a password, or Google Calendar (Google's CalDAV
     with a Google sign-in). Plus more calendars on the same account, each
     with its own color, and read-only calendar links (iCal: school,
     sports teams).

 Used by:
     server/calendar/routes.ts
     server/config.ts
     server/main.ts
     server/settings-routes.ts
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    The calendar in its own TypeScript modules
                        claude    (server/calendar/).
                        colby
                                  Google: several calendars at once, read-only
                                  ones, and which calendar a new event goes
                                  in.

 0.15.1    2026-11-10   joshua    When the calendar can't be reached, the month
                        claude    still shows (holidays and the events it had),
                                  with the problem.
===============================================================================
*/

import crypto from 'node:crypto';
import { addDays, icsEscape, icsUtc, xmlUnescape } from '../dates.ts';
import type { Clock } from '../dates.ts';
import { mainOf } from './google.ts';
import type { Google } from './google.ts';
import { applyEventChange, makeIcal } from './ical.ts';
import type { BoardEvent, EventChange, EventRef } from './ical.ts';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------- //
// | Types | //
// --------- //
export interface CalendarConfig {
  provider: 'caldav' | 'google';
  caldavUrl: string;
  user?: string;
  password?: string;
  calendarName?: string; // the main calendar, by its name
  extraCalendars: { id: string; name: string; color: string }[];
  feeds: { name: string; url: string; color: string }[];
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------------------- //
// | Reading CalDAV replies | //
// -------------------------- //
// The PROPFIND / REPORT replies are XML; these read the few parts the board //
// needs                                                                     //
const tag = (block: string, name: string) => (block.match(new RegExp(`<(?:\\w+:)?${name}[^>]*>([^<]*)<`)) || [])[1];
const responses = (xml: string) => xml.split(/<(?:\w+:)?response[\s>]/).slice(1);

const sameUrl = (u: string, base: string) => {
  try {
    return decodeURIComponent(u).startsWith(decodeURIComponent(base));
  } catch {
    return false;
  }
};

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------------------------- //
// | Every calendar on an account | //
// -------------------------------- //
// Every calendar on a CalDAV account: [{ name, url }] (also the console's   //
// "Find my calendars")                                                      //
export async function caldavCalendars(base: string, auth: string) {
  const req = async (url: string, body: string, depth = '0') => {
    const r = await fetch(url, {
      method: 'PROPFIND',
      headers: { Authorization: auth, 'Content-Type': 'application/xml; charset=utf-8', Depth: depth },
      body,
      signal: AbortSignal.timeout(20000)
    });
    if (r.status === 401 || r.status === 403)
      throw new Error('The calendar server didn’t accept that username and password');
    if (!(r.ok || r.status === 207)) throw new Error(`The calendar server answered ${r.status}`);
    return r.text();
  };
  const p = await req(base, '<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>');
  const principal = (p.match(/current-user-principal[^>]*>\s*<(?:\w+:)?href[^>]*>([^<]+)</) ||
    p.match(/>(\/[0-9]+\/principal\/)</) ||
    [])[1];
  if (!principal) throw new Error('Calendar login failed (no principal)');
  const principalUrl = new URL(xmlUnescape(principal.trim()), base).toString();
  const h = await req(
    principalUrl,
    '<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>'
  );
  const homeHref = (h.match(/calendar-home-set[^>]*>\s*<(?:\w+:)?href[^>]*>([^<]+)</) || [])[1];
  if (!homeHref) throw new Error('Calendar home not found');
  const home = new URL(xmlUnescape(homeHref.trim()), principalUrl).toString();
  const list = await req(
    home,
    '<d:propfind xmlns:d="DAV:"><d:prop><d:displayname/><d:resourcetype/></d:prop></d:propfind>',
    '1'
  );
  const out: { name: string; url: string }[] = [];
  for (const block of responses(list)) {
    const href = tag(block, 'href');
    const name = tag(block, 'displayname');
    if (!href || !name || !xmlUnescape(name).trim()) continue;
    // not a calendar (inbox, outbox...)
    if (/resourcetype/.test(block) && !/<(?:\w+:)?calendar[\s/>]/.test(block.split(/resourcetype/)[1] || '')) continue;
    let url = new URL(href, home).toString();
    if (!url.endsWith('/')) url += '/';
    out.push({ name: xmlUnescape(name).trim(), url });
  }
  return out;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------------- //
// | The calendar the board uses | //
// ------------------------------- //
export function createCalendarSource(cfg: CalendarConfig, clock: Clock, google: Google) {
  const ical = makeIcal(clock);
  const basicAuth = 'Basic ' + Buffer.from(`${cfg.user}:${cfg.password}`).toString('base64');
  const authHeader = async () => (cfg.provider === 'google' ? `Bearer ${await google.token()}` : basicAuth);

  let mainUrl: string | null = null; // found once, then remembered
  const monthCache = new Map<string, { at: number; events: BoardEvent[] }>();
  const problems = new Map<string, string>(); // calendar name -> what went wrong (shown in ⚙️)
  const feedCache = new Map<string, { at: number; text?: string; error?: string }>();

  // ---------------------------------- //
  // | Talking to the calendar server | //
  // ---------------------------------- //
  async function dav(url: string, method: string, body: string, depth = '0') {
    const r = await fetch(url, {
      method,
      headers: { Authorization: await authHeader(), 'Content-Type': 'application/xml; charset=utf-8', Depth: depth },
      body,
      signal: AbortSignal.timeout(20000)
    });
    if (!(r.ok || r.status === 207)) throw new Error(`Calendar ${method} returned ${r.status}`);
    return r.text();
  }

  // -------------------------------- //
  // | Google: the calendars picked | //
  // -------------------------------- //
  // Google: the calendars picked in Settings (several, some read-only); the //
  // main one is where new events go                                         //
  const googleCalendars = () => google.selected(cfg.extraCalendars);
  const googleMain = () => mainOf(googleCalendars(), google.load().calendarId);

  // --------------------- //
  // | The main calendar | //
  // --------------------- //
  async function findCalendar(): Promise<string> {
    if (mainUrl) return mainUrl;
    if (cfg.provider === 'google') {
      const st = google.load();
      const main = googleMain();
      if (!main)
        throw new Error(
          st.refresh
            ? 'Pick which Google calendar to show in ⚙ Settings on the tablet'
            : st.problem || 'Google isn’t connected yet - connect it in ⚙ Settings on the tablet'
        );
      return (mainUrl = google.calendarUrl(main.id));
    }
    const found = (await caldavCalendars(cfg.caldavUrl, basicAuth)).find(c => c.name === cfg.calendarName);
    if (!found) throw new Error(`Calendar "${cfg.calendarName}" not found on the server`);
    return (mainUrl = found.url);
  }

  // --------------------- //
  // | Events in a range | //
  // --------------------- //
  async function caldavRange(url: string, rangeStart: Date, rangeEnd: Date) {
    const xml = await dav(
      url,
      'REPORT',
      `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><d:getetag/><c:calendar-data/></d:prop>
  <c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT">
    <c:time-range start="${icsUtc(rangeStart)}" end="${icsUtc(rangeEnd)}"/>
  </c:comp-filter></c:comp-filter></c:filter>
</c:calendar-query>`,
      '1'
    );
    const out: BoardEvent[] = [];
    for (const block of responses(xml)) {
      const href = tag(block, 'href');
      const etag = tag(block, 'getetag');
      const data = (block.match(/<(?:\w+:)?calendar-data[^>]*>([\s\S]*?)<\/(?:\w+:)?calendar-data>/) || [])[1];
      if (!href || !data) continue;
      const ref: EventRef = { href: xmlUnescape(href.trim()), etag: etag ? xmlUnescape(etag.trim()) : null };
      try {
        ical.eventsFromIcs(xmlUnescape(data), ref, rangeStart, rangeEnd, out);
      } catch (e) {
        console.error('Chalkboard: skipped an unreadable event:', (e as Error).message);
      }
    }
    return out;
  }

  // -------------------------------------- //
  // | More calendars on the same account | //
  // -------------------------------------- //
  // More calendars on the same account (shown with their own color,         //
  // editable like the main one)                                             //
  const extraUrl = (c: { id: string }) => (cfg.provider === 'google' ? google.calendarUrl(c.id) : c.id);
  // the account's password only ever goes to the server the main calendar lives on
  async function sameAccount(url: string) {
    if (new URL(url).origin !== new URL(await findCalendar()).origin)
      throw new Error('isn’t on the same calendar account');
    return url;
  }
  async function editableCalendars() {
    if (cfg.provider === 'google')
      return googleCalendars()
        .filter(c => !c.readOnly)
        .map(extraUrl);
    return [await findCalendar(), ...cfg.extraCalendars.map(extraUrl)];
  }
  // --------------------------------------- //
  // | The calendars a new event can go in | //
  // --------------------------------------- //
  // The calendars a new event can go in, the main one first (the edit card  //
  // offers them when there are several)                                     //
  function writable(): { id: string; name: string; color: string | null; main: boolean }[] {
    if (cfg.provider === 'google') {
      const main = googleMain();
      if (!google.load().refresh || !main) return [];
      return googleCalendars()
        .filter(c => !c.readOnly)
        .map(c => ({ id: c.id, name: c.name, color: c.id === main.id ? null : c.color, main: c.id === main.id }))
        .sort((a, b) => Number(b.main) - Number(a.main));
    }
    if (!cfg.user || !cfg.password || !cfg.calendarName) return [];
    return [
      { id: cfg.calendarName, name: cfg.calendarName, color: null, main: true },
      ...cfg.extraCalendars.map(c => ({ id: c.id, name: c.name, color: c.color, main: false }))
    ];
  }
  // ------------------------- //
  // | Calendar links (iCal) | //
  // ------------------------- //
  // School and sports calendars: read-only, fetched at most every 15        //
  // minutes; the last good copy is kept if a fetch fails.                   //
  const readOnlyCopy = (e: BoardEvent): BoardEvent => ({ ...e, ref: undefined, readOnly: true });

  // Read-only iCal links: fetched at most every 15 minutes; the last good copy is kept if a fetch fails
  async function feedText(f: { url: string }): Promise<string> {
    const c = feedCache.get(f.url);
    if (c && Date.now() - c.at < 15 * 60e3) {
      if (c.text) return c.text;
      throw new Error(c.error);
    }
    try {
      const r = await fetch(f.url, {
        headers: { 'User-Agent': 'FamilyChalkPlanner/1 (+calendar link)', Accept: 'text/calendar, */*' },
        signal: AbortSignal.timeout(20000)
      });
      if (!r.ok) throw new Error(`answered ${r.status}`);
      const text = await r.text();
      if (text.length > 8e6 || !/BEGIN:VCALENDAR/.test(text)) throw new Error('isn’t a calendar (iCal) link');
      feedCache.set(f.url, { at: Date.now(), text });
      return text;
    } catch (e) {
      const msg = (e as Error).name === 'TimeoutError' ? 'didn’t answer' : (e as Error).message;
      if (c && c.text) {
        feedCache.set(f.url, { ...c, at: Date.now() });
        return c.text;
      }
      feedCache.set(f.url, { at: Date.now(), error: msg });
      throw new Error(msg, { cause: e });
    }
  }

  // ---------------------------------- //
  // | Every event in a month's weeks | //
  // ---------------------------------- //
  // Every event shown in a month's weeks, from every calendar and link      //
  // (cached for a minute)                                                   //
  let down: string | null = null; // the main calendar couldn't be reached last time: why
  async function eventsForMonth(ym: string): Promise<BoardEvent[]> {
    const cached = monthCache.get(ym);
    if (cached && Date.now() - cached.at < 60 * 1000) return cached.events;
    try {
      const ev = await fetchMonth(ym);
      down = null;
      return ev;
    } catch (e) {
      // the calendar can't be reached: the events it had last time (if any), and the problem is noted
      down = (e as Error).message;
      if (!cached) throw e;
      console.error(`Chalkboard: calendar: ${down} (showing what it had)`);
      return cached.events;
    }
  }
  async function fetchMonth(ym: string): Promise<BoardEvent[]> {
    const g = clock.monthGrid(ym);
    const [sy, sm, sd] = g.start.split('-').map(Number);
    const [ey, em, ed] = g.end.split('-').map(Number);
    const rangeStart = clock.fromZoned(sy, sm, sd, 0, 0);
    const rangeEnd = clock.fromZoned(ey, em, ed, 0, 0);
    const main = await findCalendar();
    const gMain = cfg.provider === 'google' ? googleMain() : null;
    // the main calendar: its problems show on the board
    let out = await caldavRange(main, rangeStart, rangeEnd);
    if (gMain?.readOnly) out = out.map(readOnlyCopy);
    const others: { id: string; name: string; color: string; readOnly?: boolean }[] =
      cfg.provider === 'google' ? googleCalendars().filter(c => c.id !== gMain?.id) : cfg.extraCalendars;
    const more = await Promise.all([
      ...others
        .filter(c => !sameUrl(extraUrl(c), main))
        .map(async c => {
          try {
            const ev = await caldavRange(await sameAccount(extraUrl(c)), rangeStart, rangeEnd);
            problems.delete(c.name);
            return ev.map(e => ({ ...(c.readOnly ? readOnlyCopy(e) : e), cal: c.name, calColor: c.color }));
          } catch (e) {
            problems.set(c.name, (e as Error).message);
            console.error(`Chalkboard: calendar "${c.name}": ${(e as Error).message}`);
            return [];
          }
        }),
      ...cfg.feeds.map(async f => {
        try {
          const ev = ical.eventsFromIcs(await feedText(f), null, rangeStart, rangeEnd, []);
          problems.delete(f.name);
          return ev.map(e => ({ ...e, cal: f.name, calColor: f.color, readOnly: true }));
        } catch (e) {
          problems.set(f.name, (e as Error).message);
          console.error(`Chalkboard: calendar link "${f.name}": ${(e as Error).message}`);
          return [];
        }
      })
    ]);
    for (const list of more) out.push(...list);
    out.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.sort - b.sort));
    monthCache.set(ym, { at: Date.now(), events: out });
    return out;
  }

  // --------------- //
  // | A new event | //
  // --------------- //
  // A new event, in the main calendar or the one picked on the edit card;   //
  // returns where it lives                                                  //
  async function addEvent(
    { title, date, allDay, time, minutes, through }: EventChange,
    calendarId?: string
  ): Promise<string> {
    let url = await findCalendar();
    if (cfg.provider === 'google') {
      const target = (calendarId && googleCalendars().find(c => c.id === calendarId)) || googleMain();
      if (!target || target.readOnly)
        throw new Error('That calendar is read-only - pick a calendar you can change in ⚙ Settings');
      url = extraUrl(target);
    } else if (calendarId && calendarId !== cfg.calendarName) {
      const extra = cfg.extraCalendars.find(c => c.id === calendarId);
      if (!extra) throw new Error('That calendar isn’t on the board');
      url = await sameAccount(extraUrl(extra));
    }
    const uid = crypto.randomUUID();
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Family Chalk Planner//EN',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${icsUtc(new Date())}`,
      `SUMMARY:${icsEscape(title)}`
    ];
    if (allDay) {
      const last = through && through >= date ? through : date;
      lines.push(
        `DTSTART;VALUE=DATE:${date.replace(/-/g, '')}`,
        `DTEND;VALUE=DATE:${addDays(last, 1).replace(/-/g, '')}`
      );
    } else {
      const [y, m, d] = date.split('-').map(Number);
      const [h, mi] = String(time).split(':').map(Number);
      const start = clock.fromZoned(y, m, d, h, mi);
      const end = new Date(start.getTime() + (minutes || 60) * 60000);
      lines.push(`DTSTART:${icsUtc(start)}`, `DTEND:${icsUtc(end)}`);
    }
    lines.push('END:VEVENT', 'END:VCALENDAR');
    const r = await fetch(`${url}${uid}.ics`, {
      method: 'PUT',
      headers: {
        Authorization: await authHeader(),
        'Content-Type': 'text/calendar; charset=utf-8',
        'If-None-Match': '*'
      },
      body: lines.join('\r\n') + '\r\n',
      signal: AbortSignal.timeout(20000)
    });
    if (!r.ok) throw new Error(`The calendar refused the event (${r.status})`);
    monthCache.clear();
    return new URL(`${url}${uid}.ics`).pathname;
  }

  // ------------------------ //
  // | Changing or deleting | //
  // ------------------------ //
  // Change (or, with change = null, delete) an event: the whole event or    //
  // series, or one occurrence. If someone changed it meanwhile (its         //
  // version, the etag, moved on), nothing is overwritten.                   //
  async function changeEvent(ref: EventRef, scope: 'all' | 'one', change: EventChange | null) {
    const url = new URL(ref.href, await findCalendar()).toString();
    if (!(await editableCalendars()).some(c => sameUrl(url, c)))
      throw new Error('That event isn’t in the family calendar');
    const g = await fetch(url, { headers: { Authorization: await authHeader() }, signal: AbortSignal.timeout(20000) });
    if (g.status === 404) {
      monthCache.clear();
      throw new Error('That event was already removed');
    }
    if (!g.ok) throw new Error(`Calendar returned ${g.status}`);
    const etag = g.headers.get('etag') || ref.etag;
    if (ref.etag && etag && ref.etag !== etag) {
      monthCache.clear();
      throw new Error('Someone changed this event a moment ago - the board has refreshed, try again');
    }
    const result = applyEventChange(ical.newTimes, await g.text(), ref, scope, change);
    const headers: Record<string, string> = { Authorization: await authHeader() };
    if (etag) headers['If-Match'] = etag;
    let r: Response;
    if ('del' in result) {
      r = await fetch(url, { method: 'DELETE', headers, signal: AbortSignal.timeout(20000) });
    } else {
      headers['Content-Type'] = 'text/calendar; charset=utf-8';
      r = await fetch(url, { method: 'PUT', headers, body: result.text, signal: AbortSignal.timeout(20000) });
    }
    monthCache.clear();
    if (r.status === 412)
      throw new Error('Someone changed this event a moment ago - the board has refreshed, try again');
    if (!r.ok) throw new Error(`Calendar refused the change (${r.status})`);
  }

  return {
    eventsForMonth,
    writable,
    googleCalendars,
    googleMain,
    addEvent,
    changeEvent,
    problems,
    down: () => down,
    // the calendar or the sign-in changed: find it again, and fetch every month afresh
    reset() {
      mainUrl = null;
      monthCache.clear();
    }
  };
}
export type CalendarSource = ReturnType<typeof createCalendarSource>;

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
