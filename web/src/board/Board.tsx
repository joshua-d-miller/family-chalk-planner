/*
===============================================================================
 Family Chalk Planner | Screens | Board | Board.tsx
===============================================================================
 Version:   0.14.1
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-07
 Updated:   2026-11-08

 Purpose:
     The board: the month, the art on it, and the right-hand column, on
     the board's surface. It's laid out at 1252 x 642 board pixels and
     scaled to fill the screen. Text and art are vector, so they're sharp
     at any size; the surface texture is painted at the screen's real
     resolution (4K included).

 How it fits:
     The same board is the wall (/), a tablet (/edit) and a family screen.
     The wall only shows; a tablet changes everything; a family screen (a
     shared touch screen in the kitchen) adds events and decorates. The
     month grid, the right-hand column, the art and the editing cards are
     drawn by the files beside this one; this one holds them together.

 Used by:
     web/src/App.tsx
     web/src/board/editors/BorderEditor.tsx
     web/src/board/editors/PhotosEditor.tsx
     web/src/board/editors/TitleEditor.tsx
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

                                  ... and 2 more (the board rebuilt in React
                                  and TypeScript)

 0.14.0    2026-11-07   joshua    Every button on the bar has an icon and a
                        claude    word.

                                  Fits above the tab bar; + Add event on its
                                  own; a swipe to chores in place.

 0.14.1    2026-11-08   joshua    Tells the pages how big its cork is.
                        claude
===============================================================================
*/

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { useLive, useOnline } from '../lib/live.ts';
import { paintSurface, seasonOf, surfaceOf } from '../lib/surface.ts';
import type { Who } from '../lib/who.ts';
import { Art } from './Art.tsx';
import type { ArtItem } from './Art.tsx';
import { MONTHS, Month } from './Month.tsx';
import type { Bins, Border, MonthData } from './Month.tsx';
import type { Photos } from './photos.ts';
import { DEFAULT_TITLE, Title } from './Title.tsx';
import type { TitleStyle } from './Title.tsx';
import { TitlePhotos, titlePool } from './TitlePhotos.tsx';
import type { Side } from './TitlePhotos.tsx';
import { DayView, ReminderAlert, TimerDone } from './Alerts.tsx';
import { Notes } from './Notes.tsx';
import { WeatherMotion } from './Weather.tsx';
import { Slideshow, useSlides } from './Slideshow.tsx';
import { EventEditor } from './EventEditor.tsx';
import { BorderEditor } from './editors/BorderEditor.tsx';
import { StyleEditor } from './editors/StyleEditor.tsx';
import { TitleEditor } from './editors/TitleEditor.tsx';
import { PhotosEditor } from './editors/PhotosEditor.tsx';
import type { TitleDraft } from './editors/TitleEditor.tsx';
import type { BoardEvent } from './Month.tsx';
import { Strip } from './Strip.tsx';
import { navigate } from '../lib/nav.ts';
import { useShell } from '../ui/Shell.tsx';
import { DrawLayer, firstPen, isPosca, recolor, touches } from './draw/Draw.tsx';
import type { Pen } from './draw/Draw.tsx';
import { Library } from './draw/Library.tsx';
import type { Stamp } from './draw/Library.tsx';
import { RecolorSheet, SaveStampSheet, TextSheet, Tools } from './draw/Tools.tsx';
import { useArt } from './draw/useArt.ts';
import { BORDER_PAD, relayout, unionBox, xform } from './geom.ts';
import { post } from '../lib/api.ts';
import { CLIENT } from './draw/useArt.ts';
import { RANK } from '../lib/who.ts';
import type { ArtItem as Item } from './Art.tsx';
import { themeCss, themeVals } from './theme.ts';
import type { Theme } from './theme.ts';
import './board.css';
import './edit.css';

