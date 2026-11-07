// What the screens ask the calendar for: a month (with holidays and the board's own colors, sizes
// and countdown stars), "Up next", the countdowns, and adding, changing or deleting events.
//
// Colors, sizes and countdown stars are board-only (the calendar server never sees them), stored by
// event: 'href|rid' for one occurrence, 'href|' for a whole event or series.
//   kv 'evcolors'    { key: '#RRGGBB' }
//   kv 'evsizes'     { key: 'l' | 'xl' }
//   kv 'countdowns'  { key: { title, date } }
import type { Express } from 'express';
import { addDays, isDate, isYm } from '../dates.ts';
import type { Clock } from '../dates.ts';
import type { HolidayEvent } from '../holidays.ts';
import type { CalendarSource } from './source.ts';
import type { EventChange, EventRef } from './ical.ts';

const EV_SIZES = ['l', 'xl'];
const keyOf = (ref: EventRef) => `${ref.href}|${ref.rid || ''}`;

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

// The edit card's fields, checked; or what's wrong with them
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
}

export function registerCalendarRoutes({
  app,
  source,
  clock,
  kvGet,
  kvSet,
  broadcast,
  holidays,
  showHolidays,
  status
}: CalendarRouteDeps) {
  const marks = <T>(key: string) => (kvGet(key) as Record<string, T> | null) || {};
  const colors = () => marks<string>('evcolors');
  const sizes = () => marks<string>('evsizes');
  const countdowns = () => marks<{ title: string; date: string }>('countdowns');
  // this occurrence's setting, else the whole series'
  const forEvent = <T>(all: Record<string, T>, ref: EventRef) => all[keyOf(ref)] ?? all[`${ref.href}|`];

  app.get('/api/calendar/status', (_req, res) => res.json(status()));

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
          ...(cd[keyOf(e.ref)] ? { countdown: true } : {}),
          ...(c ? { color: c } : {}),
          ...(z ? { size: z } : {})
        };
      });
      const hol = showHolidays ? holidays.between(g.start, addDays(g.start, g.weeks * 7 - 1)) : [];
      res.json({ ym, grid: g, events: [...hol, ...events], calendars: source.writable(), today: clock.today() });
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  // "Up next": the next events from today on (two weeks ahead), for the bottom of the Notes column
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

  // A color for an event on the board. Set with "All of them" (or on a one-off event), it's stored
  // for the whole series; clearing a series' color clears its one-offs too.
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

  // Text size on the board (Large / Extra large, for birthdays and big days), kept like colors
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

  // ⭐ Count down to this
  app.post('/api/countdowns', (req, res) => {
    const { ref, title, date, on } = req.body || {};
    if (!markRef(ref) || !isDate(date)) return res.status(400).json({ error: 'bad countdown' });
    const all = countdowns();
    if (on) all[keyOf(ref)] = { title: String(title || '').slice(0, 80), date };
    else delete all[keyOf(ref)];
    const today = clock.today();
    for (const k of Object.keys(all)) if (all[k].date < addDays(today, -2)) delete all[k]; // long past
    kvSet('countdowns', all);
    broadcast('countdowns', {});
    res.json({ ok: true });
  });

  // The next 3 within 60 days: big holidays, starred events, and birthdays from the calendar
  app.get('/api/countdowns', async (_req, res) => {
    const today = clock.today();
    const horizon = addDays(today, 60);
    const items: { icon: string; title: string; date: string }[] = [];
    for (const h of holidays.between(today, horizon)) {
      const big = holidays.ofYear(+h.start.slice(0, 4)).find(x => x.date === h.start && x.title === h.title);
      if (big && big.big) items.push({ icon: h.icon, title: h.title, date: h.start });
    }
    for (const m of Object.values(countdowns()))
      if (m.date >= today && m.date <= horizon) items.push({ icon: '⭐', title: m.title, date: m.date });
    try {
      const ym = today.slice(0, 7);
      const next = addDays(`${ym}-28`, 7).slice(0, 7);
      for (const e of [...(await source.eventsForMonth(ym)), ...(await source.eventsForMonth(next))]) {
        if (/birthday|bday|🎂/i.test(e.title) && e.start >= today && e.start <= horizon)
          items.push({ icon: '🎂', title: e.title.replace(/🎂/g, '').trim(), date: e.start });
      }
    } catch {
      /* the calendar is down: holidays still count down */
    }
    const seen = new Set<string>();
    const list = items
      .filter(i => {
        const k = i.date + i.title;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .map(i => ({ ...i, days: Math.round((Date.parse(i.date) - Date.parse(today)) / 864e5) }));
    res.json(list.slice(0, 3));
  });

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

  // someone else changed it meanwhile: 409, so the tablet refreshes and says so
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
