/*
===============================================================================
 Family Chalk Planner | Tests | time.test.ts
===============================================================================
 Version:   0.13.0
 Author:    Joshua D. Miller, Claude
 Updated:   2026-11-07

 Purpose:
     Time zones and daylight saving: the board's clock, events, chores and
     reminders when the clocks change (spring forward: a skipped hour;
     fall back: an hour twice), on boards in other time zones too.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    Daylight saving and time zone tests; the
                        claude    newest libraries and CI actions.
===============================================================================
*/

import test from 'node:test';
import assert from 'node:assert';
import { periods } from '../server/chores.ts';
import { makeIcal } from '../server/calendar/ical.ts';
import { addDays, makeClock } from '../server/dates.ts';

const clockIn = (timeZone: string, weekStart: 0 | 1 = 0) =>
  makeClock({ timeZone, time24: false, weekStart, southern: false });
const ny = clockIn('America/New_York');
const at = (c: ReturnType<typeof clockIn>, iso: string) => c.zoned(new Date(iso));

test('the board’s date and time on the nights the clocks change (New York)', () => {
  // fall back, 2026-11-01: 1:59 EDT, then 1:00 EST
  assert.deepEqual(at(ny, '2026-11-01T05:59:00Z'), { y: 2026, m: 11, d: 1, h: 1, mi: 59, dateStr: '2026-11-01' });
  assert.equal(at(ny, '2026-11-01T06:00:00Z').h, 1); // 1 AM again
  assert.equal(at(ny, '2026-11-02T04:59:00Z').dateStr, '2026-11-01'); // 11:59 PM EST, still Sunday
  assert.equal(at(ny, '2026-11-02T05:00:00Z').dateStr, '2026-11-02'); // midnight
  // spring forward, 2026-03-08: 1:59 EST, then 3:00 EDT
  assert.equal(at(ny, '2026-03-08T06:59:00Z').h, 1);
  assert.equal(at(ny, '2026-03-08T07:00:00Z').h, 3);
  assert.equal(at(ny, '2026-03-09T03:59:00Z').dateStr, '2026-03-08'); // 11:59 PM EDT
});

test('a time typed on the edit card means that time on the board’s clock, even on the nights the clocks change', () => {
  for (const [tz, days] of [
    ['America/New_York', ['2026-03-08', '2026-11-01']],
    ['Europe/London', ['2026-03-29', '2026-10-25']],
    ['Australia/Sydney', ['2026-04-05', '2026-10-04']], // the southern hemisphere: the other way round
    ['Australia/Lord_Howe', ['2026-04-05', '2026-10-04']], // clocks change by half an hour
    ['America/Phoenix', ['2026-03-08']] // no daylight saving at all
  ] as [string, string[]][]) {
    const c = clockIn(tz);
    for (const day of days)
      for (let mins = 0; mins < 24 * 60; mins += 15) {
        const [y, m, d] = day.split('-').map(Number);
        const h = Math.floor(mins / 60);
        const mi = mins % 60;
        const z = c.zoned(c.fromZoned(y, m, d, h, mi));
        const shown = z.h * 60 + z.mi;
        assert.equal(z.dateStr, day, `${tz} ${day} ${h}:${mi}`);
        // the same time, or (a time the clocks skip) a little later, never earlier
        assert.ok(
          shown === mins || (shown > mins && shown - mins <= 60),
          `${tz} ${day} ${h}:${mi} became ${z.h}:${z.mi}`
        );
      }
  }
});

test('a time the clocks skip moves forward, like calendar apps; a time that happens twice is the first one', () => {
  const skipped = ny.fromZoned(2026, 3, 8, 2, 30);
  assert.equal(skipped.toISOString(), '2026-03-08T07:30:00.000Z'); // 3:30 EDT
  const twice = ny.fromZoned(2026, 11, 1, 1, 30);
  assert.equal(twice.toISOString(), '2026-11-01T05:30:00.000Z'); // 1:30 EDT, the first 1:30
});

test('an event added for 9 AM on the morning the clocks change is at 9 AM, for an hour', () => {
  const ical = makeIcal(ny);
  for (const date of ['2026-11-01', '2026-03-08']) {
    const t = ical.newTimes({ title: 'Church', date, allDay: false, time: '09:00', minutes: 60 });
    const be = ical.toBoardEvent('Church', t.start, t.end);
    assert.deepEqual([be.start, be.hm, be.minutes, be.time], [date, '09:00', 60, '9am']);
  }
});