const W = 1252;
const H = 642;
const CORK = 50; // the strip under the board on a tablet
const EDIT_FRAME = 14; // a tablet's board has a wooden frame unless the family set one

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------------- //
// | A month's settings | //
// ---------------------- //
export type MonthMeta = {
  hideTitle?: boolean;
  title?: TitleStyle;
  defaultTitle?: TitleStyle;
  side?: Side;
  border?: Border;
  borderYearly?: boolean;
  artPad: number;
  boardPad?: number;
};

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------------------------------- //
// | Fitting the board to the screen | //
// ----------------------------------- //
// The board is always 1252 by 642, scaled to fit; a tablet adds the cork    //
// strip and the wooden frame around it.                                     //
function useFit(pad: number, h: number, below = 0) {
  // below: the tab bar's height on a phone or tablet (the board fits above it)
  const calc = () => {
    const scale = Math.min(innerWidth / (W + 2 * pad), (innerHeight - below) / (h + 2 * pad));
    return { scale, res: Math.max(1, Math.min(4, Math.round(scale * (devicePixelRatio || 1) * 2) / 2)) };
  };
  const [fit, setFit] = useState(calc);
  useEffect(() => {
    const on = () => setFit(calc());
    on();
    addEventListener('resize', on);
    return () => removeEventListener('resize', on);
  }, [pad, h, below]);
  return fit;
}

