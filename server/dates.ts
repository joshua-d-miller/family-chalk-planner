/*
===============================================================================
 Family Chalk Planner | Server | dates.ts
===============================================================================
 Version:   0.13.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-06
 Updated:   2026-11-07

 Purpose:
     Dates and times as the board shows them: everything is in the board's
     time zone (TIMEZONE), and days are plain 'YYYY-MM-DD' strings so they
     never shift with the server's own clock.

 Used by:
     server/art.ts
     server/calendar/ical.ts
     server/calendar/routes.ts
     server/calendar/source.ts
     server/extras.ts
     server/holidays.ts
     server/main.ts
     server/month.ts
     server/pantry.ts
     server/reminders.ts
     test/time.test.ts
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    Dates and holidays in their own TypeScript
                        claude    modules.

                                  Live updates, nightly backup and the Notes
                                  extras in their own TypeScript modules.

                                  Daylight saving and time zone tests; the
                                  newest libraries and CI actions.
===============================================================================
*/

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------- //
// | Types | //
// --------- //
export interface ClockOptions {
  timeZone: string;
  time24: boolean; // 13:30 instead of 1:30pm
  weekStart: 0 | 1; // 0 = weeks start on Sunday, 1 = Monday
  southern: boolean; // seasons are flipped (south of the equator)
}

export interface ZonedParts {
  y: number;
  m: number;
  d: number;
  h: number;
  mi: number;
  dateStr: string;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------------- //
// | Plain dates | //
// --------------- //
// Days are 'YYYY-MM-DD' strings, worked out in UTC, so adding a day never   //
// slips an hour when the clocks change.                                     //
export const pad2 = (n: number) => String(n).padStart(2, '0');
export const ymd = (y: number, m: number, d: number) => `${y}-${pad2(m)}-${pad2(d)}`;

export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------- //
// | Holiday helpers | //
// ------------------- //
// The n-th weekday of a month (dow 0 = Sunday; n = -1: the last one)        //
export function nthDow(y: number, m: number, dow: number, n: number): string {
  if (n > 0) {
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    return ymd(y, m, 1 + ((dow - first + 7) % 7) + (n - 1) * 7);
  }
  const lastDay = new Date(Date.UTC(y, m, 0));
  const back = (lastDay.getUTCDay() - dow + 7) % 7;
  return ymd(y, m, lastDay.getUTCDate() - back);
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------------- //
// | Easter Sunday | //
// ----------------- //
// Easter Sunday (the anonymous Gregorian algorithm)                         //
export function easter(y: number): string {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(y, month, day);
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------ //
// | iCalendar text | //
// ------------------ //
// ICalendar text helpers                                                    //
export const icsUtc = (date: Date) =>
  date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
export const icsEscape = (s: unknown) =>
  String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
export const xmlUnescape = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#13;/g, '\r')
    .replace(/&amp;/g, '&');

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------------------- //
// | The board's clock | //
// --------------------- //
// Everything that depends on the board's time zone, week start and          //
// 12/24-hour setting: what date and time it is on the board, a time on the  //
// board's clock as a real moment, how times are written, and which weeks a  //
// month shows.                                                              //
export function makeClock({ timeZone, time24, weekStart, southern }: ClockOptions) {
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short'
  });

  // An instant, as the date and time on the board's clock
  function zoned(date: Date): ZonedParts {
    const p: Record<string, string> = {};
    for (const x of format.formatToParts(date)) p[x.type] = x.value;
    return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, dateStr: `${p.year}-${p.month}-${p.day}` };
  }

  // -------------------------------------------------- //
  // | A time on the board's clock -> the real moment | //
  // -------------------------------------------------- //
  // A time the clocks skip (2:30 on the night they spring forward) means    //
  // that time on the clock from before the change: 3:30, as calendar apps   //
  // do. A time that happens twice (fall back) is the first one.             //
  function fromZoned(y: number, m: number, d: number, h: number, mi: number): Date {
    const want = Date.UTC(y, m - 1, d, h, mi);
    const offsetAt = (t: number) => {
      const p = zoned(new Date(t));
      return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi) - t;
    };
    let guess = want;
    for (let i = 0; i < 2; i++) guess = want - offsetAt(guess);
    const p = zoned(new Date(guess));
    if (p.h !== h || p.mi !== mi || p.d !== d) guess = want - offsetAt(guess - 3 * 3600e3);
    return new Date(guess);
  }

  const today = () => zoned(new Date()).dateStr;

  function fmtTime(h: number, mi: number): string {
    if (time24) return `${h}:${pad2(mi)}`;
    const ap = h < 12 ? 'am' : 'pm';
    const hh = h % 12 === 0 ? 12 : h % 12;
    return mi ? `${hh}:${pad2(mi)}${ap}` : `${hh}${ap}`;
  }

  // ------------------------------- //
  // | The weeks shown for a month | //
  // ------------------------------- //
  // The weeks shown for a month: from the week start on or before the 1st,  //
  // 5 or 6 weeks                                                            //
  function monthGrid(ym: string) {
    const [y, m] = ym.split('-').map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1));
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const lead = (first.getUTCDay() - weekStart + 7) % 7;
    const weeks = Math.ceil((lead + daysInMonth) / 7);
    const start = addDays(`${y}-${pad2(m)}-01`, -lead);
    const end = addDays(start, weeks * 7); // exclusive
    return { y, m, weeks, start, end, daysInMonth, weekStart, time24, south: southern };
  }

  return { zoned, fromZoned, today, fmtTime, monthGrid, timeZone, weekStart };
}
export type Clock = ReturnType<typeof makeClock>;

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------------ //
// | Checking what screens send | //
// ------------------------------ //
// What screens send: a month 'YYYY-MM' or a day 'YYYY-MM-DD'                //
export const isYm = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
export const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
