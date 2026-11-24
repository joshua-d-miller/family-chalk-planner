/*
===============================================================================
 Family Chalk Planner | Server | Calendar | source.ts
===============================================================================
 Version:   1.2.8
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-06
 Updated:   2026-11-24

 Purpose:
     The family's calendar: any CalDAV server (iCloud, Nextcloud,
     Fastmail...) with a password, or Google Calendar (Google's CalDAV
     with a Google sign-in). Plus more calendars on the same account, each
     with its own color, and read-only calendar links (iCal: school,
     sports teams). Each keeps a saved copy of every month it fetched
     (server/calendar/cache.ts), shown when it can't be reached.

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

                                  Each calendar (the family's, others on the
                                  account, calendar links; CalDAV or Google)
                                  keeps a saved copy of each month in the
                                  database, shown when it can't be reached.

 1.0.0     2026-11-14   joshua    Home Assistant's calendars, as the Home
                        claude    Assistant app: read, add, change and delete
                                  where each calendar allows it.

 1.2.8    2026-11-24   joshua    Every CalDAV address passes the one address
                        claude    check (server/address.ts) before it's
                                  fetched.

                                  Every calendar request goes through
                                  safeFetch() (the name and every redirect
                                  checked).

                                  A calendar problem goes into the log
                                  without line breaks (oneLine()).
===============================================================================
*/

