/*
===============================================================================
 Family Chalk Planner | Screens | Board | geom.ts
===============================================================================
 Version:   1.2.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-07
 Updated:   2026-11-21

 Purpose:
     Where things are on the board, in board pixels (the slate is 1252 x
     642).

 Used by:
     web/src/board/Board.tsx
     web/src/board/Month.tsx
     web/src/board/Title.tsx
     web/src/board/TitlePhotos.tsx
     web/src/board/draw/Draw.tsx
     web/src/board/draw/Find.tsx
     web/src/board/draw/Library.tsx
     web/src/ui/JarArt.tsx
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    The new board: the family's style, each
                        colby     month's title and holiday border, polaroids,
                        claude    drawn jars.

                                  The new board: drawing on a tablet (chalk,
                                  Posca, writing, eraser, select, stamps,
                                  GIFs).

                                  The new screens take over: /, /edit and
                                  /chores are the React board; the old one
                                  stays at /classic.

 0.16.0    2026-11-11   joshua    Turning (spin), and the box of something
                        claude    turned.

 1.2.0    2026-11-21   joshua    Art on a taller board (a screen that fills
                        claude    itself) and back: stretchY.
===============================================================================
*/

import { fontCss } from './Art.tsx';
import type { ArtItem } from './Art.tsx';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------- //
// | Sizes | //
// --------- //
export type Box = { x1: number; y1: number; x2: number; y2: number };

let ctx: CanvasRenderingContext2D | null = null;
export function measure(font: string, text: string) {
  ctx = ctx || document.createElement('canvas').getContext('2d');
  if (!ctx) return null;
  ctx.font = font;
  return ctx.measureText(text);
}

export const textLines = (it: ArtItem) => String(it.s || '').split('\n');

export function textBox(it: ArtItem): Box {
  const z = it.z || 40;
  const w = Math.max(0, ...textLines(it).map(l => measure(fontCss(it.f, z), l)?.width || l.length * z * 0.5));
  const h = textLines(it).length * z * 1.2;
  const x = it.x || 0;
  const y = it.y || 0;
  return { x1: x - w / 2 - 6, x2: x + w / 2 + 6, y1: y - h / 2 - 4, y2: y + h / 2 + 4 };
}

// a box turned by r degrees about its middle: the box around it
function turnedBox(b: Box, r: number | undefined): Box {
  if (!r) return b;
  const cx = (b.x1 + b.x2) / 2;
  const cy = (b.y1 + b.y2) / 2;
  const a = (r * Math.PI) / 180;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  const hw = (b.x2 - b.x1) / 2;
  const hh = (b.y2 - b.y1) / 2;
  const w = hw * c + hh * s;
  const h = hw * s + hh * c;
  return { x1: cx - w, x2: cx + w, y1: cy - h, y2: cy + h };
}

