/*
===============================================================================
 Family Chalk Planner | Screens | Board | Month.tsx
===============================================================================
 Version:   1.3.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-07
 Updated:   2026-11-26

 Purpose:
     The month: its name, the weekdays, and a box per day with its events,
     multi-day bars, trash day and holidays. Same layout as the board
     (1252 x 642 board pixels), so art drawn on a day stays on that day.

 Used by:
     web/src/board/Alerts.tsx
     web/src/board/Board.tsx
     web/src/board/EventEditor.tsx
     web/src/board/Notes.tsx
     web/src/board/editors/BorderEditor.tsx
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    The board in React (wall view, next/board):
                        claude    month, events, art, notes column; sharp at
                        colby     4K.

                                  The new board: the family's style, each
                                  month's title and holiday border, polaroids,
                                  drawn jars.

                                  The new wall board: the overnight slideshow,
                                  the photo frame, the day view, reminders and
                                  timers.

                                  The new board on a tablet (next/edit):
                                  events, the month's title and border, the
                                  board style.

                                  The new screens take over: /, /edit and
                                  /chores are the React board; the old one
                                  stays at /classic.

 0.15.0    2026-11-08   joshua    One week in the whole height, with bigger
                        claude    writing.

 0.15.1    2026-11-10   joshua    The month knows when the calendar couldn't be
                        claude    reached.

 0.16.0    2026-11-11   joshua    A cake on birthdays only when ⚙️ Settings
                        claude    says so.

                                  A border of light bulbs is a string of
                                  lights: on a wire, pointing out, twinkling.

 1.1.0    2026-11-17   joshua    A badge on a starred countdown's day (in
                        claude    sleeps or days).
                                  outage, from the month.

 1.1.1    2026-11-18   joshua    No month arrows where they don't work (the
                        claude    wall).

 1.2.0    2026-11-21   joshua    A week starts on its own first day (today,
                        claude    on a screen whose week starts today).
                        colby     A tap on the month's name can reload the
                                  board (from Colby Way's board).
                                  Split View: the week as a band, and what
                                  the screen picked under it. Taller days on
                                  a screen that fills itself.
                                  The family's events stay in their own words
                                  in another language (holidays are
                                  translated).

 1.2.1    2026-11-22   joshua    A wider calendar with the Notes column
                        claude    off (its border too).

 1.3.0    2026-11-26   joshua    The month arrows can fade when nobody's
                        claude    touching the screen.
===============================================================================
*/

