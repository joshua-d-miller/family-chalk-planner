/*
===============================================================================
 Family Chalk Planner | Tests | calendar-feeds.test.ts
===============================================================================
 Version:   0.17.1
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-14
 Updated:   2026-11-14

 Purpose:
     Calendar links as the big services publish them, read the way the
     board shows them (America/New_York):
       - Outlook.com / Microsoft 365: Windows time zone names ("Eastern
         Standard Time") with their own VTIMEZONE, a weekly event with a
         skipped week, an all-day event, and a meeting set in Pacific time
       - Google's "secret address in iCal format": times in UTC (Z), a
         repeating event that ends, and one occurrence moved
       - iCloud's public calendar link: America/New_York with its
         VTIMEZONE, and a two-day all-day event
     Each event lands on the right day at the right local time, and a
     calendar link is read-only.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.17.1    2026-11-14   joshua    New file.
                        claude
===============================================================================
*/

import test from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeAdmin, client } from './helpers.ts';

const PORT = 3986,
  FEEDS = 5986;
const base = `http://127.0.0.1:${PORT}`;

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------------------- //
// | The feeds, as each service writes | //
// ------------------------------------- //
const crlf = (s: string) => s.replace(/\r?\n/g, '\r\n');

// Outlook.com "Publish a calendar" → ICS link (trimmed, same shape)
const OUTLOOK = crlf(`BEGIN:VCALENDAR
METHOD:PUBLISH
PRODID:Microsoft Exchange Server 2010
VERSION:2.0
X-WR-CALNAME:Calendar
BEGIN:VTIMEZONE
TZID:Eastern Standard Time
BEGIN:STANDARD
DTSTART:16010101T020000
TZOFFSETFROM:-0400
TZOFFSETTO:-0500
RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=1SU;BYMONTH=11
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:16010101T020000
TZOFFSETFROM:-0500
TZOFFSETTO:-0400
RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=2SU;BYMONTH=3
END:DAYLIGHT
END:VTIMEZONE
BEGIN:VTIMEZONE
TZID:Pacific Standard Time
BEGIN:STANDARD
DTSTART:16010101T020000
TZOFFSETFROM:-0700
TZOFFSETTO:-0800
RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=1SU;BYMONTH=11
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:16010101T020000
TZOFFSETFROM:-0800
TZOFFSETTO:-0700
RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=2SU;BYMONTH=3
END:DAYLIGHT
END:VTIMEZONE
BEGIN:VEVENT
UID:040000008200E00074C5B7101A82E00800000000outlook-practice
SUMMARY:Hockey practice
RRULE:FREQ=WEEKLY;UNTIL=20261231T230000Z;INTERVAL=1;BYDAY=TU;WKST=SU
EXDATE;TZID=Eastern Standard Time:20261013T170000
DTSTART;TZID=Eastern Standard Time:20261006T170000
DTEND;TZID=Eastern Standard Time:20261006T183000
CLASS:PUBLIC
PRIORITY:5
DTSTAMP:20261001T120000Z
TRANSP:OPAQUE
STATUS:CONFIRMED
SEQUENCE:0
X-MICROSOFT-CDO-ALLDAYEVENT:FALSE
X-MICROSOFT-CDO-BUSYSTATUS:BUSY
END:VEVENT
BEGIN:VEVENT
UID:040000008200E00074C5B7101A82E00800000000outlook-call
SUMMARY:Call with Grandma (she's in California)
DTSTART;TZID=Pacific Standard Time:20261008T090000
DTEND;TZID=Pacific Standard Time:20261008T093000
DTSTAMP:20261001T120000Z
X-MICROSOFT-CDO-ALLDAYEVENT:FALSE
END:VEVENT
BEGIN:VEVENT
UID:040000008200E00074C5B7101A82E00800000000outlook-allday
SUMMARY:Field trip
DTSTART;VALUE=DATE:20261016
DTEND;VALUE=DATE:20261017
DTSTAMP:20261001T120000Z
X-MICROSOFT-CDO-ALLDAYEVENT:TRUE
END:VEVENT
END:VCALENDAR
`);

// Google Calendar → Settings → "Secret address in iCal format" (same shape)
const GOOGLE = crlf(`BEGIN:VCALENDAR
PRODID:-//Google Inc//Google Calendar 70.9054//EN
VERSION:2.0
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:Family
X-WR-TIMEZONE:America/New_York
BEGIN:VEVENT
DTSTART:20261003T130000Z
DTEND:20261003T140000Z
RRULE:FREQ=WEEKLY;UNTIL=20261024T130000Z;BYDAY=SA
DTSTAMP:20261001T120000Z
UID:7kukuqrfedlm2f9t5vsffd2ag2@google.com
SUMMARY:Swim meet
STATUS:CONFIRMED
TRANSP:OPAQUE
END:VEVENT
BEGIN:VEVENT
DTSTART:20261011T150000Z
DTEND:20261011T160000Z
DTSTAMP:20261001T120000Z
UID:7kukuqrfedlm2f9t5vsffd2ag2@google.com
RECURRENCE-ID:20261010T130000Z
SUMMARY:Swim meet (moved to Sunday)
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR
`);

