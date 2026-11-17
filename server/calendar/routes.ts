/*
===============================================================================
 Family Chalk Planner | Server | Calendar | routes.ts
===============================================================================
 Version:   1.1.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-06
 Updated:   2026-11-17

 Purpose:
     What the screens ask the calendar for: a month (with holidays and the
     board's own colors, sizes and countdown stars), "Up next", the
     countdowns, and adding, changing or deleting events.

     Colors, sizes and countdown stars are board-only (the calendar server
     never sees them), stored by event: 'href|rid' for one occurrence,
     'href|' for a whole event or series.
       kv 'evcolors'    { key: '#RRGGBB' }
       kv 'evsizes'     { key: 'l' | 'xl' }
       kv 'countdowns'  { key: { title, date, icon? } }

 Routes:
     GET    /api/calendar/status
     GET    /api/month
     GET    /api/upnext
     POST   /api/evcolor
     POST   /api/evsize
     POST   /api/countdowns
     GET    /api/countdowns
     POST   /api/events
     POST   /api/events/update
     POST   /api/events/delete

 Used by:
     server/main.ts
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

 0.16.0    2026-11-11   joshua    Birthdays: a cake and counting down to every
                        claude    one are settings, both off; otherwise a
                                  birthday counts down only when starred.

 1.1.0    2026-11-17   joshua    Countdowns: a picture of their own, ?all=1
                        claude    for every one in the next 60 days (the day
                                  badges), starred ones marked.
                                  What Apple's or Google's status page says,
                                  with the month's problem and in ⚙️'s
                                  calendar status.
===============================================================================
*/

