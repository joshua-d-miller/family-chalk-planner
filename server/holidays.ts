// Holidays: worked out here for the board's country (never written to anyone's calendar). The family
// can hide any of them (every year), and the big ones are counted down to in the Notes column.
//   kv 'holidaysOff'  ["Indigenous Peoples' Day", ...]
import type { Express } from 'express';
import { addDays, easter, nthDow, ymd } from './dates.ts';

export type Country = 'us' | 'ca' | 'gb' | 'none';

export interface Holiday {
  date: string;
  icon: string;
  title: string;
  big: boolean; // counted down to in the Notes column
}

// As the month view shows them, next to the calendar's events
export interface HolidayEvent {
  title: string;
  icon: string;
  holiday: true;
  allDay: true;
  start: string;
  end: string;
  time: null;
  sort: -1;
}

type Row = [string, string, string, boolean?]; // date, icon, title, big

function rowsFor(country: Country, y: number): Row[] {
  const ea = easter(y);
  if (country === 'gb')
    return [
      [ymd(y, 1, 1), '🎉', "New Year's Day", true],
      [ymd(y, 2, 14), '❤️', "Valentine's Day", true],
      [ymd(y, 3, 17), '☘️', "St Patrick's Day"],
      [addDays(ea, -21), '💐', 'Mothering Sunday', true],
      [nthDow(y, 3, 0, -1), '⏰', 'Clocks go forward'],
      [addDays(ea, -2), '✝️', 'Good Friday'],
      [ea, '🐣', 'Easter', true],
      [addDays(ea, 1), '🐣', 'Easter Monday'],
      [nthDow(y, 5, 1, 1), '🌼', 'Early May bank holiday'],
      [nthDow(y, 5, 1, -1), '🌳', 'Spring bank holiday'],
      [nthDow(y, 6, 0, 3), '👔', "Father's Day", true],
      [nthDow(y, 8, 1, -1), '☀️', 'Summer bank holiday'],
      [nthDow(y, 10, 0, -1), '⏰', 'Clocks go back'],
      [ymd(y, 10, 31), '🎃', 'Halloween', true],
      [ymd(y, 11, 5), '🎆', 'Bonfire Night', true],
      [nthDow(y, 11, 0, 2), '🌺', 'Remembrance Sunday'],
      [ymd(y, 12, 24), '🎄', 'Christmas Eve'],
      [ymd(y, 12, 25), '🎄', 'Christmas Day', true],
      [ymd(y, 12, 26), '🎁', 'Boxing Day'],
      [ymd(y, 12, 31), '🥳', "New Year's Eve"]
    ];
  if (country === 'ca') {
    // Victoria Day: the Monday before May 25
    const may25dow = new Date(Date.UTC(y, 4, 25)).getUTCDay();
    const victoria = addDays(ymd(y, 5, 25), -((may25dow + 6) % 7 || 7));
    return [
      [ymd(y, 1, 1), '🎉', "New Year's Day", true],
      [nthDow(y, 2, 1, 3), '👪', 'Family Day'],
      [ymd(y, 2, 14), '❤️', "Valentine's Day", true],
      [nthDow(y, 3, 0, 2), '⏰', 'Clocks spring forward'],
      [ymd(y, 3, 17), '☘️', "St. Patrick's Day"],
      [addDays(ea, -2), '✝️', 'Good Friday'],
      [ea, '🐣', 'Easter', true],
      [nthDow(y, 5, 0, 2), '💐', "Mother's Day", true],
      [victoria, '👑', 'Victoria Day'],
      [nthDow(y, 6, 0, 3), '👔', "Father's Day", true],
      [ymd(y, 7, 1), '🇨🇦', 'Canada Day', true],
      [nthDow(y, 8, 1, 1), '☀️', 'Civic Holiday'],
      [nthDow(y, 9, 1, 1), '🛠️', 'Labour Day'],
      [ymd(y, 9, 30), '🧡', 'National Day for Truth and Reconciliation'],
      [nthDow(y, 10, 1, 2), '🦃', 'Thanksgiving', true],
      [ymd(y, 10, 31), '🎃', 'Halloween', true],
      [nthDow(y, 11, 0, 1), '⏰', 'Clocks fall back'],
      [ymd(y, 11, 11), '🌺', 'Remembrance Day'],
      [ymd(y, 12, 24), '🎄', 'Christmas Eve'],
      [ymd(y, 12, 25), '🎄', 'Christmas', true],
      [ymd(y, 12, 26), '🎁', 'Boxing Day'],
      [ymd(y, 12, 31), '🥳', "New Year's Eve"]
    ];
  }
  if (country === 'none') return [];
  return [
    [ymd(y, 1, 1), '🎉', "New Year's Day", true],
    [nthDow(y, 1, 1, 3), '🕊️', 'Martin Luther King Jr. Day'],
    [ymd(y, 2, 14), '❤️', "Valentine's Day", true],
    [nthDow(y, 2, 1, 3), '🇺🇸', "Presidents' Day"],
    [nthDow(y, 3, 0, 2), '⏰', 'Clocks spring forward'],
    [ymd(y, 3, 17), '☘️', "St. Patrick's Day", true],
    [ea, '🐣', 'Easter', true],
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
  ];
}

export function holidaysOfYear(country: Country, y: number): Holiday[] {
  return rowsFor(country, y).map(([date, icon, title, big]) => ({ date, icon, title, big: !!big }));
}

export interface HolidayDeps {
  app: Express;
  country: Country;
  kvGet: (key: string) => unknown;
  kvSet: (key: string, value: unknown) => void;
  broadcast: (event: string, data: unknown) => void;
  today: () => string;
}

export function setup({ app, country, kvGet, kvSet, broadcast, today }: HolidayDeps) {
  const hidden = () => new Set((kvGet('holidaysOff') as string[] | null) || []);
  const ofYear = (y: number) => holidaysOfYear(country, y);

  // The holidays (not hidden) from one date to another, both included
  function between(from: string, to: string): HolidayEvent[] {
    const out: HolidayEvent[] = [];
    const off = hidden();
    for (let y = +from.slice(0, 4); y <= +to.slice(0, 4); y++) {
      for (const h of ofYear(y)) {
        if (h.date >= from && h.date <= to && !off.has(h.title))
          out.push({
            title: h.title,
            icon: h.icon,
            holiday: true,
            allDay: true,
            start: h.date,
            end: h.date,
            time: null,
            sort: -1
          });
      }
    }
    return out;
  }

  // The list (this year's dates) with which ones are hidden
  app.get('/api/holidays', (_req, res) => {
    const off = hidden();
    const y = +today().slice(0, 4);
    res.json({
      country,
      holidays: ofYear(y).map(h => ({ title: h.title, icon: h.icon, date: h.date, off: off.has(h.title) }))
    });
  });

  app.post('/api/holidays', (req, res) => {
    const want = (req.body || {}).off;
    if (!Array.isArray(want)) return res.status(400).json({ error: 'bad list' });
    const known = new Set(ofYear(2026).map(h => h.title));
    // names from another country's list stay hidden (if the board's country changes back)
    const keep = [...hidden()].filter(t => !known.has(t));
    const off = [...new Set(want.filter((t): t is string => typeof t === 'string' && known.has(t)))].concat(keep);
    kvSet('holidaysOff', off);
    broadcast('calendar', { ym: 'any' });
    res.json({ ok: true, off });
  });

  return { between, ofYear };
}
