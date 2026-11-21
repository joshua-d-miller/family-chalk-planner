/*
===============================================================================
 Family Chalk Planner | Screens | Board | Board.tsx
===============================================================================
 Version:   1.2.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-07
 Updated:   2026-11-21

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

 0.14.2    2026-11-08   joshua    Fits into what's visible; tells the tab bar
                        claude    while drawing or zoomed in.

 0.15.0    2026-11-08   joshua    Week view (a button on the cork; on the wall,
                        claude    a tap on the month name).

                                  A week keeps its own drawings; 🗒️ Notes on
                                  the cork.

 0.15.1    2026-11-10   joshua    Says when the calendar can't be reached.
                        claude

                                  Art over events: she's asked once whether it
                                  hides them or sits behind the writing; art
                                  over the grid's leftover days hides their
                                  events by itself.

 0.16.0    2026-11-11   joshua    A month's own colors; the cake setting in the
                        claude    day view.

                                  Tells the pages where its cork is.

 0.16.1    2026-11-11   joshua    Draws a month in its own style when it has
                        claude    one.

 0.17.0    2026-11-12   joshua    A screen with the ☰ button instead of the
                        colby     cork: the board gets the cork's room, and
                        claude    never moves for the button or the drawing
                                  tools (they pop over beside it).

                                  ⭐ Pictures beside Draw / Decorate: straight
                                  to the pictures.

 1.1.0    2026-11-17   joshua    A photo of your own as the background
                        claude    (dimmed).
                                  What Apple or Google say, when the calendar
                                  can't be reached.

 1.1.2    2026-11-20   joshua    This month's own background, if it has one.
                        claude

 1.2.0    2026-11-21   joshua    🗓️ Week from today (today and the next 6
                        colby     days) on a screen that picks it, with the
                        claude    events of both months a week can span
                                  (Colby Way built it too, on his board).
                                  🗓️ Week's Split View (Colby Way's idea), and
                                  ⚙️ Week in its tools.
                                  From Colby Way's board: a tap on a reward
                                  jar opens it big; the − / + / Fit buttons
                                  can be hidden; a tap on the month's name
                                  reloads a screen that edits; the menu in the
                                  Notes column (his dock), and ▶ Slideshow
                                  from it on a tablet too.
                                  Two quick taps on a family screen's ‹ or ›
                                  no longer start the photo frame.
===============================================================================
*/

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { useLive, useOnline } from '../lib/live.ts';
import { useWeekFrom, useWeekView } from '../lib/weekFrom.ts';
import { showSettings } from '../pages/Settings.tsx';
import { Split } from './Split.tsx';
import { useHideZoom } from '../lib/zoomControls.ts';
import { useBoardFit } from '../lib/boardFit.ts';
import { paintSurface, photoBackground, seasonOf, surfaceOf } from '../lib/surface.ts';
import type { Who } from '../lib/who.ts';
import { Art } from './Art.tsx';
import type { ArtItem } from './Art.tsx';
import { MONTHS, Month, addDays, weekOf } from './Month.tsx';
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
import { NotesEditor } from './editors/NotesEditor.tsx';
import type { TitleDraft } from './editors/TitleEditor.tsx';
import type { BoardEvent } from './Month.tsx';
import { FAB_BAND, Strip } from './Strip.tsx';
import { navigate } from '../lib/nav.ts';
import { homeHref } from '../routes.ts';
import { useBarZoom, useShell, visibleHeight } from '../ui/Shell.tsx';
import { DrawLayer, firstPen, isPosca, recolor, touches } from './draw/Draw.tsx';
import type { Pen } from './draw/Draw.tsx';
import { Library } from './draw/Library.tsx';
import type { Stamp } from './draw/Library.tsx';
import { RecolorSheet, SaveStampSheet, TextSheet, Tools } from './draw/Tools.tsx';
import { useArt } from './draw/useArt.ts';
import { coveredBy, writingOn } from './cover.ts';
import type { Writing } from './cover.ts';
import { BORDER_PAD, SLATE_H, relayout, stretchY, unionBox, xform } from './geom.ts';
import { post, url as apiUrl } from '../lib/api.ts';
import { CLIENT } from './draw/useArt.ts';
import { RANK } from '../lib/who.ts';
import type { ArtItem as Item } from './Art.tsx';
import { monthVals, themeCss } from './theme.ts';
import type { Theme } from './theme.ts';
import './board.css';
import './edit.css';

