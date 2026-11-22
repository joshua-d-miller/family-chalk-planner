/*
===============================================================================
 Family Chalk Planner | Screens | Board | Notes.tsx
===============================================================================
 Version:   1.2.1
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-07
 Updated:   2026-11-22

 Purpose:
     The right-hand column: up to 3 pages, chosen in ⚙️ Settings (weather,
     trash and countdowns; the meal plan; reward jars; up next; reminders;
     chores; timers; the pantry)

 Used by:
     web/src/board/Board.tsx
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

                                  The new screens take over: /, /edit and
                                  /chores are the React board; the old one
                                  stays at /classic.

 0.14.0    2026-11-07   joshua    Its pages open in place.
                        claude

 0.15.0    2026-11-08   joshua    The switch at the bottom (jars, today, up
                        claude    next, photos) is back.

                                  Each screen can pick its own bottom and what
                                  the switch flips to.

 1.1.0    2026-11-17   joshua    Countdowns in sleeps or days.
                        claude

 1.2.0    2026-11-21   colby     A tap on a reward jar opens it big: add a
                        joshua    piece, take one out, ★ Reward.
                        claude    Its pages can go under 🗓️ Week's Split View
                                  (Split.tsx), and the column can be just the
                                  weather and countdowns there. Its last row
                                  can hold the menu's buttons (Colby Way's
                                  dock).
                                  The family's events, pantry, reminders and
                                  timers stay in their own words in another
                                  language.

 1.2.1    2026-11-22   joshua    This screen's own pages on the month or
                        claude    the week.
===============================================================================
*/

import { useNotesCol } from '../lib/notesCol.ts';
import type { BoardNotes, Bottom } from '../lib/notesCol.ts';
import { navigate } from '../lib/nav.ts';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { ChoresView } from '../../../shared/chores.ts';
import type { Jar, Meals, PantryItem, RemindersView } from '../../../shared/lists.ts';
import { entries } from '../pages/Chores.tsx';
import { JarRow } from '../ui/JarArt.tsx';
import { useBigJar } from '../ui/JarZoom.tsx';
import { readable } from './color.ts';
import { addDays } from './Month.tsx';
import { frameFor, photoSrc, shuffleBag } from './photos.ts';
import type { Photo, Photos } from './photos.ts';
import { howLong, useCountdowns, useSleeps } from '../lib/countdowns.ts';
import { useLive } from '../lib/live.ts';
import { fmtLeft, left, useTimers } from '../lib/timers.ts';
import { fmtTime } from '../lib/today.ts';
import { isDone } from '../pages/Reminders.tsx';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------------- //
// | The weather | //
// --------------- //
const ICONS: Record<string, string> = {
  sun: '<circle cx="24" cy="24" r="9"/><path d="M24 5v6M24 37v6M5 24h6M37 24h6M10.5 10.5l4.2 4.2M33.3 33.3l4.2 4.2M10.5 37.5l4.2-4.2M33.3 14.7l4.2-4.2"/>',
  partly:
    '<circle cx="18" cy="18" r="7"/><path d="M18 4v4M4 18h4M8 8l3 3M28 8l-3 3"/><path d="M18 38h17a7 7 0 0 0 0-14 9 9 0 0 0-17 3 5.5 5.5 0 0 0 0 11z"/>',
  cloud: '<path d="M14 34h21a8 8 0 0 0 0-16 11 11 0 0 0-21 3 6.5 6.5 0 0 0 0 13z"/>',
  rain: '<path d="M14 28h21a8 8 0 0 0 0-16 11 11 0 0 0-21 3 6.5 6.5 0 0 0 0 13z"/><path d="M17 34l-2 5M25 34l-2 5M33 34l-2 5"/>',
  snow: '<path d="M14 28h21a8 8 0 0 0 0-16 11 11 0 0 0-21 3 6.5 6.5 0 0 0 0 13z"/><path d="M17 35v4M15 37h4M25 35v4M23 37h4M33 35v4M31 37h4"/>',
  storm: '<path d="M14 28h21a8 8 0 0 0 0-16 11 11 0 0 0-21 3 6.5 6.5 0 0 0 0 13z"/><path d="M25 30l-4 6h6l-4 6"/>',
  fog: '<path d="M8 18h32M6 25h36M10 32h28"/>'
};
const Wx = ({ kind, color }: { kind: string; color: string }) => (
  <svg
    width="34"
    height="34"
    viewBox="0 0 48 48"
    fill="none"
    stroke={color}
    strokeWidth="2.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    dangerouslySetInnerHTML={{ __html: ICONS[kind] || ICONS.cloud }}
  />
);

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------- //
// | Today and the weather | //
// ------------------------- //
interface Extras {
  weather: {
    now: { temp: number; kind: string };
    today: { hi: number; lo: number };
    tomorrow: { hi: number; lo: number; rain: number; kind: string };
  } | null;
  trash: { title: string; label: string; sub: string | null } | null;
  notes: BoardNotes;
}

