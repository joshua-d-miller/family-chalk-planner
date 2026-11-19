/*
===============================================================================
 Family Chalk Planner | Server | check.ts
===============================================================================
 Version:   1.1.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-17
 Updated:   2026-11-17

 Purpose:
     Check connections (admin console → ⚙️ Board): is everything the board
     reads from working right now, with the board's own settings? The
     calendar (this month and next), every extra calendar and calendar
     link, and the photos; and, only when asked, a real round trip: a test
     event added to the main calendar, read back and deleted. When the
     calendar fails, what Apple's or Google's status page says comes along.
     No test accounts needed: it uses the connections the board already
     has, and nothing leaves the board but those connections' own requests.

 Routes:
     POST   /api/board-settings/check   { write?: boolean }

 Known limitations:
     The round trip really adds an event (a year ahead, deleted at once).
     A calendar shared with others may tell them it was added, which is
     why it's off unless ticked.

 Used by:
     server/main.ts
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.1.0    2026-11-17   joshua    New file.
                        claude
===============================================================================
*/

import type { Express } from 'express';
import { addDays } from './dates.ts';
import type { Clock } from './dates.ts';
import type { CalendarSource } from './calendar/source.ts';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------ //
// | What's checked | //
// ------------------ //
export interface Check {
  name: string;
  ok: boolean | null; // null: not set up, so nothing to check
  detail: string;
}
const TEST_TITLE = 'Family Chalk Planner check (deleted right away)';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------- //
// | The checks | //
// -------------- //
export function registerCheck({
  app,
  source,
  clock,
  calendarSetUp,
  photos,
  outage
}: {
  app: Express;
  source: CalendarSource;
  clock: Clock;
  calendarSetUp: () => boolean;
  photos: () => Promise<Check>; // server/photos/photos.ts: reads the album now
  outage: () => Promise<string | null>; // server/outages.ts
}) {
  app.post('/api/board-settings/check', async (req, res) => {
    const write = (req.body || {}).write === true;
    const out: Check[] = [];
    const ym = clock.today().slice(0, 7);
    const next = addDays(`${ym}-28`, 7).slice(0, 7);

    // ---------------------------- //
    // | The calendar: two months | //
    // ---------------------------- //
    if (!calendarSetUp()) out.push({ name: 'Calendar', ok: null, detail: 'No calendar set up yet' });
    else
      try {
        const a = await source.eventsForMonth(ym);
        const b = await source.eventsForMonth(next);
        const down = source.down();
        out.push(
          down
            ? { name: 'Calendar', ok: false, detail: down }
            : { name: 'Calendar', ok: true, detail: `Read this month and next (${a.length + b.length} events)` }
        );
      } catch (e) {
        out.push({ name: 'Calendar', ok: false, detail: (e as Error).message });
      }

    // -------------------------------------- //
    // | Extra calendars and calendar links | //
    // -------------------------------------- //
    for (const [name, problem] of source.problems) out.push({ name, ok: false, detail: problem });

    // ------------------------------------------- //
    // | Only when asked: add, read back, delete | //
    // ------------------------------------------- //
    if (write && calendarSetUp() && out[0]?.ok) {
      const date = addDays(clock.today(), 400);
      try {
        const href = await source.addEvent({ title: TEST_TITLE, date, allDay: true });
        const found = (await source.eventsForMonth(date.slice(0, 7))).find(e => e.ref?.href === href);
        if (!found?.ref) throw new Error('The test event was added but couldn’t be read back');
        await source.changeEvent(found.ref, 'all', null);
        out.push({ name: 'Adding an event', ok: true, detail: 'Added a test event, read it back and deleted it' });
      } catch (e) {
        out.push({ name: 'Adding an event', ok: false, detail: (e as Error).message });
      }
    }

    // ---------- //
    // | Photos | //
    // ---------- //
    try {
      out.push(await photos());
    } catch (e) {
      out.push({ name: 'Photos', ok: false, detail: (e as Error).message });
    }

    // a calendar problem: does Apple or Google say why?
    const failing = out.some(c => c.ok === false && c.name !== 'Photos');
    res.json({ checks: out, outage: failing ? await outage() : null });
  });
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