const VTIMEZONE = `BEGIN:VTIMEZONE
TZID:America/New_York
BEGIN:DAYLIGHT
TZOFFSETFROM:-0500
TZOFFSETTO:-0400
TZNAME:EDT
DTSTART:19700308T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:-0400
TZOFFSETTO:-0500
TZNAME:EST
DTSTART:19701101T020000
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
END:STANDARD
END:VTIMEZONE`;
const ics = (body: string) =>
  `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//test//EN\r\n${VTIMEZONE}\r\n${body}\r\nEND:VCALENDAR\r\n`.replace(
    /\r?\n/g,
    '\r\n'
  );

test('a weekly event stays at its time on the board before and after the clocks change', () => {
  const ical = makeIcal(ny);
  const text = ics(`BEGIN:VEVENT
UID:soccer
DTSTAMP:20260101T000000Z
SUMMARY:Soccer
DTSTART;TZID=America/New_York:20261017T090000
DTEND;TZID=America/New_York:20261017T100000
RRULE:FREQ=WEEKLY;COUNT=5
END:VEVENT`);
  const out = ical.eventsFromIcs(text, null, new Date('2026-10-01T00:00:00Z'), new Date('2026-12-01T00:00:00Z'), []);
  assert.deepEqual(
    out.map(e => `${e.start} ${e.time} ${e.minutes}`),
    [
      '2026-10-17 9am 60',
      '2026-10-24 9am 60',
      '2026-10-31 9am 60',
      '2026-11-07 9am 60', // after the clocks went back
      '2026-11-14 9am 60'
    ]
  );
});

test('an event across the hour that happens twice lasts as long as it really does', () => {
  const ical = makeIcal(ny);
  const text = ics(`BEGIN:VEVENT
UID:late
DTSTAMP:20260101T000000Z
SUMMARY:Night shift
DTSTART;TZID=America/New_York:20261101T003000
DTEND;TZID=America/New_York:20261101T023000
END:VEVENT`);
  const [ev] = ical.eventsFromIcs(text, null, new Date('2026-10-31T00:00:00Z'), new Date('2026-11-03T00:00:00Z'), []);
  assert.equal(ev.start, '2026-11-01');
  assert.equal(ev.minutes, 180); // 12:30 to 2:30 is three hours that night
});

test('the same moment is a different day on boards in different time zones', () => {
  const iso = '2026-11-08T03:30:00Z'; // Saturday evening in New York, Sunday morning in London and Sydney
  assert.equal(at(ny, iso).dateStr, '2026-11-07');
  assert.equal(at(clockIn('Europe/London'), iso).dateStr, '2026-11-08');
  assert.equal(at(clockIn('Australia/Sydney'), iso).dateStr, '2026-11-08');
  assert.equal(at(clockIn('Pacific/Kiritimati'), iso).dateStr, '2026-11-08'); // UTC+14
  assert.equal(at(clockIn('Pacific/Pago_Pago'), iso).dateStr, '2026-11-07'); // UTC-11
});

test('chores start again each day, week and month on the board’s calendar, through the clock changes', () => {
  // a Sunday-start week: the week of the fall-back Sunday starts that Sunday, and the next starts a week later
  assert.equal(periods('2026-11-01', 0).week, '2026-11-01');
  assert.equal(periods('2026-11-07', 0).week, '2026-11-01');
  assert.equal(periods('2026-11-08', 0).week, '2026-11-08');
  // a Monday-start week across the spring-forward Sunday
  assert.equal(periods('2026-03-08', 1).week, '2026-03-02');
  assert.equal(periods('2026-03-09', 1).week, '2026-03-09');
  // each day, for a whole year: one period per day, seven days per week, the weeks back to back
  let day = '2026-01-01';
  let week = periods(day, 0).week;
  let n = 0;
  for (let i = 0; i < 366; i++) {
    const p = periods(day, 0);
    assert.equal(p.day, day);
    assert.equal(p.month, day.slice(0, 7));
    if (p.week !== week) {
      assert.equal(p.week, addDays(week, 7), `the week after ${week}`);
      if (week !== periods('2026-01-01', 0).week) assert.equal(n, 7); // (the year starts mid-week)
      week = p.week;
      n = 0;
    }
    n++;
    day = addDays(day, 1);
  }
});

test('the month grid and adding days don’t slip an hour on the nights the clocks change', () => {
  assert.equal(addDays('2026-11-01', 1), '2026-11-02');
  assert.equal(addDays('2026-03-08', 1), '2026-03-09');
  assert.equal(addDays('2026-03-09', -1), '2026-03-08');
  const g = ny.monthGrid('2026-11');
  assert.deepEqual([g.start, g.weeks, g.end], ['2026-11-01', 5, '2026-12-06']);
});