import type { CSSProperties, ReactNode } from 'react';
import { clipSrc } from './clip.ts';
import { CAL, CAL_WIDE, hash } from './geom.ts';
import { TODAY_MARKS } from './theme.ts';
import { readable } from './color.ts';
import { howLong, useSleeps } from '../lib/countdowns.ts';
import './countdown.css';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------ //
// | Events and the month | //
// ------------------------ //
export interface BoardEvent {
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  time: string | null;
  holiday?: boolean;
  icon?: string;
  color?: string;
  calColor?: string;
  size?: 'l' | 'xl';
  readOnly?: boolean;
  hm?: string | null; // 'HH:MM'
  minutes?: number | null;
  recurring?: boolean;
  countdown?: boolean;
  cdIcon?: string; // a countdown's own picture (⭐ unless one was picked)
  cal?: string; // which calendar, when there are several
  ref?: { href: string; etag: string | null; rid?: string | null };
}
export type WritableCal = { id: string; name: string; color: string | null; main: boolean };
export interface MonthData {
  calendars?: WritableCal[];
  ym: string;
  today: string;
  grid: { start: string; weeks: number; y: number; m: number; weekStart?: number; time24?: boolean };
  events: BoardEvent[];
  problem?: string;
  outage?: string | null; // Apple's or Google's status page says their calendar has a problem
  cake?: boolean; // a 🎂 on birthdays // the calendar couldn't be reached (the board shows holidays and what it had)
}
export interface Bins {
  day: number | null;
  recycle: { mode: string; day?: number; anchor?: string };
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------- //
// | Names | //
// --------- //
export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
];
const WEEKDAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const EV_SIZE = { l: 1.35, xl: 1.8 };
const GRID_H = 642 - 8 - 10 - 70 - 28; // the slate, less its padding, the title and the weekdays
export const SPLIT_BAND = 0.46; // Split View: how much of the calendar's height (under the title) the week takes

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------- //
// | Days and events | //
// ------------------- //
export const addDays = (ds: string, n: number) => {
  const [y, m, d] = ds.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
// the first day of the week a date is in (weekStart: 0 Sunday, 1 Monday)
export const weekOf = (ds: string, weekStart: number) =>
  addDays(ds, -((new Date(ds + 'T12:00:00Z').getUTCDay() - weekStart + 7) % 7));
// how an event reads in a day box: holidays get their emoji, birthdays a cake (when ⚙️ Settings says so)
export function evText(ev: BoardEvent, cake = false) {
  let t = ev.holiday ? `${ev.icon} ${ev.title}` : ev.title;
  if (cake && !ev.holiday && /birthday|bday/i.test(t) && !t.includes('🎂')) t = '🎂 ' + t;
  return ev.allDay || ev.holiday ? t : `${t} @ ${ev.time}`;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------------------- //
// | Trash and recycling | //
// ----------------------- //
// Which bins go out on a date (as the server works it out)                  //
function binsFor(ds: string, b: Bins | null): ('trash' | 'recycle')[] {
  if (!b) return [];
  const dn = (x: string) => Date.UTC(+x.slice(0, 4), +x.slice(5, 7) - 1, +x.slice(8, 10)) / 864e5;
  const dow = new Date(dn(ds) * 864e5).getUTCDay();
  const r = b.recycle || { mode: 'same' };
  const out: ('trash' | 'recycle')[] = [];
  if (b.day === dow) out.push('trash');
  if (
    (r.mode === 'same' && b.day === dow) ||
    (r.mode === 'day' && r.day === dow) ||
    (r.mode === 'biweekly' && r.day === dow && r.anchor && ((((dn(ds) - dn(r.anchor)) / 7) % 2) + 2) % 2 === 0)
  )
    out.push('recycle');
  return out;
}
const Trash = () => (
  <svg
    width="12"
    height="14"
    viewBox="0 0 40 44"
    fill="none"
    stroke="currentColor"
    strokeWidth="3.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M7 11h26M15 11V6h10v5M10 11l2 27h16l2-27" />
  </svg>
);
const Ring = ({ color, shape }: { color: string; shape: string }) => (
  <svg
    className="ring"
    viewBox="0 0 46 42"
    fill="none"
    stroke={color}
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={TODAY_MARKS[shape] || TODAY_MARKS.ring} />
  </svg>
);

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------ //
// | The month grid | //
// ------------------ //
export function Month({
  data,
  bins,
  bg,
  onDay,
  onEvent,
  title,
  today = { shape: 'ring', color: '#F6B3CB' },
  border = null,
  nav,
  onTitle,
  week = null,
  under = null,
  height = 642,
  wide = false
}: {
  data: MonthData;
  bins: Bins | null;
  bg: number;
  today?: { shape: string; color: string };
  border?: Border | null;
  nav?: { prev: () => void; next: () => void; faded?: boolean }; // faded: nobody's touched the screen for a while
  onTitle?: () => void; // a tap on the month's name (a screen that edits: reload the board)
  week?: string | null; // just this week (its first day), in the whole height
  under?: ReactNode; // Split View: the week as a band across the top, and this under it
  height?: number; // the slate's height on this screen (taller where it fills the screen)
  wide?: boolean; // the Notes column is left off: the calendar is wider
  onDay?: (date: string) => void;
  onEvent?: (ev: BoardEvent) => void;
  title?: ReactNode;
}) {
  const g = data.grid;
  // a week starts on its own first day (today, on a screen whose 🗓️ Week starts today)
  const ws = week ? new Date(week + 'T12:00:00Z').getUTCDay() : g.weekStart || 0;
  const sleeps = useSleeps(); // a countdown badge in sleeps or days
  const pad = border ? BORDER_SZ[border.size] + 6 : 0;
  // the weeks shown: the month's, or one of them
  const nWeeks = week ? 1 : g.weeks;
  // (Split View: the week's band is SPLIT_BAND of the height, the spaces under it the rest)
  const gridAll = GRID_H + (height - 642); // (a taller slate: taller days)
  const gridH = under ? (gridAll + 28) * SPLIT_BAND - 28 : gridAll;
  const cellH = (gridH - 2 * pad) / nWeeks;
  const big = week ? 1.35 : 1; // a week has the room for bigger writing
  const single = data.events.filter(e => e.start === e.end);
  const multi = data.events.filter(e => e.start !== e.end);
  const color = (e: BoardEvent) => (e.color || e.calColor ? readable((e.color || e.calColor)!, bg) : undefined);
  const weeks: ReactNode[] = [];
  for (let w = 0; w < nWeeks; w++) {
    const weekStart = week || addDays(g.start, w * 7);
    const weekEnd = addDays(weekStart, 6);
    const lanes: [number, number][][] = [];
    const dayLanes = [0, 0, 0, 0, 0, 0, 0];
    const bars: ReactNode[] = [];
    for (const e of multi) {
      if (e.end < weekStart || e.start > weekEnd) continue;
      const s = e.start < weekStart ? weekStart : e.start;
      const t = e.end > weekEnd ? weekEnd : e.end;
      const c1 = (Date.parse(s) - Date.parse(weekStart)) / 864e5 + 1;
      const c2 = (Date.parse(t) - Date.parse(weekStart)) / 864e5 + 1;
      let lane = 0;
      while (lanes[lane]?.some(r => !(c2 < r[0] || c1 > r[1]))) lane++;
      (lanes[lane] = lanes[lane] || []).push([c1, c2]);
      if (lane > 2) continue;
      for (let k = c1; k <= c2; k++) dayLanes[k - 1] = Math.max(dayLanes[k - 1], lane + 1);
      const c = color(e);
      bars.push(
        <div
          key={'b' + bars.length}
          className="bar"
          style={{ gridColumn: `${c1} / ${c2 + 1}`, marginTop: 31 + lane * 24, borderColor: c }}
          onClick={onEvent && (() => onEvent(e))}
        >
          <span className="chalk" style={{ color: c }} translate={e.holiday ? undefined : 'no'}>
            {e.title}
          </span>
        </div>
      );
    }
    const days: ReactNode[] = [];
    let ring: ReactNode = null;
    for (let d = 0; d < 7; d++) {
      const ds = addDays(weekStart, d);
      const inMonth = week ? true : ds.slice(0, 7) === data.ym;
      const isToday = ds === data.today;
      const filled = today.shape === 'box' ? ' todaybox' : today.shape === 'bg' ? ' todaybg' : '';
      if (isToday && !filled)
        ring = (
          <div className="ringAt" style={{ left: `calc(${(((d + 1) / 7) * 100).toFixed(4)}% - 39px)` }}>
            <Ring color={readable(today.color, bg, 2.2)} shape={today.shape} />
          </div>
        );
      const b = binsFor(ds, bins);
      const same = bins?.recycle?.mode === 'same';
      const lanesHere = dayLanes[d];
      const list = single.filter(e => e.start === ds);
      // room for events, in pixels: a normal line is 15px; Large / Extra large ones take more
      const room = cellH - 5 - 24 - lanesHere * 24 - 4;
      const need = (e: BoardEvent) =>
        15 * big * (e.size ? EV_SIZE[e.size] : 1) * (e.size && evText(e, data.cake).length > 12 ? 2 : 1);
      let show = 0;
      let used = 0;
      for (let k = 0; k < list.length; k++) {
        const n = need(list[k]);
        const rest = k < list.length - 1;
        if (used + n + (rest ? 15 : 0) > room && (rest || used + n > room)) break;
        used += n;
        show++;
      }
      if (!show && list.length) show = 1;
      days.push(
        <button
          key={ds}
          type="button"
          className={'day' + (inMonth ? '' : ' other') + (isToday ? filled : '')}
          style={{ gridColumn: d + 1 }}
          data-date={ds}
          aria-label={ds}
          onClick={onDay && (() => onDay(ds))}
        >
          <div className="num">{Number(ds.slice(8))}</div>
          <div className="top">
            {b.length > 0 && (
              <>
                {b.includes('trash') ? <Trash /> : '♻️'}
                {b.length === 2 && !same ? 'Trash + recycling' : b[0] === 'trash' ? 'Trash' : 'Recycling'}
              </>
            )}
            {(() => {
              // a starred event's day, within the next 60: "⭐ 5 days" (or sleeps), "🎉 Today!" on the day
              const star = data.events.find(e => e.countdown && e.start === ds);
              const n = Math.round((Date.parse(ds) - Date.parse(data.today)) / 864e5);
              if (!star || n < 0 || n > 60) return null;
              return (
                <span className={'cdb' + (n === 0 ? ' today' : '')} title={star.title}>
                  {n === 0 ? '🎉 Today!' : `${star.cdIcon || '⭐'} ${howLong(n, sleeps)}`}
                </span>
              );
            })()}
          </div>
          {lanesHere > 0 && <div style={{ height: lanesHere * 24, flex: 'none' }} />}
          {list.slice(0, show).map((ev, i) => {
            const full = evText(ev, data.cake);
            const at = !ev.allDay && !ev.holiday ? full.lastIndexOf(' @ ') : -1;
            return (
              <div
                key={i}
                className={
                  'ev chalk' +
                  (ev.holiday ? ' holiday' : ev.allDay ? ' allday' : '') +
                  (ev.size ? ' sz-' + ev.size : '')
                }
                title={full}
                translate={ev.holiday ? undefined : 'no'}
                style={{
                  color: color(ev),
                  fontSize: ev.size ? 13 * big * EV_SIZE[ev.size] : week ? 13 * big : undefined
                }}
                onClick={
                  onEvent &&
                  ((e: React.MouseEvent) => {
                    e.stopPropagation();
                    onEvent(ev);
                  })
                }
              >
                <span className="tt">{at > 0 ? full.slice(0, at) : full}</span>
                {at > 0 && <span className="tm">{full.slice(at)}</span>}
              </div>
            );
          })}
          {list.length > show && <div className="more">+{list.length - show} more</div>}
        </button>
      );
    }
    weeks.push(
      <div className="week" key={weekStart}>
        {bars}
        {days}
        {ring}
      </div>
    );
  }
  return (
    <div className="cal">
      <div
        className={'titlerow' + (onTitle ? ' tapname' : '')}
        onClick={onTitle && (e => (e.target as Element).closest?.('#monthName') && onTitle())}
      >
        {/* the arrows only where they work (not on a wall) */}
        {nav ? (
          <NavBtn dir="prev" onClick={nav.prev} faded={nav.faded} />
        ) : (
          <span className="navgap" aria-hidden="true" />
        )}
        {title ?? (
          <h1 id="monthName">
            <span className="mn" data-text={MONTHS[g.m - 1]}>
              {MONTHS[g.m - 1]}
            </span>
            {g.y !== Number(data.today.slice(0, 4)) && <small>{g.y}</small>}
          </h1>
        )}
        {nav ? (
          <NavBtn dir="next" onClick={nav.next} faded={nav.faded} />
        ) : (
          <span className="navgap" aria-hidden="true" />
        )}
      </div>
      <div
        className={'calbody' + (border ? ' bordered' : '') + (under ? ' band' : '')}
        id="calbody"
        style={
          { '--bpad': pad + 'px', ...(under ? { flex: `0 0 ${(SPLIT_BAND * 100).toFixed(2)}%` } : {}) } as CSSProperties
        }
      >
        <div className="weekdays">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i}>{WEEKDAYS[(i + ws) % 7]}</div>
          ))}
        </div>
        <div
          id="grid"
          className={week ? 'oneweek' : undefined}
          style={{ gridTemplateRows: `repeat(${nWeeks}, minmax(0, 1fr))` }}
        >
          {weeks}
        </div>
        {border && <BorderLayer border={border} wide={wide} />}
      </div>
      {under && <div className="under">{under}</div>}
    </div>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------- //