import type { Express } from 'express';
import { addDays, isDate, isYm } from '../dates.ts';
import type { Clock } from '../dates.ts';
import type { HolidayEvent } from '../holidays.ts';
import type { CalendarSource } from './source.ts';
import type { EventChange, EventRef } from './ical.ts';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------------- //
// | Board-only marks | //
// -------------------- //
const EV_SIZES = ['l', 'xl'];
// the pictures a countdown can have (its big card and badge); ⭐ unless one is picked
export const CD_ICONS = [
  '⭐',
  '🎉',
  '🎂',
  '🎁',
  '🎄',
  '🎃',
  '🦃',
  '🐰',
  '💝',
  '🎆',
  '🏖️',
  '🏕️',
  '✈️',
  '🎢',
  '⚽',
  '🎓',
  '🏫',
  '🎭'
];
const keyOf = (ref: EventRef) => `${ref.href}|${ref.rid || ''}`;

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------------------------- //
// | Checking what a screen sends | //
// -------------------------------- //
function validRef(ref: unknown): ref is EventRef {
  const r = ref as EventRef | null;
  return (
    !!r &&
    typeof r.href === 'string' &&
    r.href.length < 500 &&
    (r.etag == null || typeof r.etag === 'string') &&
    (r.rid == null || /^[0-9TZ]{8,16}$/.test(r.rid))
  );
}
// a ref sent with a color, size or countdown star
const markRef = (ref: unknown): ref is EventRef =>
  !!ref && typeof (ref as EventRef).href === 'string' && (ref as EventRef).href.length <= 500;

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------------------- //
// | The edit card, checked | //
// -------------------------- //
// The edit card's fields, checked; or what's wrong with them                //
function readChange(b: Record<string, unknown>): EventChange | string {
  const { title, date, allDay, time, minutes, through } = b;
  if (!title || !String(title).trim() || !isDate(date)) return 'Title and date are required';
  if (!allDay && !/^\d{2}:\d{2}$/.test(String(time || ''))) return 'Pick a time, or choose All day';
  if (through && !isDate(through)) return 'bad end date';
  return {
    title: String(title).trim().slice(0, 200),
    date,
    allDay: !!allDay,
    time: time as string | undefined,
    minutes: Number(minutes) || 60,
    through: (through as string) || undefined
  };
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------ //
// | What the routes need | //
// ------------------------ //
export interface CalendarRouteDeps {
  app: Express;
  source: CalendarSource;
  clock: Clock;
  kvGet: (key: string) => unknown;
  kvSet: (key: string, value: unknown) => void;
  broadcast: (event: string, data: unknown) => void;
  holidays: {
    between: (from: string, to: string) => HolidayEvent[];
    ofYear: (y: number) => { date: string; title: string; big: boolean }[];
  };
  showHolidays: boolean; // HOLIDAYS isn't 'none'
  status: () => Record<string, unknown>; // for ⚙️: which calendar, connected, problems
  outage?: () => Promise<string | null>; // Apple's or Google's status page, when the calendar is failing
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------- //
// | The routes | //
// -------------- //
export function registerCalendarRoutes({
  app,
  source,
  clock,
  kvGet,
  kvSet,
  broadcast,
  holidays,
  showHolidays,
  status,
  outage = async () => null
}: CalendarRouteDeps) {
  // the month doesn't wait on a status page: what's known now (the answer is kept for the next time)
  const outageNow = () =>
    Promise.race([outage(), new Promise<null>(r => setTimeout(() => r(null), 300))]).catch(() => null);
  const marks = <T>(key: string) => (kvGet(key) as Record<string, T> | null) || {};
  const colors = () => marks<string>('evcolors');
  const sizes = () => marks<string>('evsizes');
  const countdowns = () => marks<{ title: string; date: string; icon?: string }>('countdowns');
  // birthdays: a 🎂 on them, and counting down to every one without starring it (both off unless asked)
  const isBirthday = (t: string) => /birthday|bday|🎂/i.test(t);
  const bdays = () => {
    const v = (kvGet('birthdays') || {}) as { cake?: boolean; countdown?: boolean };
    return { cake: !!v.cake, countdown: !!v.countdown };
  };
  // this occurrence's setting, else the whole series'
  const forEvent = <T>(all: Record<string, T>, ref: EventRef) => all[keyOf(ref)] ?? all[`${ref.href}|`];

  // (with what Apple or Google say, when there's a problem)
  app.get('/api/calendar/status', async (_req, res) => {
    const st = status();
    const failing = !!st.problem || Object.keys((st.problems as object) || {}).length > 0 || !!source.down();
    res.json({ ...st, ...(failing ? { outage: await outage() } : {}) });
  });

  // ----------- //
  // | A month | //
  // ----------- //
  // Its weeks, every event in them (with the board's own colors, sizes and  //
  // stars), the holidays, and the calendars a new event can go in.          //
  app.get('/api/month', async (req, res) => {
    const ym = req.query.ym;
    if (!isYm(ym)) return res.status(400).json({ error: 'bad month' });
    try {
      const g = clock.monthGrid(ym);
      const cd = countdowns();
      const col = colors();
      const sz = sizes();
      const events = (await source.eventsForMonth(ym)).map(e => {
        if (!e.ref) return e;
        const c = forEvent(col, e.ref);
        const z = forEvent(sz, e.ref);
        return {
          ...e,
          ...(cd[keyOf(e.ref)] ? { countdown: true, cdIcon: cd[keyOf(e.ref)].icon || '⭐' } : {}),
          ...(c ? { color: c } : {}),
          ...(z ? { size: z } : {})
        };
      });
      const hol = showHolidays ? holidays.between(g.start, addDays(g.start, g.weeks * 7 - 1)) : [];
      const down = source.down();
      res.json({
        ym,
        grid: g,
        events: [...hol, ...events],
        calendars: source.writable(),
        today: clock.today(),
        cake: bdays().cake,
        ...(down ? { problem: down, outage: await outageNow() } : {})
      });
    } catch (err) {
      // the calendar can't be reached and there's nothing saved yet: the month still shows (with its
      // holidays), and the board says what's wrong, instead of a board with no calendar on it
      try {
        const g = clock.monthGrid(ym);
        const hol = showHolidays ? holidays.between(g.start, addDays(g.start, g.weeks * 7 - 1)) : [];
        res.json({
          ym,
          grid: g,
          events: hol,
          calendars: [],
          today: clock.today(),
          cake: bdays().cake,
          problem: (err as Error).message,
          outage: await outageNow()
        });
      } catch {
        res.status(502).json({ error: (err as Error).message });
      }
    }
  });

  // ----------- //
  // | Up next | //
  // ----------- //
  // "Up next": the next events from today on (two weeks ahead), for the     //
  // bottom of the Notes column                                              //
  app.get('/api/upnext', async (_req, res) => {
    try {
      const now = clock.zoned(new Date());
      const today = now.dateStr;
      const nowMin = now.h * 60 + now.mi;
      const until = addDays(today, 14);
      const col = colors();
      const all: { date: string; title: string; time: string | null; sort: number; color: string | null }[] = [];
      for (const ym of new Set([today.slice(0, 7), until.slice(0, 7)])) {
        for (const e of await source.eventsForMonth(ym)) {
          if (e.end < today || e.start > until) continue;
          if (e.start === today && !e.allDay && e.sort + (e.minutes || 60) < nowMin) continue; // already over
          all.push({
            date: e.start < today ? today : e.start,
            title: e.title,
            time: e.allDay ? null : e.time,
            sort: e.allDay ? -1 : e.sort,
            color: (e.ref && forEvent(col, e.ref)) || e.calColor || null
          });
        }
      }
      const seen = new Set<string>();
      const list = all
        .sort((a, b) => (a.date === b.date ? a.sort - b.sort : a.date < b.date ? -1 : 1))
        .filter(e => {
          const k = e.date + e.title + e.time;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        })
        .slice(0, 12);
      res.json({ today, events: list });
    } catch (e) {
      res.json({ today: clock.today(), events: [], error: (e as Error).message });
    }
  });

  // ------------------------ //
  // | A color on the board | //
  // ------------------------ //
  // A color for an event on the board. Set with "All of them" (or on a      //
  // one-off event), it's stored for the whole series; clearing a series'    //
  // color clears its one-offs too.                                          //
  app.post('/api/evcolor', (req, res) => {
    const { ref, color } = req.body || {};
    if (!markRef(ref) || (color != null && !/^#[0-9a-fA-F]{6}$/.test(color)))
      return res.status(400).json({ error: 'bad color' });
    const all = colors();
    if (color) all[keyOf(ref)] = color.toUpperCase();
    else delete all[keyOf(ref)];
    if (!ref.rid && !color) for (const k of Object.keys(all)) if (k.startsWith(`${ref.href}|`)) delete all[k];
    kvSet('evcolors', all);
    broadcast('calendar', { ym: 'any' }); // every open month redraws
    res.json({ ok: true });
  });

  // ----------------------- //
  // | A size on the board | //
  // ----------------------- //
  // Text size on the board (Large / Extra large, for birthdays and big      //
  // days), kept like colors                                                 //
  app.post('/api/evsize', (req, res) => {
    const { ref, size } = req.body || {};
    if (!markRef(ref) || (size != null && !EV_SIZES.includes(size))) return res.status(400).json({ error: 'bad size' });
    const all = sizes();
    if (size) all[keyOf(ref)] = size;
    else delete all[keyOf(ref)];
    if (!ref.rid && !size) for (const k of Object.keys(all)) if (k.startsWith(`${ref.href}|`)) delete all[k];
    kvSet('evsizes', all);
    broadcast('calendar', { ym: 'any' });
    res.json({ ok: true });
  });

  // ---------------------- //
  // | Count down to this | //
  // ---------------------- //
  // Count down to this                                                      //
  app.post('/api/countdowns', (req, res) => {
    const { ref, title, date, on, icon } = req.body || {};
    if (!markRef(ref) || !isDate(date)) return res.status(400).json({ error: 'bad countdown' });
    if (icon !== undefined && !CD_ICONS.includes(icon))
      return res.status(400).json({ error: 'Pick one of the pictures' });
    const all = countdowns();
    if (on)
      all[keyOf(ref)] = {
        title: String(title || '').slice(0, 80),
        date,
        ...(icon && icon !== '⭐' ? { icon } : {})
      };
    else delete all[keyOf(ref)];
    const today = clock.today();
    for (const k of Object.keys(all)) if (all[k].date < addDays(today, -2)) delete all[k]; // long past
    kvSet('countdowns', all);
    broadcast('countdowns', {});
    res.json({ ok: true });
  });

  // ------------- //
  // | Birthdays | //
  // ------------- //
  // A cake on birthdays, and counting down to every birthday without       //
  // starring it: both off unless the family turns them on (Settings)        //
  app.get('/api/birthdays', (_req, res) => res.json(bdays()));
  app.post('/api/birthdays', (req, res) => {
    const b = req.body || {};
    const v = {
      ...bdays(),
      ...('cake' in b ? { cake: !!b.cake } : {}),
      ...('countdown' in b ? { countdown: !!b.countdown } : {})
    };
    kvSet('birthdays', v);
    broadcast('calendar', {});
    broadcast('countdowns', {});
    res.json(v);
  });

  // ------------------ //
  // | The countdowns | //
  // ------------------ //
  // The next 3 within 60 days: big holidays and starred events (and every  //
  // birthday in the calendar, when Settings → Birthdays says so). ?all=1:   //
  // every one in those 60 days (the day badges on the month).               //
  app.get('/api/countdowns', async (req, res) => {
    const today = clock.today();
    const horizon = addDays(today, 60);
    const items: { icon: string; title: string; date: string; starred?: boolean }[] = [];
    for (const h of holidays.between(today, horizon)) {
      const big = holidays.ofYear(+h.start.slice(0, 4)).find(x => x.date === h.start && x.title === h.title);
      if (big && big.big) items.push({ icon: h.icon, title: h.title, date: h.start });
    }
    const bd = bdays();
    const icon = (t: string) => (bd.cake && isBirthday(t) ? '🎂' : '⭐');
    const plain = (t: string) => t.replace(/🎂/g, '').trim();
    for (const m of Object.values(countdowns()))
      if (m.date >= today && m.date <= horizon)
        items.push({ icon: m.icon || icon(m.title), title: plain(m.title), date: m.date, starred: true });
    if (bd.countdown)
      try {
        const ym = today.slice(0, 7);
        const next = addDays(`${ym}-28`, 7).slice(0, 7);
        for (const e of [...(await source.eventsForMonth(ym)), ...(await source.eventsForMonth(next))]) {
          if (isBirthday(e.title) && e.start >= today && e.start <= horizon)
            items.push({ icon: icon(e.title), title: plain(e.title), date: e.start });
        }
      } catch {
        /* the calendar is down: holidays still count down */
      }
    const seen = new Set<string>();
    const list = items
      .sort((a, b) => Number(!!b.starred) - Number(!!a.starred)) // a starred one wins over its twin
      .filter(i => {
        const k = i.date + i.title;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .map(i => ({ ...i, days: Math.round((Date.parse(i.date) - Date.parse(today)) / 864e5) }));
    res.json(req.query.all === '1' ? list : list.slice(0, 3));
  });

  // ------------------- //
  // | Adding an event | //
  // ------------------- //
  app.post('/api/events', async (req, res) => {
    const change = readChange(req.body || {});
    if (typeof change === 'string') return res.status(400).json({ error: change });
    try {
      const calendarId = (req.body || {}).calendarId;
      const href = await source.addEvent(change, typeof calendarId === 'string' ? calendarId : undefined);
      broadcast('calendar', { ym: change.date.slice(0, 7) });
      res.json({ ok: true, href });
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  // ---------------------------- //
  // | Changing or deleting one | //
  // ---------------------------- //
  // If someone changed it meanwhile, the answer is 409, so the tablet shows //
  // the calendar as it is now and says so.                                  //
  const conflict = (err: unknown) => ((err as Error).message.includes('moment ago') ? 409 : 502);

  app.post('/api/events/update', async (req, res) => {
    const { ref, scope, origDate } = req.body || {};
    if (!validRef(ref)) return res.status(400).json({ error: 'bad event' });
    const change = readChange(req.body || {});
    if (typeof change === 'string') return res.status(400).json({ error: change });
    try {
      await source.changeEvent(ref, scope === 'one' ? 'one' : 'all', change);
      broadcast('calendar', { ym: change.date.slice(0, 7) });
      if (isDate(origDate) && origDate.slice(0, 7) !== change.date.slice(0, 7))
        broadcast('calendar', { ym: origDate.slice(0, 7) });
      res.json({ ok: true });
    } catch (err) {
      res.status(conflict(err)).json({ error: (err as Error).message });
    }
  });

  app.post('/api/events/delete', async (req, res) => {
    const { ref, scope, origDate } = req.body || {};
    if (!validRef(ref)) return res.status(400).json({ error: 'bad event' });
    try {
      await source.changeEvent(ref, scope === 'one' ? 'one' : 'all', null);
      if (isDate(origDate)) broadcast('calendar', { ym: origDate.slice(0, 7) });
      res.json({ ok: true });
    } catch (err) {
      res.status(conflict(err)).json({ error: (err as Error).message });
    }
  });
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