const W = 1252;
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
  look?: Record<string, string>; // this month's own colors, over the board style's
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
    const scale = Math.min(innerWidth / (W + 2 * pad), (visibleHeight() - below) / (h + 2 * pad));
    return { scale, res: Math.max(1, Math.min(4, Math.round(scale * (devicePixelRatio || 1) * 2) / 2)) };
  };
  const [fit, setFit] = useState(calc);
  useEffect(() => {
    const on = () => setFit(calc());
    on();
    addEventListener('resize', on);
    window.visualViewport?.addEventListener('resize', on);
    return () => {
      removeEventListener('resize', on);
      window.visualViewport?.removeEventListener('resize', on);
    };
  }, [pad, h, below]);
  return fit;
}

// how tall the slate is drawn on this screen: 642, or (filling the screen) as tall as its shape allows
function useSlateH(fill: boolean, pad: number, below: number, bar: number) {
  const calc = () => {
    if (!fill) return SLATE_H;
    const tall = ((visibleHeight() - bar) / innerWidth) * (W + 2 * pad) - 2 * pad - below;
    return Math.round(Math.max(SLATE_H, Math.min(SLATE_H * 1.5, tall)));
  };
  const [h, setH] = useState(calc);
  useEffect(() => {
    const on = () => setH(calc());
    on();
    addEventListener('resize', on);
    window.visualViewport?.addEventListener('resize', on);
    return () => {
      removeEventListener('resize', on);
      window.visualViewport?.removeEventListener('resize', on);
    };
  }, [fill, pad, below, bar]);
  return h;
}

