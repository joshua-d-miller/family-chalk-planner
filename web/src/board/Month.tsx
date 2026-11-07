// The month: its name, the weekdays, and a box per day with its events, multi-day bars, trash day and
// holidays. Same layout as the board (1252 x 642 board pixels), so art drawn on a day stays on that day.
import type { ReactNode } from 'react';
import { readable } from './color.ts';

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
  ref?: { href: string; etag: string | null; rid?: string | null };
}
export interface MonthData {
  ym: string;
  today: string;
  grid: { start: string; weeks: number; y: number; m: number; weekStart?: number; time24?: boolean };
  events: BoardEvent[];
}
export interface Bins {
  day: number | null;
  recycle: { mode: string; day?: number; anchor?: string };
}

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

export const addDays = (ds: string, n: number) => {
  const [y, m, d] = ds.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
// how an event reads in a day box: holidays get their emoji, birthdays a cake
export function evText(ev: BoardEvent) {
  let t = ev.holiday ? `${ev.icon} ${ev.title}` : ev.title;
  if (!ev.holiday && /birthday|bday/i.test(t) && !t.includes('🎂')) t = '🎂 ' + t;
  return ev.allDay || ev.holiday ? t : `${t} @ ${ev.time}`;
}
// which bins go out on a date (as the server works it out)
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
const Ring = ({ color }: { color: string }) => (
  <svg className="ring" viewBox="0 0 46 42" aria-hidden="true">
    <ellipse
      cx="23"
      cy="21"
      rx="19"
      ry="16.5"
      fill="none"
      stroke={color}
      strokeWidth="2.4"
      transform="rotate(-6 23 21)"
    />
  </svg>
);

export function Month({
  data,
  bins,
  bg,
  onDay,
  onEvent,
  title
}: {
  data: MonthData;
  bins: Bins | null;
  bg: number;
  onDay?: (date: string) => void;
  onEvent?: (ev: BoardEvent) => void;
  title?: ReactNode;
}) {
  const g = data.grid;
  const ws = g.weekStart || 0;
  const cellH = GRID_H / g.weeks;
  const single = data.events.filter(e => e.start === e.end);
  const multi = data.events.filter(e => e.start !== e.end);
  const color = (e: BoardEvent) => (e.color || e.calColor ? readable((e.color || e.calColor)!, bg) : undefined);
  const weeks: ReactNode[] = [];
  for (let w = 0; w < g.weeks; w++) {
    const weekStart = addDays(g.start, w * 7);
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
          <span className="chalk" style={{ color: c }}>
            {e.title}
          </span>
        </div>
      );
    }
    const days: ReactNode[] = [];
    let ring: ReactNode = null;
    for (let d = 0; d < 7; d++) {
      const ds = addDays(weekStart, d);
      const inMonth = ds.slice(0, 7) === data.ym;
      if (ds === data.today)
        ring = (
          <div className="ringAt" style={{ left: `calc(${(((d + 1) / 7) * 100).toFixed(4)}% - 39px)` }}>
            <Ring color="var(--pink)" />
          </div>
        );
      const b = binsFor(ds, bins);
      const same = bins?.recycle?.mode === 'same';
      const lanesHere = dayLanes[d];
      const list = single.filter(e => e.start === ds);
      // room for events, in pixels: a normal line is 15px; Large / Extra large ones take more
      const room = cellH - 5 - 24 - lanesHere * 24 - 4;
      const need = (e: BoardEvent) => 15 * (e.size ? EV_SIZE[e.size] : 1) * (e.size && evText(e).length > 12 ? 2 : 1);
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
          className={'day' + (inMonth ? '' : ' other')}
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
          </div>
          {lanesHere > 0 && <div style={{ height: lanesHere * 24, flex: 'none' }} />}
          {list.slice(0, show).map((ev, i) => {
            const full = evText(ev);
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
                style={{ color: color(ev), fontSize: ev.size ? 13 * EV_SIZE[ev.size] : undefined }}
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
      <div className="titlerow">
        {title ?? (
          <h1 id="monthName">
            <span className="mn" data-text={MONTHS[g.m - 1]}>
              {MONTHS[g.m - 1]}
            </span>
            {g.y !== Number(data.today.slice(0, 4)) && <small>{g.y}</small>}
          </h1>
        )}
      </div>
      <div className="weekdays">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i}>{WEEKDAYS[(i + ws) % 7]}</div>
        ))}
      </div>
      <div id="grid" style={{ gridTemplateRows: `repeat(${g.weeks}, minmax(0, 1fr))` }}>
        {weeks}
      </div>
    </div>
  );
}