function Info({ x }: { x: Extras }) {
  const cd = useCountdowns();
  const sleeps = useSleeps();
  const w = x.weather;
  return (
    <div className="npage info-page">
      {w && (
        <>
          <div className="info">
            <Wx kind={w.now.kind} color="#F2D479" />
            <div>
              <div className="lbl">Today</div>
              <div className="val" id="wNow" style={{ color: 'var(--yellow)' }}>
                {w.now.temp}° · {w.today.hi}/{w.today.lo}
              </div>
            </div>
          </div>
          <div className="info">
            <Wx kind={w.tomorrow.kind} color="#9CC9E6" />
            <div>
              <div className="lbl">Tomorrow{w.tomorrow.rain >= 40 ? ` · ${w.tomorrow.rain}% rain` : ''}</div>
              <div className="val" style={{ color: 'var(--blue)' }}>
                {w.tomorrow.hi}° / {w.tomorrow.lo}°
              </div>
            </div>
          </div>
        </>
      )}
      {x.trash && (
        <div className="info">
          <svg
            width="34"
            height="34"
            viewBox="0 0 48 48"
            fill="none"
            stroke="#A9D8A0"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M10 14h28M19 14V9h10v5M13 14l2.4 26h17.2L35 14M20.5 21v13M27.5 21v13" />
          </svg>
          <div>
            <div className="lbl">{x.trash.title}</div>
            <div className="val" style={{ color: 'var(--green)' }}>
              {x.trash.label}
            </div>
            {x.trash.sub && <div className="lbl">{x.trash.sub}</div>}
          </div>
        </div>
      )}
      {cd.map(c => (
        <div className="cd" key={c.title}>
          <span className="emoji">{c.icon}</span> <span className="ct">{c.title}</span>
          <b>{howLong(c.days, sleeps)}</b>
        </div>
      ))}
    </div>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------- //
// | The pages | //
// ------------- //
// Each page the right-hand column can show.                                 //
export function MealsPage() {
  const m = useLive<Meals>('api/meals', ['meals']);
  const items = (m.data?.items || []).slice(0, 20);
  const box = useRef<HTMLDivElement>(null);
  // Shrink the list a little until it fits the space it has; if it still can't, it ends with "+N more"
  // instead of running into the page below (as the board did before)
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => {
      const ul = el.querySelector('ul')!;
      const more = el.querySelector<HTMLElement>('.more')!;
      const lis = [...ul.querySelectorAll<HTMLElement>('li:not(.more)')];
      lis.forEach(li => (li.style.display = ''));
      more.style.display = 'none';
      el.style.setProperty('--mealsz', '17px');
      const room = el.clientHeight - el.querySelector<HTMLElement>('.mh')!.offsetHeight - 6;
      if (room <= 0 || !lis.length) return;
      for (let z = 16; ul.scrollHeight > room && z >= 14; z--) el.style.setProperty('--mealsz', z + 'px');
      if (ul.scrollHeight <= room) return;
      more.style.display = '';
      for (let i = lis.length - 1, n = 1; i > 0 && ul.scrollHeight > room; i--, n++) {
        lis[i].style.display = 'none';
        more.textContent = `+${n} more`;
      }
    };
    fit();
    // refitting changes the list's size, so it waits for the next frame (refitting inside the
    // ResizeObserver's own callback is what Chrome and Safari call a "ResizeObserver loop")
    let raf = 0;
    const later = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(fit);
    };
    const ro = new ResizeObserver(later);
    ro.observe(el);
    document.fonts?.addEventListener('loadingdone', later);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.fonts?.removeEventListener('loadingdone', later);
    };
  }, [items.map(it => it.id + (it.done ? '1' : '') + it.t + (it.day || '')).join('|')]);
  return (
    <div className="npage meals" ref={box}>
      <h3 className="mh">Meal Plan</h3>
      <ul>
        {items.map(it => (
          <li key={it.id} className={it.done ? 'done' : ''}>
            {it.day && <b className="mday">{it.day.slice(0, 1).toUpperCase() + it.day.slice(1)} </b>}
            {it.t}
          </li>
        ))}
        <li className="more" style={{ display: 'none' }} />
      </ul>
    </div>
  );
}
export function JarsPage({ onJar }: { onJar?: (jar: Jar, el: HTMLElement) => void }) {
  const j = useLive<Jar[]>('api/jars', ['jars']);
  if (!j.data) return null;
  if (!j.data.length) return <UpNext todayOnly />; // no jars: today's events, as the current board does
  return (
    <div className="npage">
      <h3 className="mh">Reward Jars</h3>
      <JarRow jars={j.data} onJarClick={onJar} />
    </div>
  );
}
const DOW3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// what's coming: the next two weeks under day headings, or just today. Lines that don't fit are left
// off whole, never cut in half.
export function UpNext({ todayOnly = false }: { todayOnly?: boolean }) {
  const u = useLive<{
    today: string;
    events: { date: string; title: string; time: string | null; color?: string | null; calColor?: string | null }[];
  }>('api/upnext', ['calendar']);
  const ref = useRef<HTMLUListElement>(null);
  const d = u.data;
  const rows: { k: string; cls: string; text: ReactNode; color?: string }[] = [];
  if (d) {
    let last = '';
    for (const e of d.events.filter(e => !todayOnly || e.date === d.today)) {
      if (!todayOnly && e.date !== last) {
        const dd = new Date(e.date + 'T12:00:00Z');
        rows.push({
          k: 'd' + e.date,
          cls: 'd',
          text:
            e.date === d.today
              ? 'Today'
              : e.date === addDays(d.today, 1)
                ? 'Tomorrow'
                : `${DOW3[dd.getUTCDay()]} ${dd.getUTCDate()}`
        });
      }
      last = e.date;
      const c = e.color || e.calColor;
      rows.push({
        k: 'e' + rows.length,
        cls: 'chalk',
        text: (
          <>
            {e.time && <span className="t">{e.time}</span>}
            <span translate="no">{e.title}</span>
          </>
        ),
        color: c ? readable(c, 0.0069) : undefined
      });
    }
  }
  useLayoutEffect(() => {
    const ul = ref.current;
    if (!ul) return;
    const items = Array.from(ul.children) as HTMLElement[];
    items.forEach(li => (li.style.display = ''));
    let i = items.length - 1;
    for (; i > 0 && ul.scrollHeight > ul.clientHeight + 1; i--) items[i].style.display = 'none';
    if (items[i]?.classList.contains('d')) items[i].style.display = 'none'; // no day heading left on its own
  }, [d, todayOnly]);
  return (
    <div className="npage grow">
      <h3 className="mh">{todayOnly ? 'Today' : 'Up Next'}</h3>
      <ul className="upnext" ref={ref}>
        {rows.map(r => (
          <li key={r.k} className={r.cls} style={r.color ? { color: r.color } : undefined}>
            {r.text}
          </li>
        ))}
        {d && !rows.length && (
          <li className="none">{todayOnly ? 'Nothing else planned today' : 'Nothing in the next two weeks'}</li>
        )}
      </ul>
    </div>
  );
}
// a photo from the album, framed, changing every few minutes
function PhotoPage() {
  const ph = useLive<Photos>('api/photos', ['photos']).data;
  const [p, setP] = useState<Photo | null>(null);
  const next = useRef(shuffleBag<Photo>());
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = ph?.photos || [];
    setP(next.current(list));
    const t = setInterval(() => setP(next.current(list)), 3 * 60 * 1000);
    return () => clearInterval(t);
  }, [ph]);
  if (!ph?.photos.length) return null;
  const bw = box.current?.clientWidth || 180;
  const bh = box.current?.clientHeight || 140;
  return (
    <div className="npage grow">
      <div className="bphoto" ref={box}>
        {p && <img alt="" src={photoSrc(p)} style={{ objectPosition: frameFor(p, bw, bh).pos }} />}
      </div>
    </div>
  );
}
// today's chores still to do, and who they're for
export function ChoresPage() {
  const v = useLive<ChoresView>('api/chores', ['chores']).data;
  if (!v) return null;
  const names = Object.fromEntries(v.people.map(p => [p.id, p.name]));
  const list = entries(v, 'day');
  const left = list.filter(e => e.done < e.c.times);
  return (
    <div className="npage grow">
      <h3 className="mh">Chores</h3>
      <ul className="upnext">
        {left.map((e, i) => (
          <li key={i} className="chalk">
            <span className="t">{e.who.map(id => names[id] || id).join(', ')}</span>
            {e.c.title}
          </li>
        ))}
        {!left.length && <li className="none">{list.length ? 'All done today! ⭐' : 'No chores today'}</li>}
      </ul>
    </div>
  );
}
// the pantry: what's been there longest, first
export function PantryPage() {
  const v = useLive<{ items: PantryItem[] }>('api/pantry', ['pantry']).data;
  if (!v) return null;
  const items = v.items.slice().sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div className="npage grow">
      <h3 className="mh">Pantry</h3>
      <ul className="upnext">
        {items.map(it => (
          <li key={it.id} className="chalk">
            {it.qty && <span className="t">{it.qty}</span>}
            <span translate="no">{it.name}</span>
          </li>
        ))}
        {!items.length && <li className="none">Nothing in the pantry list</li>}
      </ul>
    </div>
  );
}
export function RemindersPage({ time24 }: { time24: boolean }) {
  const r = useLive<RemindersView>('api/reminders', ['reminders']);
  const v = r.data;
  return (
    <div className="npage">
      <h3 className="mh">Reminders</h3>
      <ul className="nlist">
        {(v?.items || [])
          .filter(x => !isDone(x, v!.today))
          .slice(0, 6)
          .map(x => (
            <li key={x.id}>
              {x.important && '❗ '}
              <span translate="no">{x.title}</span>
              {x.mode === 'time' && <span className="dim"> {fmtTime(x.time, time24)}</span>}
            </li>
          ))}
      </ul>
    </div>
  );
}
function TimersPage() {
  const { timers, now } = useTimers();
  return (
    <div className="npage">
      <h3 className="mh">Timers</h3>
      <ul className="nlist">
        {timers.map(t => (
          <li key={t.id}>
            <span translate="no">{t.name}</span> <b>{t.state === 'done' ? 'Done!' : fmtLeft(left(t, now))}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------- //
// | The right-hand column | //
// ------------------------- //
// On a tablet, a page opens its own screen to change it                     //
const OPENS: Record<string, string> = {
  meals: 'meals',
  jars: 'jars',
  reminders: 'reminders',
  timers: 'timers',
  pantry: 'pantry',
  chores: 'chores'
};
// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------------------------- //
// | The switch at the bottom of the column | //
// ------------------------------------------- //
// The last page, when it's jars, today, up next or photos, has a little     //
// switch beside its heading (tap, or swipe across it) to show one of the    //
// others for a while; it goes back to the chosen one after 3 minutes, as    //
// the board before 0.13 did.                                                //
const SWITCH: [string, string, string][] = [
  ['jars', '🫙', 'Reward jars'],
  ['today', '☀️', 'Today'],
  ['upnext', '📅', 'Up next'],
  ['photos', '📷', 'Photos']
];
function useSwitch(def: string, others: string[], can: string[] | null) {
  const jars = useLive<Jar[]>('api/jars', ['jars']).data;
  const ph = useLive<Photos>('api/photos', ['photos']).data;
  // no jars yet: the jars page shows today instead, so the switch says Today
  if (def === 'jars' && jars && !jars.length) def = 'today';
  const modes = SWITCH.filter(
    ([m]) =>
      !others.includes(m) &&
      (!can || can.includes(m) || m === def) &&
      (m !== 'jars' || !!jars?.length) &&
      (m !== 'photos' || !!ph?.photos.length)
  );
  const [view, setView] = useState<string | null>(null);
  const back = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => clearTimeout(back.current!), []);
  const show = (m: string) => {
    clearTimeout(back.current!);
    setView(m === def ? null : m);
    if (m !== def) back.current = setTimeout(() => setView(null), 3 * 60 * 1000);
  };
  const cur = view && modes.some(([m]) => m === view) ? view : def;
  return { modes: modes.length > 1 && modes.some(([m]) => m === def) ? modes : [], cur, show };
}
function Switch({ sw }: { sw: ReturnType<typeof useSwitch> }) {
  // taps here are the switch's own: not a tap on the board (edit, double tap, swipe to chores)
  const mine = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <div className="bslide" role="tablist" aria-label="Show here" onClick={mine} onPointerUp={mine}>
      {sw.modes.map(([m, icon, label]) => (
        <button
          type="button"
          key={m}
          role="tab"
          className={m === sw.cur ? 'on' : ''}
          aria-selected={m === sw.cur}
          aria-label={label}
          title={label}
          onClick={() => sw.show(m)}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}

export function Notes({
  time24,
  edit = false,
  drawing = false,
  only,
  view = 'month',
  dockRef
}: {
  time24: boolean;
  edit?: boolean;
  drawing?: boolean; // (a tap on a jar while drawing is drawing, not the big jar)
  only?: string[]; // these pages and no switch (Split View: the weather, trash and countdowns)
  view?: 'month' | 'week'; // which view's pages it shows
  dockRef?: (el: HTMLDivElement | null) => void; // the menu in the Notes column: its last row, for the buttons
}) {
  const x = useLive<Extras>('api/extras', ['extras']).data;
  // this screen's own column for this view (if it set one), else the board's
  const col = useNotesCol(view);
  const pages = only || col.pages;
  // the bottom's switch: this view's own column has its own; else this screen's (if it set one), else the board's
  const screenBottom = useLive<{ bottom: Bottom | null }>('api/notesbottom', ['notesbottom']).data?.bottom;
  const mine = col.own ? col.bottom : screenBottom;
  const last = (!only && mine?.def) || pages[pages.length - 1];
  const sw = useSwitch(
    !only && SWITCH.some(([m]) => m === last) ? last : '',
    pages.slice(0, -1),
    only ? [] : mine?.can || null
  );
  const swipe = useRef<number | null>(null);
  // ------------------- //
  // | The big jar | //
  // ------------------- //
  // On a screen that edits, a tap on a jar opens it big: add a piece, take  //
  // one out, ★ Reward when it's full. From Colby Way's board.               //
  const { onJar, big } = useBigJar(edit && !drawing);
  return (
    <>
      <aside className="notes">
        <h2 className="chalk">Notes</h2>
        {x &&
          pages.map((p0, i) => {
            const switching = i === pages.length - 1 && sw.modes.length > 0;
            const p = switching ? sw.cur : i === pages.length - 1 ? last : p0;
            // (on a screen that edits, a tap on a jar opens the big jar instead of the Jars page)
            const opens = edit && !!OPENS[p] && p !== 'jars';
            return (
              <div
                key={p0}
                className={'nslot nslot-' + p + (opens ? ' opens' : '') + (switching ? ' hasswitch' : '')}
                style={switching ? ({ '--swn': sw.modes.length } as React.CSSProperties) : undefined}
                role={opens ? 'link' : undefined}
                onClick={opens ? () => navigate(OPENS[p]) : undefined}
                onPointerDown={switching ? e => (swipe.current = e.isPrimary ? e.clientX : null) : undefined}
                onPointerUp={
                  switching
                    ? e => {
                        const s0 = swipe.current;
                        swipe.current = null;
                        if (s0 === null || Math.abs(e.clientX - s0) < 50) return;
                        e.stopPropagation(); // the switch's swipe, not the board's
                        const i = sw.modes.findIndex(([m]) => m === sw.cur);
                        const n = sw.modes.length;
                        sw.show(sw.modes[(i + (e.clientX < s0 ? 1 : n - 1)) % n][0]);
                      }
                    : undefined
                }
              >
                {i > 0 && <div className="rule" />}
                {switching && <Switch sw={sw} />}
                {p === 'info' && <Info x={x} />}
                {p === 'meals' && <MealsPage />}
                {p === 'jars' && <JarsPage onJar={onJar} />}
                {p === 'upnext' && <UpNext />}
                {p === 'today' && <UpNext todayOnly />}
                {p === 'photos' && <PhotoPage />}
                {p === 'chores' && <ChoresPage />}
                {p === 'pantry' && <PantryPage />}
                {p === 'reminders' && <RemindersPage time24={time24} />}
                {p === 'timers' && <TimersPage />}
              </div>
            );
          })}
        {/* the menu in the Notes column: the ☰ and this screen's buttons go in this row (Colby Way's dock) */}
        {dockRef && <div className="ndock" ref={dockRef} />}
      </aside>
      {big}
    </>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