export function itemBox(it: ArtItem): Box {
  if (it.k === 't') return turnedBox(textBox(it), it.r);
  if (it.k === 'g') {
    const x = it.x || 0;
    const y = it.y || 0;
    const w = it.w || 0;
    const h = it.h || 0;
    return turnedBox({ x1: x - w / 2, y1: y - h / 2, x2: x + w / 2, y2: y + h / 2 }, it.r);
  }
  const p = it.p || [];
  const h = (it.w || 4) / 2;
  const b = { x1: 1e9, y1: 1e9, x2: -1e9, y2: -1e9 };
  for (let i = 0; i < p.length; i += 2) {
    b.x1 = Math.min(b.x1, p[i] - h);
    b.x2 = Math.max(b.x2, p[i] + h);
    b.y1 = Math.min(b.y1, p[i + 1] - h);
    b.y2 = Math.max(b.y2, p[i + 1] + h);
  }
  return b;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------- //
// | Boxes | //
// --------- //
export const overlaps = (a: Box, b: Box) => a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;

// a small stable random number for item k (the same on every screen)
export function hash(k: number, salt: number) {
  const x = Math.sin(k * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function unionBox(items: ArtItem[]): Box | null {
  let u: Box | null = null;
  for (const it of items) {
    const b = itemBox(it);
    u = u
      ? { x1: Math.min(u.x1, b.x1), y1: Math.min(u.y1, b.y1), x2: Math.max(u.x2, b.x2), y2: Math.max(u.y2, b.y2) }
      : b;
  }
  return u;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------ //
// | Touching | //
// ------------ //
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(ax + t * dx - px, ay + t * dy - py);
}
// is (x, y) within r of this item?
export function hits(it: ArtItem, x: number, y: number, r: number) {
  if (it.e) return false;
  if (it.k === 't' || it.k === 'g') {
    const b = itemBox(it);
    return x >= b.x1 - r && x <= b.x2 + r && y >= b.y1 - r && y <= b.y2 + r;
  }
  const p = it.p || [];
  const reach = r + (it.w || 4) / 2;
  if (p.length === 2) return Math.hypot(x - p[0], y - p[1]) <= reach;
  for (let i = 0; i < p.length - 2; i += 2) if (segDist(x, y, p[i], p[i + 1], p[i + 2], p[i + 3]) <= reach) return true;
  return false;
}
// is any of it inside the rectangle?
export function inRect(it: ArtItem, r: Box) {
  if (it.e) return false;
  if (it.k === 't' || it.k === 'g') return overlaps(itemBox(it), r);
  const p = it.p || [];
  for (let i = 0; i < p.length; i += 2)
    if (p[i] >= r.x1 && p[i] <= r.x2 && p[i + 1] >= r.y1 && p[i + 1] <= r.y2) return true;
  return false;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------- //
// | Moving | //
// ---------- //
// A copy moved by dx, dy and scaled by k around (cx, cy)                    //
export function xform(it: ArtItem, dx: number, dy: number, k = 1, cx = 0, cy = 0): ArtItem {
  const o: ArtItem = JSON.parse(JSON.stringify(it));
  if (o.k === 't' || o.k === 'g') {
    o.x = Math.round(((o.x || 0) - cx) * k + cx + dx);
    o.y = Math.round(((o.y || 0) - cy) * k + cy + dy);
    if (o.k === 't') o.z = Math.max(12, Math.min(120, Math.round((o.z || 40) * k)));
    else {
      o.w = Math.max(16, Math.min(700, Math.round((o.w || 80) * k)));
      o.h = Math.max(16, Math.min(700, Math.round((o.h || 80) * k)));
    }
  } else {
    o.p = (o.p || []).map((v, i) => (i % 2 ? (v - cy) * k + cy + dy : (v - cx) * k + cx + dx));
    o.w = Math.max(1, Math.min(60, Math.round((o.w || 4) * k * 10) / 10));
  }
  return o;
}
// turned by deg degrees about (cx, cy): pictures and words keep their turn (r), lines turn their points
export function spin(it: ArtItem, deg: number, cx: number, cy: number): ArtItem {
  const o: ArtItem = JSON.parse(JSON.stringify(it));
  const a = (deg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const turn = (x: number, y: number): [number, number] => [
    cx + (x - cx) * cos - (y - cy) * sin,
    cy + (x - cx) * sin + (y - cy) * cos
  ];
  if (o.k === 't' || o.k === 'g') {
    const [x, y] = turn(o.x || 0, o.y || 0);
    o.x = Math.round(x);
    o.y = Math.round(y);
    let r = Math.round((((o.r || 0) + deg) % 360) + 360) % 360;
    if (r > 180) r -= 360;
    if (r) o.r = r;
    else delete o.r;
  } else {
    const p = o.p || [];
    const q: number[] = [];
    for (let i = 0; i < p.length; i += 2) {
      const [x, y] = turn(p[i], p[i + 1]);
      q.push(Math.round(x * 10) / 10, Math.round(y * 10) / 10);
    }
    o.p = q;
  }
  return o;
}
export const isClosedLine = (s: ArtItem) =>
  !s.k &&
  !!s.p &&
  s.p.length >= 8 &&
  Math.hypot(s.p[0] - s.p[s.p.length - 2], s.p[1] - s.p[s.p.length - 1]) <= Math.max(2.5, (s.w || 4) * 0.8);

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------------------- //
// | Art on a new layout | //
// ----------------------- //
// The calendar's box on the slate (the days, weekday names and any border), //
// in board pixels                                                           //
export const NOTES_W = 214 + 14; // the Notes column and the gap before it
export const CAL = { x: 18, y: 8 + 70, w: 1252 - 18 - 14 - NOTES_W, h: 642 - 8 - 10 - 70 };
export const CAL_WIDE = CAL.w + NOTES_W; // the calendar where the Notes column is left off
export const SLATE_H = 642; // the board's own height; a screen that fills itself draws it taller
export const BORDER_PAD = { s: 26, m: 32, l: 40 }; // a border's picture size + 6

// Art sits on the days, so it moves with them: with a border the calendar is a little smaller, and
// anything drawn on it (centered inside it) moves and shrinks the same way. Things beside the calendar
// (the title, Notes) stay put.
export function relayout(items: ArtItem[], p0: number, p1: number): ArtItem[] {
  if (p0 === p1) return items;
  const R = CAL;
  const a = { x: R.x + p0, y: R.y + p0, w: R.w - 2 * p0, h: R.h - 2 * p0 };
  const b = { x: R.x + p1, y: R.y + p1, w: R.w - 2 * p1, h: R.h - 2 * p1 };
  const sx = b.w / a.w;
  const sy = b.h / a.h;
  const k = Math.min(sx, sy);
  return items.map(it => {
    const bx = itemBox(it);
    const cx = (bx.x1 + bx.x2) / 2;
    const cy = (bx.y1 + bx.y2) / 2;
    if (cx < R.x || cx > R.x + R.w || cy < R.y || cy > R.y + R.h) return it;
    const o = xform(it, b.x + (cx - a.x) * sx - cx, b.y + (cy - a.y) * sy - cy, k, cx, cy);
    o.id = it.id;
    return o;
  });
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------------------ //
// | Art on a taller board (and back) | //
// ------------------------------------ //
// A screen that fills itself draws the board taller than 642: its days    //
// are taller, so art on them moves down with them (each piece keeps its   //
// size and shape; only where it sits changes). Art is always kept on the  //
// board's own 642 layout, so every screen shows it on the same days: what //
// is drawn on a taller screen is moved back before it's kept.             //
export function stretchY(items: ArtItem[], h0: number, h1: number): ArtItem[] {
  if (h0 === h1) return items;
  const a = CAL.h + (h0 - SLATE_H);
  const b = CAL.h + (h1 - SLATE_H);
  return items.map(it => {
    const bx = itemBox(it);
    const cx = (bx.x1 + bx.x2) / 2;
    const cy = (bx.y1 + bx.y2) / 2;
    if (cx < CAL.x || cx > CAL.x + CAL.w || cy < CAL.y) return it; // (the title and Notes stay put)
    const o = xform(it, 0, ((cy - CAL.y) * b) / a + CAL.y - cy);
    o.id = it.id;
    return o;
  });
}

// The Notes column left off: the calendar is wider, so art on its days    //
// moves across with them (the same way it moves down on a taller board).  //
export function stretchX(items: ArtItem[], w0: number, w1: number): ArtItem[] {
  if (w0 === w1) return items;
  return items.map(it => {
    const bx = itemBox(it);
    const cx = (bx.x1 + bx.x2) / 2;
    const cy = (bx.y1 + bx.y2) / 2;
    if (cx < CAL.x || cx > CAL.x + w0 || cy < CAL.y) return it; // (the title stays put)
    const o = xform(it, ((cx - CAL.x) * w1) / w0 + CAL.x - cx, 0);
    o.id = it.id;
    return o;
  });
}