import type { CalendarCache } from './cache.ts';
import crypto from 'node:crypto';
import { addDays, icsEscape, icsUtc, xmlUnescape } from '../dates.ts';
import type { Clock } from '../dates.ts';
import { mainOf } from './google.ts';
import type { Google } from './google.ts';
import { applyEventChange, makeIcal } from './ical.ts';
import type { BoardEvent, EventChange, EventRef } from './ical.ts';
import type { HaCalendar, HaEvent, HaEventIn, HomeAssistant } from '../homeassistant.ts';
import { checkedAddress, safeFetch } from '../address.ts';
import { oneLine } from '../access/http.ts';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------- //
// | Types | //
// --------- //
export interface CalendarConfig {
  provider: 'caldav' | 'google' | 'homeassistant';
  caldavUrl: string;
  user?: string;
  password?: string;
  calendarName?: string; // the main calendar, by its name
  extraCalendars: { id: string; name: string; color: string }[];
  haCalendars: { id: string; name: string; color: string; main?: boolean }[]; // the Home Assistant app
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
  // each address (the one typed, and the ones the server answers with) passes the one address check
  // first (server/address.ts); iCloud's own per-account servers (p52-caldav.icloud.com…) pass
  const req = async (address: string, body: string, depth = '0') => {
    const url = checkedAddress(address);
    if (!url) throw new Error('That isn’t a calendar server address');
    const r = await safeFetch(url, {
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
export function createCalendarSource(
  cfg: CalendarConfig,
  clock: Clock,
  google: Google,
  saved?: CalendarCache,
  ha: HomeAssistant | null = null
) {
  const ical = makeIcal(clock);
  const basicAuth = 'Basic ' + Buffer.from(`${cfg.user}:${cfg.password}`).toString('base64');
  const authHeader = async () => (cfg.provider === 'google' ? `Bearer ${await google.token()}` : basicAuth);

  // the saved copies are of this calendar: a different server, account or calendar starts afresh
  saved?.belongsTo(
    crypto
      .createHash('sha256')
      .update(
        JSON.stringify(
          cfg.provider === 'homeassistant'
            ? [cfg.provider, cfg.haCalendars.map(c => c.id)]
            : [cfg.provider, cfg.caldavUrl, cfg.user || '', cfg.calendarName || '']
        )
      )
      .digest('hex')
  );
  let mainUrl: string | null = null; // found once, then remembered
  const monthCache = new Map<string, { at: number; events: BoardEvent[] }>();
  const problems = new Map<string, string>(); // calendar name -> what went wrong (shown in ⚙️)
  const feedCache = new Map<string, { at: number; text?: string; error?: string }>();

  // ---------------------------------- //
  // | Talking to the calendar server | //
  // ---------------------------------- //
  async function dav(url: string, method: string, body: string, depth = '0') {
    const r = await safeFetch(url, {
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
    if (cfg.provider === 'homeassistant') {
      const main = haMain();
      const can = (id: string) => !haCaps || !!haCaps.list.find(c => c.id === id)?.canCreate;
      return cfg.haCalendars
        .filter(c => can(c.id))
        .map(c => ({ id: c.id, name: c.name, color: c.id === main?.id ? null : c.color, main: c.id === main?.id }))
        .sort((a, b) => Number(b.main) - Number(a.main));
    }
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
      const r = await safeFetch(f.url, {
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
  let down: string | null = null; // why a calendar couldn't be reached last time (null: all fine)
  // ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
  // ---------------------------------------- //
  // | Home Assistant's calendars (the app) | //
  // ---------------------------------------- //
  // The calendars picked in ⚙️ Board, the main one first; what each can do  //
  // (add, change, delete) as Home Assistant says, asked every few minutes.  //
  const haMain = () => cfg.haCalendars.find(c => c.main) || cfg.haCalendars[0] || null;
  let haCaps: { at: number; list: HaCalendar[] } | null = null;
  async function haCan(id: string): Promise<HaCalendar | null> {
    if (!ha) return null;
    if (!haCaps || Date.now() - haCaps.at > 5 * 60e3) haCaps = { at: Date.now(), list: await ha.calendars() };
    return haCaps.list.find(c => c.id === id) || null;
  }
  // one Home Assistant event, as the board shows it
  function fromHa(e: HaEvent, cal: HaCalendar | null): BoardEvent {
    const title = e.summary || '(no title)';
    let be: BoardEvent;
    if (e.start.date) {
      const s = e.start.date;
      let last = e.end?.date ? addDays(e.end.date, -1) : s; // the end date is the day after
      if (last < s) last = s;
      be = { title, allDay: true, start: s, end: last, time: null, hm: null, minutes: null, sort: 0 };
    } else {
      const st = new Date(String(e.start.dateTime));
      const en = e.end?.dateTime ? new Date(e.end.dateTime) : new Date(st.getTime() + 3600e3);
      const sp = clock.zoned(st);
      const ep = clock.zoned(new Date(en.getTime() - 1));
      be = {
        title,
        allDay: false,
        start: sp.dateStr,
        end: ep.dateStr > sp.dateStr ? ep.dateStr : sp.dateStr,
        time: clock.fmtTime(sp.h, sp.mi),
        hm: `${String(sp.h).padStart(2, '0')}:${String(sp.mi).padStart(2, '0')}`,
        minutes: Math.max(5, Math.round((en.getTime() - st.getTime()) / 60000)),
        sort: sp.h * 60 + sp.mi
      };
    }
    be.recurring = !!(e.rrule || e.recurrence_id);
    // it can be changed from the board if its calendar can change events, or (one that doesn't repeat)
    // delete and add them, which is how a change is made there
    const canChange = !!cal && (cal.canUpdate || (!be.recurring && cal.canCreate && cal.canDelete));
    if (cal && e.uid && (canChange || cal.canDelete))
      be.ref = { href: 'ha:' + cal.id, etag: e.uid, rid: e.recurrence_id || null };
    else be.readOnly = true;
    return be;
  }
  async function haRange(c: { id: string }, from: Date, to: Date): Promise<BoardEvent[]> {
    if (!ha) throw new Error('Home Assistant isn’t reachable from here');
    const cal = await haCan(c.id);
    if (!cal) throw new Error(`Home Assistant has no calendar ${c.id} any more`);
    return (await ha.events(c.id, from, to)).map(e => fromHa(e, cal));
  }
  // the board's change, as Home Assistant's event fields
  function toHa({ title, date, allDay, time, minutes, through }: EventChange): HaEventIn {
    if (allDay) {
      const last = through && through >= date ? through : date;
      return { summary: title, dtstart: date, dtend: addDays(last, 1) };
    }
    const [y, m, d] = date.split('-').map(Number);
    const [h, mi] = String(time).split(':').map(Number);
    const start = clock.fromZoned(y, m, d, h, mi);
    return {
      summary: title,
      dtstart: start.toISOString(),
      dtend: new Date(start.getTime() + (minutes || 60) * 60000).toISOString()
    };
  }

  async function eventsForMonth(ym: string): Promise<BoardEvent[]> {
    const cached = monthCache.get(ym);
    if (cached && Date.now() - cached.at < 60 * 1000) return cached.events;
    const failed: string[] = [];
    const events = await fetchMonth(ym, failed);
    // noted in the server log once, not on every screen's every request
    const was = down;
    down = failed.length ? failed.join(' · ') : null;
    // (what went wrong can hold the server's own words: never a line break, so never a fake log line)
    if (down !== was) console.error(down ? `Chalkboard: calendar: ${oneLine(down)}` : 'Chalkboard: calendar: back');
    monthCache.set(ym, { at: Date.now(), events }); // (a minute, then it tries again)
    return events;
  }

  // ------------------------------------ //
  // | One calendar, and its saved copy | //
  // ------------------------------------ //
  // A calendar's events for a month: fetched and saved; when it can't be    //
  // reached, the copy saved last time (from before a restart too), or none. //
  async function kept(
    ym: string,
    src: string,
    get: () => Promise<BoardEvent[]>,
    failed: string[],
    label = ''
  ): Promise<BoardEvent[]> {
    try {
      const ev = await get();
      saved?.set(ym, src, ev);
      return ev;
    } catch (e) {
      const old = saved?.get<BoardEvent>(ym, src);
      failed.push(`${label}${(e as Error).message}${old ? ' (showing the copy it had)' : ''}`);
      return old ? old.events : [];
    }
  }

  async function fetchMonth(ym: string, failed: string[]): Promise<BoardEvent[]> {
    const g = clock.monthGrid(ym);
    const [sy, sm, sd] = g.start.split('-').map(Number);
    const [ey, em, ed] = g.end.split('-').map(Number);
    const rangeStart = clock.fromZoned(sy, sm, sd, 0, 0);
    const rangeEnd = clock.fromZoned(ey, em, ed, 0, 0);
    if (cfg.provider === 'homeassistant') {
      const main = haMain();
      const lists = await Promise.all(
        cfg.haCalendars.map(async c => {
          const isMain = c.id === main?.id;
          const n = failed.length;
          const ev = await kept(
            ym,
            isMain ? 'main' : 'cal:' + c.name,
            async () =>
              (await haRange(c, rangeStart, rangeEnd)).map(e =>
                isMain ? e : { ...e, cal: c.name, calColor: c.color }
              ),
            failed,
            isMain ? '' : `“${c.name}”: `
          );
          if (failed.length > n) problems.set(c.name, failed[failed.length - 1]);
          else problems.delete(c.name);
          return ev;
        })
      );
      const feeds = await Promise.all(
        cfg.feeds.map(f =>
          kept(
            ym,
            'link:' + f.name,
            async () =>
              ical
                .eventsFromIcs(await feedText(f), null, rangeStart, rangeEnd, [])
                .map(e => ({ ...e, cal: f.name, calColor: f.color, readOnly: true })),
            failed,
            `“${f.name}”: `
          )
        )
      );
      return [...lists, ...feeds]
        .flat()
        .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.sort - b.sort));
    }
    const gMain = cfg.provider === 'google' ? googleMain() : null;
    // the main calendar: its problems show on the board
    let out = await kept(
      ym,
      'main',
      async () => {
        const ev = await caldavRange(await findCalendar(), rangeStart, rangeEnd);
        return gMain?.readOnly ? ev.map(readOnlyCopy) : ev;
      },
      failed
    );
    const others: { id: string; name: string; color: string; readOnly?: boolean }[] =
      cfg.provider === 'google' ? googleCalendars().filter(c => c.id !== gMain?.id) : cfg.extraCalendars;
    const more = await Promise.all([
      ...others
        .filter(c => !mainUrl || !sameUrl(extraUrl(c), mainUrl))
        .map(async c => {
          const n = failed.length;
          const ev = await kept(
            ym,
            'cal:' + c.name,
            async () => {
              const list = await caldavRange(await sameAccount(extraUrl(c)), rangeStart, rangeEnd);
              return list.map(e => ({ ...(c.readOnly ? readOnlyCopy(e) : e), cal: c.name, calColor: c.color }));
            },
            failed,
            `“${c.name}”: `
          );
          if (failed.length > n) problems.set(c.name, failed[failed.length - 1]);
          else problems.delete(c.name);
          return ev;
        }),
      ...cfg.feeds.map(async f => {
        const n = failed.length;
        const ev = await kept(
          ym,
          'link:' + f.name,
          async () =>
            ical
              .eventsFromIcs(await feedText(f), null, rangeStart, rangeEnd, [])
              .map(e => ({ ...e, cal: f.name, calColor: f.color, readOnly: true })),
          failed,
          `“${f.name}”: `
        );
        if (failed.length > n) problems.set(f.name, failed[failed.length - 1]);
        else problems.delete(f.name);
        return ev;
      })
    ]);
    for (const list of more) out.push(...list);
    out = out.slice().sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.sort - b.sort));
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
    if (cfg.provider === 'homeassistant') {
      const target = (calendarId && cfg.haCalendars.find(c => c.id === calendarId)) || haMain();
      if (!target || !ha) throw new Error('Pick a Home Assistant calendar first (admin console → ⚙️ Board)');
      if (!(await haCan(target.id))?.canCreate)
        throw new Error(`Home Assistant can’t add events to “${target.name}”: pick another calendar`);
      await ha.createEvent(target.id, toHa({ title, date, allDay, time, minutes, through }));
      monthCache.clear();
      return 'ha:' + target.id;
    }
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
    const r = await safeFetch(`${url}${uid}.ics`, {
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
    if (cfg.provider === 'homeassistant') {
      const id = ref.href.replace(/^ha:/, '');
      if (!ha || !ref.href.startsWith('ha:') || !cfg.haCalendars.some(c => c.id === id) || !ref.etag)
        throw new Error('That event isn’t in one of the board’s calendars');
      const cal = await haCan(id);
      const rid = scope === 'one' ? ref.rid || null : null;
      monthCache.clear();
      if (!change) {
        if (!cal?.canDelete) throw new Error('Home Assistant can’t delete events from that calendar');
        return void (await ha.deleteEvent(id, ref.etag, rid));
      }
      if (cal?.canUpdate) return void (await ha.updateEvent(id, ref.etag, rid, toHa(change)));
      // a calendar that can only add and delete (Home Assistant's Google calendars): delete it, add it again
      if (cal?.canCreate && cal.canDelete && !ref.rid) {
        await ha.createEvent(id, toHa(change));
        return void (await ha.deleteEvent(id, ref.etag, null));
      }
      throw new Error('Home Assistant can’t change events in that calendar');
    }
    const url = new URL(ref.href, await findCalendar()).toString();
    if (!(await editableCalendars()).some(c => sameUrl(url, c)))
      throw new Error('That event isn’t in the family calendar');
    const g = await safeFetch(url, {
      headers: { Authorization: await authHeader() },
      signal: AbortSignal.timeout(20000)
    });
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
      r = await safeFetch(url, { method: 'DELETE', headers, signal: AbortSignal.timeout(20000) });
    } else {
      headers['Content-Type'] = 'text/calendar; charset=utf-8';
      r = await safeFetch(url, { method: 'PUT', headers, body: result.text, signal: AbortSignal.timeout(20000) });
    }
    monthCache.clear();
    if (r.status === 412)
      throw new Error('Someone changed this event a moment ago - the board has refreshed, try again');
    if (!r.ok) throw new Error(`Calendar refused the change (${r.status})`);
  }

  return {
    eventsForMonth,
    writable,
    haCalendars: () => (ha ? ha.calendars() : Promise.resolve([] as HaCalendar[])),
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
      saved?.clear(); // a different calendar or account: the saved copies aren't theirs
    }
  };
}
export type CalendarSource = ReturnType<typeof createCalendarSource>;

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