const addMonths = (ym: string, n: number) => {
  const d = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------ //
// | What is being edited | //
// ------------------------ //
type Editing =
  | { k: 'event'; ev: BoardEvent | null; date: string }
  | { k: 'title' }
  | { k: 'border' }
  | { k: 'style' }
  | { k: 'text'; item: Item | null; at: [number, number] }
  | { k: 'recolor' }
  | { k: 'library' }
  | { k: 'stamp' }
  | { k: 'photos' }
  | null;

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------- //
// | The board | //
// ------------- //
export function Board({ who, edit = false }: { who: Who | null; edit?: boolean }) {
  // --------------------------------- //
  // | Wall, tablet or family screen | //
  // --------------------------------- //
  // A family screen (a shared touch screen in the kitchen): decorates and   //
  // adds events, frameless, with the wall's photo frame and slideshow; the  //
  // month's title and the board's look are set from a tablet                //
  const family = edit && !who?.user && who?.device?.role === 'family';
  const today = useLive<{ ym: string; time24: boolean }>('api/today', ['calendar']).data;
  const [ym, setYm] = useState<string | null>(null);
  const shown = ym || today?.ym || null;
  const month = useLive<MonthData>(shown ? `api/month?ym=${shown}` : 'api/today', ['calendar']);
  const art = useLive<ArtItem[]>(shown ? `api/art?ym=${shown}` : 'api/today', [
    'stroke',
    'remove',
    'update',
    'undo',
    'clear',
    'restore',
    'meta'
  ]);
  const metaLive = useLive<MonthMeta>(shown ? `api/meta?ym=${shown}` : 'api/today', ['meta']);
  const meta = metaLive.data;
  const photos = useLive<Photos>('api/photos', ['photos']).data;
  const pad =
    meta && 'artPad' in meta ? (meta.boardPad ?? (edit && !family ? EDIT_FRAME : 0)) : edit && !family ? EDIT_FRAME : 0;
  const bh = H + (edit ? CORK : 0);
  const shell = useShell();
  const fit = useFit(pad, bh, shell.navH);
  // the pages' cork is drawn the same size as this one
  const { kind: shellKind, setCorkZ } = shell;
  useEffect(() => {
    if (edit && shellKind === 'cork') setCorkZ(fit.scale);
  }, [edit, shellKind, setCorkZ, fit.scale]);
  // ---------------------- //
  // | Zooming in to draw | //
  // ---------------------- //
  // A tablet zooms in to draw: pinch, or the − / + / Fit buttons            //
  const [zoom, setZoom] = useState({ z: 1, x: 0, y: 0 });
  const scale = fit.scale * zoom.z;
  // the surface and chalk grain are painted for the zoom once it settles (not on every step of a pinch)
  const [settled, setSettled] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => setSettled(zoom.z), 300);
    return () => clearTimeout(t);
  }, [zoom.z]);
  const res = Math.max(1, Math.min(4, Math.round(fit.scale * settled * (devicePixelRatio || 1) * 2) / 2));
  const zoomTo = (z: number, at?: [number, number]) =>
    setZoom(cur => {
      const z1 = Math.max(1, Math.min(4, z));
      if (z1 === 1) return { z: 1, x: 0, y: 0 };
      const [mx, my] = at || [0, 0]; // about this point, from the middle of the screen
      const k = z1 / cur.z;
      const lim = (v: number, size: number) => Math.max(-size, Math.min(size, v));
      return {
        z: z1,
        x: lim(mx - (mx - cur.x) * k, (fit.scale * z1 * (W + 2 * pad)) / 2),
        y: lim(my - (my - cur.y) * k, (fit.scale * z1 * (bh + 2 * pad)) / 2)
      };
    });
  const pinch = useRef<{ d: number; z: number; mx: number; my: number; x: number; y: number } | null>(null);
  const pts = useRef(new Map<number, [number, number]>());
  const pinchMove = () => {
    const p = [...pts.current.values()];
    if (p.length < 2 || !pinch.current) return;
    const d = Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]);
    const mx = (p[0][0] + p[1][0]) / 2 - innerWidth / 2;
    const my = (p[0][1] + p[1][1]) / 2 - innerHeight / 2;
    const s0 = pinch.current;
    const z1 = Math.max(1, Math.min(4, (s0.z * d) / s0.d));
    if (z1 === 1) return setZoom({ z: 1, x: 0, y: 0 });
    const k = z1 / s0.z;
    setZoom({ z: z1, x: mx - (s0.mx - s0.x) * k, y: my - (s0.my - s0.y) * k });
  };
  const touchHandlers = edit
    ? {
        onPointerDownCapture: (e: PointerEvent) => {
          if (e.pointerType !== 'touch') return;
          touches.add(e.pointerId);
          pts.current.set(e.pointerId, [e.clientX, e.clientY]);
          if (pts.current.size === 2) {
            const p = [...pts.current.values()];
            pinch.current = {
              d: Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]) || 1,
              z: zoom.z,
              mx: (p[0][0] + p[1][0]) / 2 - innerWidth / 2,
              my: (p[0][1] + p[1][1]) / 2 - innerHeight / 2,
              x: zoom.x,
              y: zoom.y
            };
          }
        },
        onPointerMoveCapture: (e: PointerEvent) => {
          if (e.pointerType !== 'touch' || !pts.current.has(e.pointerId)) return;
          pts.current.set(e.pointerId, [e.clientX, e.clientY]);
          if (pinch.current) pinchMove();
        },
        onPointerUpCapture: (e: PointerEvent) => {
          touches.delete(e.pointerId);
          pts.current.delete(e.pointerId);
          if (pts.current.size < 2) pinch.current = null;
        },
        onPointerCancelCapture: (e: PointerEvent) => {
          touches.delete(e.pointerId);
          pts.current.delete(e.pointerId);
          if (pts.current.size < 2) pinch.current = null;
        }
      }
    : {};
  const extras = useLive<{ bins: Bins }>('api/extras', ['extras']).data;
  const savedTheme = useLive<Theme>('api/theme', ['theme']).data;
  const [themeDraft, setThemeDraft] = useState<Theme | null>(null);
  const theme = themeDraft || savedTheme;
  // ------------- //
  // | The cards | //
  // ------------- //
  // One card is open at a time; the drafts show on the board while it is    //
  // open, and are saved (or thrown away) when it closes.                    //
  const [editing, setEditing] = useState<Editing>(null);
  const [titleDraft, setTitleDraft] = useState<TitleDraft | null>(null);
  const [borderDraft, setBorderDraft] = useState<Border | null | undefined>(undefined);
  const sf = surfaceOf(theme?.s || 'slate');
  const season = theme?.z && shown ? seasonOf(+shown.slice(5, 7), false) : '';
  const bg = useMemo(() => {
    try {
      return paintSurface(sf, season, res);
    } catch {
      return 'none';
    }
  }, [sf, season, res]);
  useEffect(() => {
    document.body.classList.add('boardpage');
    return () => document.body.classList.remove('boardpage');
  }, []);
  // the wall follows the current month; a tablet goes back to it after 3 minutes untouched
  useEffect(() => {
    if (!edit && today && ym && ym !== today.ym) setYm(null);
  }, [today, ym, edit]);
  const [touched, setTouched] = useState(0);
  useEffect(() => {
    if (!edit || !ym || editing) return;
    const t = setTimeout(() => setYm(null), 3 * 60 * 1000);
    return () => clearTimeout(t);
  }, [edit, ym, touched, editing]);

  const tv = useMemo(() => themeVals(theme), [theme]);
  const css = useMemo(() => themeCss(tv, sf.lum), [tv, sf.lum]);
  const m = month.data && 'grid' in month.data ? month.data : null;
  const slides = useSlides(photos, !edit || family);
  const [day, setDay] = useState<string | null>(null);
  const closeDay = useCallback(() => setDay(null), []);
  // ----------------------- //
  // | Tapping and swiping | //
  // ----------------------- //
  // On the wall: tap a day = everything on it; double tap = the photo frame //
  // (during a night-time peek, back to the slideshow)                       //
  const lastTap = useRef(0);
  const single = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDouble = useRef(0);
  // a swipe across the board (not while drawing) goes to the chores, as on the current board
  const swipe = useRef<[number, number] | null>(null);
  const tap = (e: PointerEvent) => {
    setTouched(Date.now());
    const s0 = swipe.current;
    swipe.current = null;
    if (s0 && !drawing && !editing && !day && !slides.on) {
      const dx = e.clientX - s0[0];
      const dy = e.clientY - s0[1];
      if (Math.abs(dx) > 120 && Math.abs(dy) < Math.abs(dx) / 2) {
        try {
          sessionStorage.setItem('chalkFromBoard', edit ? 'edit' : './');
        } catch {
          /* fine: no way back but the menu */
        }
        navigate('chores');
        return;
      }
    }
    if (family) {
      // double tap = the photo frame, like the wall; a single tap still edits (after a short wait).
      // Only taps on the board itself: not the strip, the zoom or a card.
      if (!(e.target as Element).closest?.('.slate')) return void (lastTap.current = 0);
      if (drawing || slides.on || slides.justChanged()) return void (lastTap.current = 0);
      if (e.timeStamp - lastTap.current < 450) {
        lastTap.current = 0;
        if (single.current) clearTimeout(single.current);
        lastDouble.current = Date.now();
        slides.doubleTap();
      } else lastTap.current = e.timeStamp;
      return;
    }
    if (edit) return;
    if (day) return (setDay(null), void (lastTap.current = 0));
    if (slides.on || slides.justChanged()) return void (lastTap.current = 0);
    if (single.current) clearTimeout(single.current);
    if (e.timeStamp - lastTap.current < 450) {
      lastTap.current = 0;
      slides.doubleTap();
      return;
    }
    lastTap.current = e.timeStamp;
    const wk = (e.target as Element).closest?.('.week');
    if (!wk) return;
    const r = wk.getBoundingClientRect();
    const cells = wk.querySelectorAll<HTMLElement>('.day');
    const ds = cells[Math.floor(((e.clientX - r.left) / r.width) * 7)]?.dataset.date;
    if (ds) single.current = setTimeout(() => setDay(ds), 460); // wait: it might be a double tap
  };
  const mm = meta && 'artPad' in meta ? meta : null;
  const ed = useArt(shown, art);
  // ----------- //
  // | Drawing | //
  // ----------- //
  // The pen, what is picked, and a stamp being placed.                      //
  const [drawing, setDrawing] = useState(false);
  const [pen, setPen] = useState<Pen>(firstPen);
  const [selection, setSelection] = useState<number[]>([]);
  const [hidden, setHidden] = useState<number[]>([]);
  const [placing, setPlacing] = useState<{ st: Stamp; k: number } | null>(null);
  const [note, setNote] = useState('');
  useEffect(() => {
    setSelection([]);
    setPlacing(null);
  }, [shown, drawing]);
  useEffect(() => {
    document.body.classList.toggle('drawing', drawing);
  }, [drawing]);
  useEffect(() => {
    const b = document.body.classList;
    b.toggle('display', !edit);
    b.toggle('edit', edit);
    b.toggle('family', family);
  }, [edit, family]);
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(''), 3500);
    return () => clearTimeout(t);
  }, [note]);
  // ----------------------- //
  // | Art on a new layout | //
  // ----------------------- //
  // The art was placed on the layout the month had then (artPad); shown on  //
  // the layout it has now                                                   //
  const realPad = mm?.border ? BORDER_PAD[mm.border.size] || BORDER_PAD.m : 0;
  const shownPad =
    borderDraft !== undefined ? (borderDraft ? BORDER_PAD[borderDraft.size] || BORDER_PAD.m : 0) : realPad;
  const placed = mm?.artPad || 0;
  const laidOut = useMemo(() => relayout(ed.items, placed, shownPad), [ed.items, placed, shownPad]);
  // a tablet saves the move once, for everyone (not while a border is still being picked)
  const moving = useRef('');
  useEffect(() => {
    if (!edit || !shown || !mm || borderDraft !== undefined || placed === realPad || (who?.rank || 0) < RANK.family)
      return;
    if (!art.data || moving.current === `${shown}:${placed}:${realPad}`) return;
    moving.current = `${shown}:${placed}:${realPad}`;
    const moved = relayout(
      ed.items.filter(x => x.id >= 0),
      placed,
      realPad
    );
    post('api/art/relayout', { ym: shown, padFrom: placed, padTo: realPad, items: moved, from: CLIENT })
      .then(() => {
        // both at once, so the art isn't moved twice on screen
        art.set(relayout(ed.items, placed, realPad));
        metaLive.set({ ...mm, artPad: realPad });
      })
      .catch(() => {
        metaLive.reload();
        art.reload();
      });
  }, [edit, shown, mm, borderDraft, placed, realPad, who, art, ed.items, metaLive]);
  const base = placed === shownPad ? ed.items : laidOut;
  const items = hidden.length ? base.filter(x => !hidden.includes(x.id)) : base;
  const selItems = ed.items.filter(x => selection.includes(x.id));
  const place = async (at: [number, number]) => {
    if (!placing) return;
    const b = unionBox(placing.st.items) || { x1: 0, y1: 0, x2: 0, y2: 0 };
    const cx = (b.x1 + b.x2) / 2;
    const cy = (b.y1 + b.y2) / 2;
    const list = placing.st.items.map(it => {
      const o = xform(it, at[0] - cx, at[1] - cy, placing.k, cx, cy);
      delete (o as Partial<Item>).g;
      return o;
    });
    setPlacing(null);
    const ids = await ed.addMany(list);
    setPen(p => ({ ...p, tool: 'select' }));
    setSelection(ids);
  };
  const titleStyle = titleDraft?.style || mm?.title || mm?.defaultTitle || DEFAULT_TITLE;
  const hand = titleDraft ? titleDraft.hand : !!mm?.hideTitle;
  const border = borderDraft !== undefined ? borderDraft : mm?.border || null;
  const go = (n: number) => shown && setYm(addMonths(shown, n));
  // ----------------------- //
  // | Tapping on a tablet | //
  // ----------------------- //
  // A tablet: a day = everything on it (to change or add); an event =       //
  // change it. A family screen waits a moment first: it might be a double   //
  // tap.                                                                    //
  const soon = (f: () => void) => {
    if (!family) return f();
    if (single.current) clearTimeout(single.current);
    if (Date.now() - lastDouble.current < 500) return; // the second tap of a double tap
    single.current = setTimeout(f, 460);
  };
  const onDay = edit
    ? (ds: string) =>
        soon(() =>
          m?.events.some(x => x.start <= ds && x.end >= ds)
            ? setDay(ds)
            : setEditing({ k: 'event', ev: null, date: ds })
        )
    : undefined;
  const onEvent = edit
    ? (ev: BoardEvent) =>
        soon(() => (ev.ref && !ev.readOnly ? setEditing({ k: 'event', ev, date: ev.start }) : setDay(ev.start)))
    : undefined;
  const closeEditor = useCallback(() => setEditing(null), []);
  const saved = useCallback(
    (dates: string[]) => {
      setEditing(null);
      const other = dates.find(d => d && d.slice(0, 7) !== shown);
      if (other && !dates.some(d => d?.slice(0, 7) === shown)) setYm(other.slice(0, 7));
      month.reload();
    },
    [shown, month]
  );
  const photosOn = mm?.side ? mm.side.mode === 'photos' : !!photos?.cfg?.frame;
  const pool = photos?.photos && photosOn ? titlePool(photos.photos, mm?.side) : [];
  const monthName = m ? MONTHS[m.grid.m - 1] : '';
  // -------------------- //
  // | The board, drawn | //
  // -------------------- //
  return (
    // one continuous surface across the whole screen, so the bands beside the board match it
    <div
      id="stage"
      className={(sf.lum > 0.18 ? 'light' : '') + (pad ? ' framed' : '')}
      style={{ ...(pad ? {} : { backgroundImage: bg }), bottom: shell.navH || undefined }}
      onPointerDown={e => (swipe.current = e.isPrimary ? [e.clientX, e.clientY] : null)}
      onPointerUp={tap}
      {...touchHandlers}
    >
      <div
        id="board"
        className={edit ? 'edit' : ''}
        style={{
          transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${scale})`,
          padding: pad,
          width: W + 2 * pad,
          height: bh + 2 * pad,
          background: pad ? sf.frame || 'var(--wood)' : undefined
        }}
      >
        <div className="slate" id="slate" data-surface={sf.id} style={pad ? { backgroundImage: bg } : undefined}>
          <style>{css}</style>
          {m && (
            <Month
              data={m}
              bins={extras?.bins || null}
              bg={sf.lum}
              today={{ shape: tv.todayS, color: tv.todayC }}
              border={border}
              onDay={onDay}
              onEvent={onEvent}
              nav={edit ? { prev: () => go(-1), next: () => go(1) } : undefined}
              title={
                <Title
                  text={monthName}
                  year={m.grid.y !== Number(m.today.slice(0, 4)) ? m.grid.y : undefined}
                  style={titleStyle}
                  hand={hand}
                  dashed={edit}
                  bg={sf.lum}
                />
              }
            />
          )}
          {m && (
            <TitlePhotos
              pool={pool}
              art={items}
              layoutKey={`${monthName}|${JSON.stringify(titleStyle)}|${border?.size || ''}`}
            />
          )}
          <Notes time24={!!today?.time24} edit={edit} />
          <WeatherMotion wall={!edit} />
          <Art items={items} bg={sf.lum} res={res} gifsPlay />
          {edit && drawing && (
            <DrawLayer
              art={ed}
              pen={pen}
              bg={sf.lum}
              res={res}
              selection={selection}
              setSelection={setSelection}
              onText={(item, at) => setEditing({ k: 'text', item, at })}
              onRecolor={() => setEditing({ k: 'recolor' })}
              onSaveStamp={family ? undefined : () => setEditing({ k: 'stamp' })}
              placing={!!placing}
              onPlace={place}
              onHide={setHidden}
            />
          )}
          {(note || ed.err || placing) && (
            <div className="status" role="status">
              {placing ? `Tap the board where “${placing.st.name}” should go` : note || ed.err}
            </div>
          )}
        </div>
        {edit && (
          <Strip
            drawing={drawing}
            add={
              m && !drawing ? (
                <button
                  type="button"
                  className="pill addev"
                  id="addBtn"
                  onClick={() =>
                    setEditing({ k: 'event', ev: null, date: m.ym === m.today.slice(0, 7) ? m.today : m.ym + '-01' })
                  }
                >
                  + Add event
                </button>
              ) : undefined
            }
            tools={
              drawing ? (
                <Tools
                  family={family}
                  pen={pen}
                  setPen={setPen}
                  onUndo={ed.undo}
                  onRedo={ed.redo}
                  canUndo={ed.canUndo}
                  canRedo={ed.canRedo}
                  onStamps={() => setEditing({ k: 'library' })}
                  onClear={() => {
                    const all = ed.items.filter(x => x.id >= 0 && !x.e);
                    if (all.length && confirm(`Wipe all the art for ${monthName}? (Undo can bring it back.)`))
                      ed.remove(all);
                  }}
                />
              ) : undefined
            }
          >
            <button
              type="button"
              className={'pill' + (drawing ? ' on' : '')}
              id="drawBtn"
              onClick={() => {
                if (family && !drawing) setPen(p => ({ ...p, tool: 'select' }));
                setDrawing(d => !d);
              }}
            >
              <span className="ic" aria-hidden="true">
                ✏️
              </span>{' '}
              {drawing ? (family ? 'Done' : 'Done drawing') : family ? 'Decorate' : 'Draw'}
            </button>
            {m && !drawing && (
              <>
                {!family && (
                  <button type="button" className="pill" id="titleBtn" onClick={() => setEditing({ k: 'title' })}>
                    <span className="ic" aria-hidden="true">
                      🔤
                    </span>{' '}
                    Month title
                  </button>
                )}
                <button type="button" className="pill" id="borderBtn" onClick={() => setEditing({ k: 'border' })}>
                  <span className="ic" aria-hidden="true">
                    🖼️
                  </span>{' '}
                  Border
                </button>
                {!!photos?.photos.length && (
                  <button type="button" className="pill" id="photosBtn" onClick={() => setEditing({ k: 'photos' })}>
                    <span className="ic" aria-hidden="true">
                      📷
                    </span>{' '}
                    Photos
                  </button>
                )}
                <button type="button" className="pill" id="styleBtn" onClick={() => setEditing({ k: 'style' })}>
                  <span className="ic" aria-hidden="true">
                    🎨
                  </span>{' '}
                  Style
                </button>
              </>
            )}
          </Strip>
        )}
      </div>
      {(!edit || family) && photos && (
        <Slideshow photos={photos} on={slides.on} time24={!!today?.time24} onTap={slides.tapSlides} />
      )}
      <ReminderAlert time24={!!today?.time24} />
      <TimerDone />
      <Offline />
      {edit && !family && (
        <div className="zoom" aria-label="Zoom">
          <button type="button" aria-label="Zoom out" onClick={() => zoomTo(zoom.z / 1.25)} disabled={zoom.z <= 1}>
            −
          </button>
          <button type="button" aria-label="Zoom in" onClick={() => zoomTo(zoom.z * 1.25)} disabled={zoom.z >= 4}>
            +
          </button>
          <button type="button" className="fit" onClick={() => setZoom({ z: 1, x: 0, y: 0 })} disabled={zoom.z === 1}>
            Fit
          </button>
        </div>
      )}
      {day && m && (
        <DayView
          date={day}
          events={m.events}
          onClose={closeDay}
          onEvent={
            edit
              ? ev => {
                  setDay(null);
                  if (ev.ref && !ev.readOnly) setEditing({ k: 'event', ev, date: ev.start });
                }
              : undefined
          }
          onAdd={
            edit
              ? () => {
                  setDay(null);
                  setEditing({ k: 'event', ev: null, date: day });
                }
              : undefined
          }
        />
      )}
      {editing?.k === 'event' && m && (
        <EventEditor
          ev={editing.ev}
          date={editing.date}
          calendars={m.calendars || []}
          onClose={closeEditor}
          onSaved={saved}
        />
      )}
      {editing?.k === 'title' && m && shown && (
        <TitleEditor ym={shown} monthName={monthName} meta={mm} onPreview={setTitleDraft} onClose={closeEditor} />
      )}
      {editing?.k === 'border' && m && shown && (
        <BorderEditor ym={shown} monthName={monthName} meta={mm} onPreview={setBorderDraft} onClose={closeEditor} />
      )}
      {editing?.k === 'text' && (
        <TextSheet
          item={editing.item}
          color={pen.color[pen.medium]}
          onClose={closeEditor}
          onDelete={() => {
            if (editing.item) ed.remove([editing.item]);
            closeEditor();
          }}
          onSave={t => {
            const posca = isPosca(t.c);
            if (editing.item) {
              const after: Item = { ...editing.item, ...t };
              if (posca) after.m = true;
              else delete after.m;
              ed.update([editing.item], [after]);
            } else ed.add({ id: 0, k: 't', x: editing.at[0], y: editing.at[1], ...t, ...(posca ? { m: true } : {}) });
            closeEditor();
          }}
        />
      )}
      {editing?.k === 'recolor' && (
        <RecolorSheet
          onClose={closeEditor}
          onSave={(line, fill) => {
            ed.update(selItems, recolor(selItems, line, fill));
            closeEditor();
          }}
        />
      )}
      {editing?.k === 'library' && (
        <Library
          bg={sf.lum}
          onClose={closeEditor}
          onPick={(st, k) => {
            closeEditor();
            setPen(p => (p.tool === 'erase' || p.tool === 'text' ? { ...p, tool: 'select' } : p));
            setPlacing({ st, k });
          }}
        />
      )}
      {editing?.k === 'stamp' && (
        <SaveStampSheet
          items={selItems}
          bg={sf.lum}
          onClose={name => {
            closeEditor();
            if (name) setNote(`Saved “${name}” to Stamps`);
          }}
        />
      )}
      {editing?.k === 'photos' && shown && (
        <PhotosEditor ym={shown} monthName={monthName} meta={mm} photos={photos} onClose={closeEditor} />
      )}
      {editing?.k === 'style' && <StyleEditor theme={savedTheme} onPreview={setThemeDraft} onClose={closeEditor} />}
    </div>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------- //
// | Offline | //
// ----------- //
// Shown when the connection has been down for a while.                      //
function Offline() {
  const on = useOnline();
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (on) return setShow(false);
    const t = setTimeout(() => setShow(true), 8000);
    return () => clearTimeout(t);
  }, [on]);
  return show ? (
    <div className="offline" role="status">
      <span aria-hidden="true" />
      Offline - showing what it had
    </div>
  ) : null;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