// | The arrows | //
// -------------- //
// faded: hidden until the next tap anywhere, and not tappable meanwhile (that first tap only brings them back)
const NavBtn = ({ dir, onClick, faded }: { dir: 'prev' | 'next'; onClick?: () => void; faded?: boolean }) => (
  <button
    type="button"
    className={'nav' + (faded ? ' faded' : '')}
    id={dir}
    aria-label={dir === 'prev' ? 'Previous month' : 'Next month'}
    onClick={onClick}
    tabIndex={onClick ? 0 : -1}
  >
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={dir === 'prev' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
    </svg>
  </button>
);

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------- //
// | The border | //
// -------------- //
// A holiday border: up to 8 pictures repeated around the calendar's edge    //
export type Border = { items: string[]; color: string; size: 's' | 'm' | 'l' };
const BORDER_SZ = { s: 20, m: 26, l: 34 };
const CAL_H = GRID_H + 28;
export const borderSrc = (n: string, color: string) => clipSrc(n, color);
function BorderLayer({ border: b, wide }: { border: Border; wide: boolean }) {
  const sz = BORDER_SZ[b.size] || 26;
  const half = (sz + 6) / 2;
  const gap = sz * 0.45;
  const pts: [number, number][] = [];
  const turn: number[] = []; // which way each one faces (a string of lights: out from the calendar)
  const side = (x0: number, y0: number, x1: number, y1: number, deg: number) => {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / (sz + gap)));
    for (let i = 0; i < n; i++) {
      pts.push([x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n]);
      turn.push(deg);
    }
  };
  // a border of only light bulbs is a string of lights: on a wire, every bulb pointing out
  const lights = b.items.every(n => n.startsWith('cp-bulb-'));
  const W = wide ? CAL_WIDE : CAL.w; // the calendar box in board pixels (wider with the Notes column off)
  const H = CAL_H;
  side(half, half, W - half, half, 180);
  side(W - half, half, W - half, H - half, -90);
  side(W - half, H - half, half, H - half, 0);
  side(half, H - half, half, half, 90);
  // the wire: through each bulb's socket (the end that faces the calendar), sagging a little between them
  const sock = pts.map(([x, y], i): [number, number] => {
    const a = (turn[i] * Math.PI) / 180;
    return [x + Math.sin(a) * sz * 0.42, y - Math.cos(a) * sz * 0.42];
  });
  const wire = lights
    ? sock
        .map(([x, y], i) => {
          const [px, py] = sock[(i + sock.length - 1) % sock.length];
          const mx = (x + px) / 2;
          const my = (y + py) / 2;
          return (
            (i ? `Q${mx.toFixed(1)} ${(my + 3).toFixed(1)} ` : `M${x.toFixed(1)} ${y.toFixed(1)} `) +
            `${x.toFixed(1)} ${y.toFixed(1)}`
          );
        })
        .join(' ') + ' Z'
    : '';
  return (
    <div className="borderLayer" id="borderLayer" aria-hidden="true">
      {lights && (
        <svg className="lightWire" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
          <path d={wire} fill="none" stroke="#2E4A2E" strokeWidth={2} />
        </svg>
      )}
      {pts.map((p, i) => (
        <img
          key={i}
          alt=""
          src={borderSrc(b.items[i % b.items.length], b.color)}
          style={{
            width: sz,
            height: sz,
            left: +(p[0] - sz / 2).toFixed(1),
            top: +(p[1] - sz / 2).toFixed(1),
            transform: `rotate(${lights ? turn[i] : Math.round((hash(i + 1, 7) - 0.5) * 24)}deg)`
          }}
        />
      ))}
    </div>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