// iCloud Calendar → Public Calendar link (webcal://, same shape)
const ICLOUD = crlf(`BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Apple Inc.//iCloud Web Calendar//EN
CALSCALE:GREGORIAN
X-WR-CALNAME:Grandparents
BEGIN:VTIMEZONE
TZID:America/New_York
BEGIN:DAYLIGHT
TZOFFSETFROM:-0500
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
DTSTART:20070311T020000
TZNAME:EDT
TZOFFSETTO:-0400
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:-0400
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
DTSTART:20071104T020000
TZNAME:EST
TZOFFSETTO:-0500
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:B1A2C3D4-0000-4000-8000-ICLOUDVISIT
DTSTART;VALUE=DATE:20261024
DTEND;VALUE=DATE:20261026
SUMMARY:Grandparents visit
DTSTAMP:20261001T120000Z
SEQUENCE:0
END:VEVENT
BEGIN:VEVENT
UID:B1A2C3D4-0000-4000-8000-ICLOUDDINNER
DTSTART;TZID=America/New_York:20261029T183000
DTEND;TZID=America/New_York:20261029T200000
SUMMARY:Dinner at Grandma's
DTSTAMP:20261001T120000Z
END:VEVENT
END:VCALENDAR
`);

const FEEDS_SERVED: Record<string, string> = {
  '/outlook/calendar.ics': OUTLOOK,
  '/google/basic.ics': GOOGLE,
  '/icloud/published.ics': ICLOUD
};

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------------------------- //
// | A board with the three links, no account | //
// ------------------------------------------- //
let board: ChildProcess, feeds: http.Server, data: string, admin: ReturnType<typeof client>;
test.before(async () => {
  feeds = http
    .createServer((req, res) => {
      const body = FEEDS_SERVED[(req.url || '').split('?')[0]];
      if (!body) return res.writeHead(404).end();
      res.writeHead(200, { 'Content-Type': 'text/calendar; charset=utf-8' }).end(body);
    })
    .listen(FEEDS, '127.0.0.1');
  data = fs.mkdtempSync(path.join(os.tmpdir(), 'fcp-feeds-'));
  const url = (p: string) => `http://127.0.0.1:${FEEDS}${p}`;
  board = spawn(process.execPath, [path.join(import.meta.dirname, '..', 'server', 'chalkboard.js')], {
    env: {
      ...process.env,
      PORT: String(PORT),
      BIND: '127.0.0.1',
      DATA_DIR: data,
      TIMEZONE: 'America/New_York',
      HOLIDAYS: 'none',
      ICS_FEEDS: JSON.stringify([
        { name: 'Work', url: url('/outlook/calendar.ics'), color: '#7FB3E6' },
        { name: 'Swim team', url: url('/google/basic.ics'), color: '#7FD1C7' },
        { name: 'Grandparents', url: url('/icloud/published.ics'), color: '#F6B3CB' }
      ])
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + '/api/whoami')).ok) break;
    } catch {}
    await new Promise(r => setTimeout(r, 150));
  }
  admin = client(base, (await makeAdmin(base, data)).cookie);
});
test.after(() => {
  board?.kill();
  feeds?.close();
});

type Ev = {
  title: string;
  start: string;
  end: string;
  hm: string | null;
  allDay: boolean;
  cal?: string;
  readOnly?: boolean;
};
async function october(): Promise<Ev[]> {
  // the links are fetched in the background: wait until all three have answered
  for (let i = 0; i < 60; i++) {
    const m = (await (await admin.api('/api/month?ym=2026-10')).json()) as { events: Ev[] };
    const cals = new Set(m.events.map(e => e.cal));
    if (['Work', 'Swim team', 'Grandparents'].every(c => cals.has(c))) return m.events;
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('the calendar links never showed up');
}
const on = (evs: Ev[], title: string) => evs.filter(e => e.title === title).map(e => `${e.start} ${e.hm || 'all day'}`);

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------- //
// | The tests | //
// ------------- //
test('Outlook: Windows time zone names, a skipped week, all-day, another time zone', async () => {
  const evs = await october();
  assert.deepEqual(on(evs, 'Hockey practice').sort(), ['2026-10-06 17:00', '2026-10-20 17:00', '2026-10-27 17:00']);
  assert.deepEqual(
    on(evs, "Call with Grandma (she's in California)"),
    ['2026-10-08 12:00'],
    '9:00 Pacific is noon here'
  );
  const trip = evs.find(e => e.title === 'Field trip');
  assert.ok(trip && trip.allDay && trip.start === '2026-10-16' && trip.end === '2026-10-16', 'all day, on its one day');
});

test('Google: UTC times, a series that ends, one week moved', async () => {
  const evs = await october();
  assert.deepEqual(on(evs, 'Swim meet').sort(), ['2026-10-03 09:00', '2026-10-17 09:00', '2026-10-24 09:00']);
  assert.deepEqual(on(evs, 'Swim meet (moved to Sunday)'), ['2026-10-11 11:00']);
});

test('iCloud: its own time zone, a two-day visit', async () => {
  const evs = await october();
  assert.deepEqual(on(evs, "Dinner at Grandma's"), ['2026-10-29 18:30']);
  const visit = evs.find(e => e.title === 'Grandparents visit');
  assert.ok(visit && visit.allDay, 'all day');
  assert.equal(visit.start, '2026-10-24');
  assert.equal(visit.end, '2026-10-25', 'two days: the end date in the feed is the day after');
});

test('calendar links are read-only, each in its own calendar', async () => {
  const evs = (await october()).filter(e => ['Work', 'Swim team', 'Grandparents'].includes(e.cal || ''));
  assert.ok(evs.length >= 9);
  assert.ok(evs.every(e => e.readOnly));
});