const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// '2026-12-03' as "Dec 3" (a bar across several days has no one day)
const dayName = (d: string) => (d ? `${MON3[+d.slice(5, 7) - 1]} ${+d.slice(8)}` : 'several days');

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
  | { k: 'notes' }
  | null;

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------- //
// | The board | //
// ------------- //
export function Board({
  who,
  edit = false,
  weekly = false
}: {
  who: Who | null;
  edit?: boolean;
  weekly?: boolean; // the Week page: one week at a time
}) {
  // --------------------------------- //
  // | Wall, tablet or family screen | //
  // --------------------------------- //
  // A family screen (a shared touch screen in the kitchen): decorates and   //
  // adds events, frameless, with the wall's photo frame and slideshow; the  //
  // month's title and the board's look are set from a tablet                //
  const family = edit && !who?.user && who?.device?.role === 'family';
  const hideZoom = useHideZoom(); // ⚙️ Settings → This screen: no − / + / Fit buttons
  const today = useLive<{ today: string; ym: string; weekStart?: number; time24: boolean }>('api/today', [
    'calendar'
  ]).data;
  const [ym, setYm] = useState<string | null>(null);
  // ------------------- //
  // | Month or a week | //
  // ------------------- //
  // 📅 Calendar shows the month; 🗓️ Week (its own page) one week: its      //
  // first day in wk (null is this week). A week belongs to the month of its //
  // middle day.                                                             //
  // A screen can start its week on today instead (today and the next 6     //
  // days); its arrows then go 7 days at a time from there.                  //
  const [wk, setWk] = useState<string | null>(null);
  const weekFrom = useWeekFrom();
  useEffect(() => setWk(null), [weekFrom]); // (a week picked before would start on the other day)
  const thisWeek = today?.today
    ? weekFrom === 'today'
      ? today.today
      : weekOf(today.today, today.weekStart || 0)
    : null;
  const week = weekly ? wk || thisWeek : null;
  // Split View (⚙️ Settings → Week): the week as a band, and one or two spaces under it
  const weekView = useWeekView();
  const split = !!week && weekView.split;
  const shown = week ? addDays(week, 3).slice(0, 7) : ym || today?.ym || null;
  const month = useLive<MonthData>(shown ? `api/month?ym=${shown}` : 'api/today', ['calendar']);
  // a week from today can reach past the days its month's grid has (Sun 28 Feb, when March starts on a
  // Sunday): the other month's events too
  const otherYm = week ? [week.slice(0, 7), addDays(week, 6).slice(0, 7)].find(x => x !== shown) || null : null;
  const other = useLive<MonthData>(otherYm ? `api/month?ym=${otherYm}` : 'api/today', ['calendar']);
  // the art: the month's, or in the week view the week's own (kept under its first day)
  const artKey = week || shown;
  const art = useLive<ArtItem[]>(artKey ? `api/art?ym=${artKey}` : 'api/today', [
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
  // the wooden frame: a tablet's, unless this screen leaves it off (🎨 Board style → Style: a screen in a
  // frame of its own); and whether the board fills the screen (⚙️ Settings → This screen)
  const boardFit = useBoardFit();
  const pad = boardFit.noFrame
    ? 0
    : meta && 'artPad' in meta
      ? (meta.boardPad ?? (edit && !family ? EDIT_FRAME : 0))
      : edit && !family
        ? EDIT_FRAME
        : 0;
  const shell = useShell();
  // ------------------------------- //
  // | The cork, or the ☰ button | //
  // ------------------------------- //
  // A screen that picked the ☰ button has no cork under the board, so the   //
  // board grows into its room, and never moves for the button or tools.    //
  const [drawing, setDrawing] = useState(false);
  const side = edit && shell.kind === 'cork' ? shell.side : null;
  const corkH = edit && !side ? CORK : 0;
  // ---------------------- //
  // | Filling the screen | //
  // ---------------------- //
  // The board is 1252 wide and 642 tall: on a screen that isn't as wide as  //
  // that (16:9, 16:10) it leaves bands above and below. Filling the screen  //
  // draws it taller instead (never shorter, at most half as tall again):    //
  // the days get taller, and art on them moves down with them.              //
  const slateH = useSlateH(boardFit.fill, pad, corkH, shell.navH);
  const bh = slateH + corkH;
  const barZ = useBarZoom();
  // the ☰ button floats over the board's bottom corner (the board keeps its size); on the right it's
  // over the bottom of the Notes column, whose list stops above it
  const fit = useFit(pad, bh, shell.navH);
  // the menu in the Notes column: the row its buttons go in (then nothing floats over the board)
  const [dockEl, setDockEl] = useState<HTMLElement | null>(null);
  const fabClear = (() => {
    if (side !== 'right' || drawing || shell.dock) return 0;
    const areaH = visibleHeight() - shell.navH;
    const boardBottom = (areaH + (bh + 2 * pad) * fit.scale) / 2; // the board is centred on the screen
    const overlap = boardBottom - (innerHeight - FAB_BAND * barZ);
    return overlap > 0 ? Math.ceil(overlap / fit.scale) : 0; // in board pixels
  })();
  // the pages' cork is drawn the same size as this one
  const { kind: shellKind, setCorkZ, setBusyBoard } = shell;
  // (and where it is: a board that doesn't fill the screen leaves its cork above the bottom or in from the sides,
  // and the pages' cork goes in exactly the same place, so moving between them only the middle changes)
  useLayoutEffect(() => {
    if (!edit || shellKind !== 'cork' || side) return;
    const tell = () => {
      const r = document.querySelector('#board > .cork, #board .cork:not(.corkbar)')?.getBoundingClientRect();
      setCorkZ(
        fit.scale,
        r && r.width
          ? {
              left: Math.round(r.left),
              width: Math.round(r.width),
              bottom: Math.max(0, Math.round(innerHeight - r.bottom))
            }
          : undefined
      );
    };
    tell();
    const t = setTimeout(tell, 300); // once the board has settled (fonts, the first layout)
    return () => clearTimeout(t);
  }, [edit, shellKind, side, setCorkZ, fit.scale]);
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
  const [lookDraft, setLookDraft] = useState<Record<string, string> | null>(null); // this month's colors, being picked
  const theme = themeDraft || savedTheme;
  // ------------- //
  // | The cards | //
  // ------------- //
  // One card is open at a time; the drafts show on the board while it is    //
  // open, and are saved (or thrown away) when it closes.                    //
  const [editing, setEditing] = useState<Editing>(null);
  const [titleDraft, setTitleDraft] = useState<TitleDraft | null>(null);
  const [borderDraft, setBorderDraft] = useState<Border | null | undefined>(undefined);
  // the background: this month's own, if it has one, else the board's
  const monthBg = (lookDraft || (meta && 'artPad' in meta ? meta.look : undefined)) as
    Record<string, string> | undefined;
  const bgOf = monthBg?.s ? { s: monthBg.s, img: monthBg.img } : { s: theme?.s, img: theme?.img };
  const sf = surfaceOf(bgOf.s || 'slate');
  const season = theme?.z && shown ? seasonOf(+shown.slice(5, 7), false) : '';
  const photoBg = sf.id === 'photo' && bgOf.img ? bgOf.img : null; // a photo of your own
  const bg = useMemo(() => {
    if (photoBg) return photoBackground(apiUrl(photoBg));
    try {
      return paintSurface(sf, season, res);
    } catch {
      return 'none';
    }
  }, [sf, season, res, photoBg]);
  useEffect(() => {
    document.body.classList.add('boardpage');
    return () => document.body.classList.remove('boardpage');
  }, []);
  // the wall follows the current month; a tablet goes back to it after 3 minutes untouched
  useEffect(() => {
    if (!edit && today && ym && ym !== today.ym) setYm(null);
    if (!edit && wk) setWk(null);
  }, [today, ym, wk, edit]);
  const [touched, setTouched] = useState(0);
  useEffect(() => {
    if (!edit || !(ym || wk) || editing) return;
    const t = setTimeout(
      () => {
        setYm(null);
        setWk(null);
      },
      3 * 60 * 1000
    );
    return () => clearTimeout(t);
  }, [edit, ym, wk, touched, editing]);

  // the board style, or this month's own style, with its tweaks
  const monthLook = lookDraft || (meta && 'artPad' in meta ? meta.look : undefined);
  const tv = useMemo(() => monthVals(theme, monthLook), [theme, monthLook]);
  const css = useMemo(() => themeCss(tv, sf.lum), [tv, sf.lum]);
  const m = useMemo(() => {
    const d = month.data && 'grid' in month.data ? month.data : null;
    const o = otherYm && other.data && 'grid' in other.data ? other.data : null;
    if (!d || !o) return d;
    // both months' grids have the days between them: each event once
    const key = (e: BoardEvent) =>
      [e.ref?.href || '', e.ref?.rid || '', e.title, e.start, e.end, e.time || ''].join('|');
    const seen = new Set(d.events.map(key));
    return { ...d, events: [...d.events, ...o.events.filter(e => !seen.has(key(e)))] };
  }, [month.data, other.data, otherYm]);
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
          sessionStorage.setItem('chalkFromBoard', weekly ? 'week' : edit ? 'edit' : './');
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
      // (nor the month or week arrows: › › skips ahead, it doesn't start the photo frame)
      if (!(e.target as Element).closest?.('.slate') || (e.target as Element).closest?.('button.nav'))
        return void (lastTap.current = 0);
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
  const ed = useArt(artKey, art);
  // ----------- //
  // | Drawing | //
  // ----------- //
  // The pen, what is picked, and a stamp being placed.                      //
  // drawing or zoomed in on a phone or tablet: the tab bar shrinks to a button in the corner
  useEffect(() => {
    setBusyBoard(drawing || zoom.z > 1.01);
    return () => setBusyBoard(false);
  }, [drawing, zoom.z, setBusyBoard]);
  const [pen, setPen] = useState<Pen>(firstPen);
  // ✏️ Draw / Decorate and Done (a family screen starts on Select: it moves and decorates, no pens)
  const toggleDraw = () => {
    if (family && !drawing) setPen(p => ({ ...p, tool: 'select' }));
    setDrawing(d => !d);
  };
  const [selection, setSelection] = useState<number[]>([]);
  const [hidden, setHidden] = useState<number[]>([]);
  const [placing, setPlacing] = useState<{ st: Stamp; k: number } | null>(null);
  const [note, setNote] = useState('');
  useEffect(() => {
    setSelection([]);
    setPlacing(null);
  }, [artKey, drawing]);
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
    if (
      week ||
      !edit ||
      !shown ||
      !mm ||
      borderDraft !== undefined ||
      placed === realPad ||
      (who?.rank || 0) < RANK.family
    )
      return; // (a week's art isn't moved by the month's border)
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
  }, [week, edit, shown, mm, borderDraft, placed, realPad, who, art, ed.items, metaLive]);
  // a taller board (filling the screen): the art shown on its taller days, and anything drawn, moved or
  // changed here put back on the board's own layout before it's kept (every screen sees it on the same days)
  const tallItems = useMemo(() => stretchY(ed.items, SLATE_H, slateH), [ed.items, slateH]);
  const back = (list: ArtItem[]) => stretchY(list, slateH, SLATE_H);
  const view: typeof ed =
    slateH === SLATE_H
      ? ed
      : {
          ...ed,
          items: tallItems,
          add: (it: ArtItem) => ed.add(back([it])[0]),
          addMany: (list: ArtItem[]) => ed.addMany(back(list)),
          remove: (list: ArtItem[]) => ed.remove(back(list)),
          update: (before: ArtItem[], after: ArtItem[]) => ed.update(back(before), back(after)),
          preview: (list: ArtItem[]) => ed.preview(back(list))
        };
  const base = useMemo(
    () => (week || placed === shownPad ? tallItems : stretchY(laidOut, SLATE_H, slateH)),
    [week, placed, shownPad, tallItems, laidOut, slateH]
  );
  const items = hidden.length ? base.filter(x => !hidden.includes(x.id)) : base;
  const selItems = view.items.filter(x => selection.includes(x.id));
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
    const ids = await view.addMany(list);
    setPen(p => ({ ...p, tool: 'select' }));
    setSelection(ids);
  };
  const titleStyle = titleDraft?.style || mm?.title || mm?.defaultTitle || DEFAULT_TITLE;
  const hand = titleDraft ? titleDraft.hand : !!mm?.hideTitle;
  const border = borderDraft !== undefined ? borderDraft : mm?.border || null;
  const go = (n: number) => (week ? setWk(addDays(week, 7 * n)) : shown && setYm(addMonths(shown, n)));
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
      justSaved.current = dates;
      const elsewhere = dates.find(d => d && d.slice(0, 7) !== shown);
      if (elsewhere && !dates.some(d => d?.slice(0, 7) === shown) && !week) setYm(elsewhere.slice(0, 7));
      month.reload();
      if (otherYm) other.reload();
    },
    [shown, month, other, otherYm]
  );
  // ------------------------ //
  // | Art over the writing | //
  // ------------------------ //
  // A piece of art over events either hides them ('hide') or sits behind    //
  // the writing ('under'); she's asked which when she puts one there. Art   //
  // over the grid's leftover days (the next or last month's) hides their    //
  // events without asking. Art that covers no writing never asks.           //
  const slateRef = useRef<HTMLDivElement>(null);
  const hiddenOn = useRef(new Set<string>()); // days with writing hidden under art
  const justSaved = useRef<string[] | null>(null); // an event just saved: say if it's under art
  const behind = items.filter(x => x.cv === 'under');
  const front = items.filter(x => x.cv !== 'under');
  useLayoutEffect(() => {
    const slate = slateRef.current;
    if (!slate || !m) return;
    const run = () => {
      const all = writingOn(slate);
      for (const w of all) w.el.classList.remove('underart');
      const hide = new Set<Writing>([
        ...coveredBy(
          items.filter(x => x.cv === 'hide'),
          all.filter(w => !w.other),
          slateH
        ),
        ...coveredBy(
          items.filter(x => !x.e),
          all.filter(w => w.other),
          slateH
        )
      ]);
      for (const w of hide) w.el.classList.add('underart');
      hiddenOn.current = new Set([...hide].map(w => w.date).filter(Boolean));
      const js = justSaved.current;
      if (js && js.some(d => hiddenOn.current.has(d))) {
        const d = js.find(x => hiddenOn.current.has(x))!;
        setNote(`Saved. On the board it’s under art on ${dayName(d)}: tap the day to see it`);
      }
      justSaved.current = null;
    };
    run();
    const t = setTimeout(run, 500); // again once the writing's fonts have settled
    return () => clearTimeout(t);
  }, [items, m, week]);
  // the question, while decorating: what should this piece do to the events under it?
  const [ask, setAsk] = useState<{ ids: number[]; what: string } | null>(null);
  const answered = useRef<'hide' | 'under' | null>(null); // this time's answer, for the next pieces
  useEffect(() => {
    if (!drawing) {
      answered.current = null;
      setAsk(null);
    }
  }, [drawing]);
  const setCover = (ids: number[], cv: 'hide' | 'under') => {
    const before = view.items.filter(x => ids.includes(x.id));
    if (before.length)
      view.update(
        before,
        before.map(x => ({ ...x, cv }))
      );
  };
  useEffect(() => {
    const slate = slateRef.current;
    if (!edit || !drawing || !m || ask || placing || hidden.length) return;
    // a moment after she stops moving things
    const t = setTimeout(() => {
      const writing = writingOn(slate!).filter(w => !w.other);
      const groups = new Map<string, ArtItem[]>();
      for (const x of view.items)
        if (x.id >= 0 && !x.cv && !x.e) groups.set(x.g || 'i' + x.id, [...(groups.get(x.g || 'i' + x.id) || []), x]);
      const ids: number[] = [];
      const hit = new Set<Writing>();
      for (const list of groups.values()) {
        const c = coveredBy(list, writing, slateH);
        if (!c.length) continue;
        ids.push(...list.map(x => x.id));
        for (const w of c) hit.add(w);
      }
      if (!ids.length) return;
      if (answered.current) {
        setCover(ids, answered.current);
        setNote(
          answered.current === 'hide'
            ? 'The events under it are hidden, like before'
            : 'It’s behind the writing, like before'
        );
        return;
      }
      const ws = [...hit];
      const names = ws.slice(0, 4).map(w => `${w.text} (${dayName(w.date)})`);
      const what =
        `This covers ${ws.length === 1 ? 'an event' : ws.length + ' events'}: ` +
        names.join(', ') +
        (ws.length > 4 ? ` and ${ws.length - 4} more` : '') +
        '. Hide them on the board?';
      setAsk({ ids, what });
    }, 700);
    return () => clearTimeout(t);
  }, [edit, drawing, m, view.items, ask, placing, hidden]);
  const answer = (cv: 'hide' | 'under') => {
    if (ask) setCover(ask.ids, cv);
    answered.current = cv;
    setAsk(null);
  };
  // Select: the pieces picked over events can change their mind
  const selCover = selItems.length && selItems.every(x => x.cv) ? (selItems[0].cv as 'hide' | 'under') : null;
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
      style={{
        ...(pad ? {} : { backgroundImage: bg }),
        ...(shell.navH ? { bottom: 'auto', height: visibleHeight() - shell.navH } : {})
      }}
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
          background: pad ? sf.frame || 'var(--wood)' : undefined,
          ...(fabClear ? { ['--fabclear' as string]: fabClear + 'px' } : {})
        }}
      >
        <div
          className="slate"
          id="slate"
          ref={slateRef}
          data-surface={sf.id}
          style={{
            ...(pad ? { backgroundImage: bg } : {}),
            ...(slateH !== SLATE_H ? { height: slateH, ['--slateH' as string]: slateH + 'px' } : {})
          }}
        >
          <style>{css}</style>
          {m && (
            <Month
              data={m}
              height={slateH}
              bins={extras?.bins || null}
              bg={sf.lum}
              today={{ shape: tv.todayS, color: tv.todayC }}
              border={border}
              onDay={onDay}
              onEvent={onEvent}
              nav={edit ? { prev: () => go(-1), next: () => go(1) } : undefined}
              // a tap on the month's name reloads, on a screen that edits (not the wall; not while drawing)
              onTitle={edit && !drawing ? () => location.reload() : undefined}
              week={week}
              under={split ? <Split view={weekView} edit={edit} drawing={drawing} time24={!!today?.time24} /> : null}
              title={
                <Title
                  text={monthName}
                  year={m.grid.y !== Number(m.today.slice(0, 4)) ? m.grid.y : undefined}
                  style={titleStyle}
                  hand={hand && !week}
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
          <Notes
            time24={!!today?.time24}
            edit={edit}
            drawing={drawing}
            only={split ? ['info'] : undefined}
            dockRef={edit && shell.dock ? setDockEl : undefined}
          />
          <WeatherMotion wall={!edit} />
          {behind.length > 0 && <Art items={behind} bg={sf.lum} res={res} gifsPlay under h={slateH} />}
          <Art items={front} bg={sf.lum} res={res} gifsPlay h={slateH} />
          {edit && drawing && (
            <DrawLayer
              art={view}
              h={slateH}
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
          {m?.problem && !(note || ed.err || placing) && (
            <div className="status calproblem" role="status" title={m.problem}>
              {m.outage
                ? `${m.outage}: showing what the board had`
                : 'The calendar can’t be reached right now: showing what the board had'}
            </div>
          )}
          {ask && !placing && (
            <div
              className="status ask"
              role="alertdialog"
              aria-label="Art over events"
              onPointerDown={e => e.stopPropagation()}
              onPointerUp={e => e.stopPropagation()}
            >
              <span className="why">{ask.what}</span>
              <button type="button" className="go" id="coverHide" onClick={() => answer('hide')}>
                Hide them
              </button>
              <button type="button" id="coverKeep" onClick={() => answer('under')}>
                Keep showing them
              </button>
            </div>
          )}
          {!ask && drawing && selCover && !placing && !note && (
            <div className="status ask" onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()}>
              <span className="why">
                {selCover === 'hide' ? 'The events under this are hidden on the board' : 'This is behind the writing'}
              </span>
              <button
                type="button"
                id="coverSwap"
                onClick={() => setCover(selection, selCover === 'hide' ? 'under' : 'hide')}
              >
                {selCover === 'hide' ? 'Show them over it' : 'Hide the events under it'}
              </button>
            </div>
          )}
          {!ask && (note || ed.err || placing) && (
            <div className="status" role="status">
              {placing ? `Tap the board where “${placing.st.name}” should go` : note || ed.err}
            </div>
          )}
        </div>
        {edit && (
          <Strip
            drawing={drawing}
            onDraw={toggleDraw}
            drawLabel={family ? 'Decorate' : 'Draw'}
            dock={edit && shell.dock ? dockEl : null}
            actions={{
              add: m
                ? () =>
                    setEditing({ k: 'event', ev: null, date: m.ym === m.today.slice(0, 7) ? m.today : m.ym + '-01' })
                : undefined,
              slides: photos?.photos.length ? slides.doubleTap : undefined,
              week: () => navigate(weekly ? homeHref(who) : 'week'),
              weekly
            }}
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
                    const all = view.items.filter(x => x.id >= 0 && !x.e);
                    if (
                      all.length &&
                      confirm(`Wipe all the art for ${week ? 'this week' : monthName}? (Undo can bring it back.)`)
                    )
                      view.remove(all);
                  }}
                />
              ) : undefined
            }
          >
            <button type="button" className={'pill' + (drawing ? ' on' : '')} id="drawBtn" onClick={toggleDraw}>
              <span className="ic" aria-hidden="true">
                ✏️
              </span>{' '}
              {drawing ? (family ? 'Done' : 'Done drawing') : family ? 'Decorate' : 'Draw'}
            </button>
            {m && !drawing && (
              // straight to the pictures (and into decorating, to place one)
              <button
                type="button"
                className="pill"
                id="picturesBtn"
                onClick={() => {
                  toggleDraw();
                  setEditing({ k: 'library' });
                }}
              >
                <span className="ic" aria-hidden="true">
                  ⭐
                </span>{' '}
                Pictures
              </button>
            )}
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
                <button type="button" className="pill" id="notesBtn" onClick={() => setEditing({ k: 'notes' })}>
                  <span className="ic" aria-hidden="true">
                    🗒️
                  </span>{' '}
                  Notes
                </button>
                <button type="button" className="pill" id="styleBtn" onClick={() => setEditing({ k: 'style' })}>
                  <span className="ic" aria-hidden="true">
                    🎨
                  </span>{' '}
                  Style
                </button>
                {week && (
                  // 🗓️ Week's own settings: where it starts, and Split View (⚙️ Settings → Week)
                  <button type="button" className="pill" id="weekSetBtn" onClick={() => showSettings('week')}>
                    <span className="ic" aria-hidden="true">
                      ⚙️
                    </span>{' '}
                    Week
                  </button>
                )}
              </>
            )}
          </Strip>
        )}
      </div>
      {(!edit || family || slides.on) && photos && (
        <Slideshow photos={photos} on={slides.on} time24={!!today?.time24} onTap={slides.tapSlides} />
      )}
      <ReminderAlert time24={!!today?.time24} />
      <TimerDone />
      <Offline />
      {edit && !family && !hideZoom && (
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
          cake={m.cake}
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
            if (editing.item) view.remove([editing.item]);
            closeEditor();
          }}
          onSave={t => {
            const posca = isPosca(t.c);
            if (editing.item) {
              const after: Item = { ...editing.item, ...t };
              if (posca) after.m = true;
              else delete after.m;
              view.update([editing.item], [after]);
            } else view.add({ id: 0, k: 't', x: editing.at[0], y: editing.at[1], ...t, ...(posca ? { m: true } : {}) });
            closeEditor();
          }}
        />
      )}
      {editing?.k === 'recolor' && (
        <RecolorSheet
          onClose={closeEditor}
          onSave={(line, fill) => {
            view.update(selItems, recolor(selItems, line, fill));
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
      {editing?.k === 'notes' && <NotesEditor onClose={closeEditor} />}
      {editing?.k === 'photos' && shown && (
        <PhotosEditor
          ym={shown}
          monthName={monthName}
          meta={mm}
          photos={photos}
          family={family}
          onClose={closeEditor}
        />
      )}
      {editing?.k === 'style' && shown && (
        <StyleEditor
          theme={savedTheme}
          onPreview={setThemeDraft}
          ym={shown}
          monthName={monthName}
          look={mm?.look || null}
          onPreviewLook={setLookDraft}
          onClose={closeEditor}
        />
      )}
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
