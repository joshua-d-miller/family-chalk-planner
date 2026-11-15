/*
===============================================================================
 Family Chalk Planner | Tests | calendar-cache.test.ts
===============================================================================
 Version:   0.15.1
 Author:    Joshua D. Miller, Claude
 Updated:   2026-11-10

 Purpose:
     When the calendar can't be reached, the board shows the copy of the
     month it saved last time, even after a restart; a new calendar or
     account forgets the old copies.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.15.1    2026-11-10   joshua    New file.
                        claude
===============================================================================
*/

import test from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import type { Server } from 'node:http';
import { makeCalendarCache } from '../server/calendar/cache.ts';
import { createCalendarSource } from '../server/calendar/source.ts';
import type { CalendarConfig } from '../server/calendar/source.ts';
import { makeClock } from '../server/dates.ts';
import * as mockCaldav from './mock-caldav.ts';

const DAV = 4590;
const clock = makeClock({ timeZone: 'America/New_York', time24: false, weekStart: 0, southern: false });
const cfg: CalendarConfig = {
  provider: 'caldav',
  caldavUrl: `http://127.0.0.1:${DAV}/`,
  user: 'u',
  password: 'p',
  calendarName: 'Family',
  extraCalendars: [],
  haCalendars: [],
  feeds: []
};
const noGoogle = {} as Parameters<typeof createCalendarSource>[2];
const titles = (ev: { title: string }[]) => ev.map(e => e.title);

test('a calendar that can’t be reached: the saved copy, even after a restart', async () => {
  const db = new DatabaseSync(':memory:');
  const saved = makeCalendarCache(db);
  const dav = (await mockCaldav.start(DAV)) as Server;
  const first = createCalendarSource(cfg, clock, noGoogle, saved);
  const live = await first.eventsForMonth('2026-10');
  assert.ok(titles(live).includes('Dentist'));
  assert.equal(first.down(), null);
  dav.close();
  dav.closeAllConnections();

  // the board restarts while the calendar is down
  const second = createCalendarSource(cfg, clock, noGoogle, saved);
  const kept = await second.eventsForMonth('2026-10');
  assert.deepEqual(titles(kept), titles(live), 'the same events as last time');
  assert.match(second.down() || '', /showing the copy it had/);
  // a month it never saw: nothing to show, and it says why (the board still draws the month)
  assert.deepEqual(await second.eventsForMonth('2027-02'), []);
  assert.ok(second.down());

  // the board restarts set up for another calendar: none of the old copies show
  const other = createCalendarSource({ ...cfg, calendarName: 'Work' }, clock, noGoogle, saved);
  assert.deepEqual(await other.eventsForMonth('2026-10'), []);
  // (and back again: still nothing, they were forgotten)
  const again = createCalendarSource(cfg, clock, noGoogle, saved);
  assert.deepEqual(await again.eventsForMonth('2026-10'), []);
});

test('Google: signing in again (another account) forgets the copies', async () => {
  const saved = makeCalendarCache(new DatabaseSync(':memory:'));
  const second = createCalendarSource(cfg, clock, noGoogle, saved);
  saved.set('2026-10', 'main', [{ title: 'Old' }]);
  second.reset(); // (what a new Google sign-in or calendar choice calls)
  assert.equal(saved.get('2026-10', 'main'), null);
});
