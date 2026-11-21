/*
===============================================================================
 Family Chalk Planner | Screens | Board | cover.ts
===============================================================================
 Version:   1.2.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-10
 Updated:   2026-11-21

 Purpose:
     Which writing on the calendar (events, trash day, "+2 more") a piece
     of art really covers. The art is painted, roughly, onto a small
     hidden canvas, and each line of writing counts as covered when much
     of it is under paint: a pumpkin in the corner of a day or a chalk
     circle around an event covers nothing; a field of maize across the
     last week does.

 Used by:
     web/src/board/Board.tsx
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.15.1    2026-11-10   joshua    New file.
                        claude

 1.2.0    2026-11-21   joshua    A taller slate (a screen that fills
                        claude    itself).
===============================================================================
*/

import type { ArtItem } from './Art.tsx';
import { itemBox } from './geom.ts';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------------- //
// | The art, painted | //
// -------------------- //
const W = 1252;
const H = 642;
const K = 0.5; // the hidden canvas is half the board's size: plenty to tell covered from not
// how much of a line of writing must be under art to count as covered
export const COVERED = 0.3;

// The art painted solid: strokes as drawn, words and pictures as most of   //
// their box (pictures have see-through edges; words don't fill theirs)    //
export function paintArt(items: ArtItem[], h = H) {
  const cv = document.createElement('canvas');
  cv.width = Math.round(W * K);
  cv.height = Math.round(h * K);
  const g = cv.getContext('2d', { willReadFrequently: true });
  if (!g) return null;
  g.scale(K, K);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const it of items) {
    g.globalCompositeOperation = it.e ? 'destination-out' : 'source-over';
    if (it.k === 'g' || it.k === 't') {
      const b = itemBox(it);
      const w = b.x2 - b.x1;
      const h = b.y2 - b.y1;
      // a picture: most of it, without its see-through margin; words: the middle of their lines
      const mx = it.k === 'g' ? w * 0.12 : w * 0.04;
      const my = it.k === 'g' ? h * 0.12 : h * 0.22;
      g.fillRect(b.x1 + mx, b.y1 + my, w - 2 * mx, h - 2 * my);
      continue;
    }
    const p = it.p || [];
    if (p.length < 2) continue;
    g.lineWidth = it.w || 4;
    g.beginPath();
    g.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]);
    if (p.length === 2) g.lineTo(p[0] + 0.1, p[1]);
    g.stroke();
    if (it.fc) g.fill();
  }
  return g;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------------- //
// | The writing on the calendar | //
// ------------------------------- //
export interface Writing {
  el: HTMLElement;
  date: string; // the day it's on ('' for a bar across several days)
  other: boolean; // a day from the month before or after (the grid's leftovers)
  text: string;
  box: { x: number; y: number; w: number; h: number }; // in board pixels
}

// every line of writing in the calendar, where it is on the board
export function writingOn(slate: HTMLElement): Writing[] {
  const s = slate.getBoundingClientRect();
  const z = s.width / W || 1; // the board is scaled to fit the screen
  const out: Writing[] = [];
  for (const el of slate.querySelectorAll<HTMLElement>('.day .ev, .day .top, .day .more, .week .bar')) {
    if (!el.textContent?.trim()) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const day = el.closest<HTMLElement>('.day');
    out.push({
      el,
      date: day?.dataset.date || '',
      other: !!day?.classList.contains('other'),
      text: el.textContent.trim(),
      box: { x: (r.left - s.left) / z, y: (r.top - s.top) / z, w: r.width / z, h: r.height / z }
    });
  }
  return out;
}

// how much of this writing the painted art covers (0 to 1)
export function coverOf(g: CanvasRenderingContext2D, w: Writing) {
  const x = Math.max(0, Math.floor(w.box.x * K));
  const y = Math.max(0, Math.floor(w.box.y * K));
  const cw = Math.min(g.canvas.width - x, Math.ceil(w.box.w * K));
  const ch = Math.min(g.canvas.height - y, Math.ceil(w.box.h * K));
  if (cw <= 0 || ch <= 0) return 0;
  const a = g.getImageData(x, y, cw, ch).data;
  let n = 0;
  for (let i = 3; i < a.length; i += 4) if (a[i] > 40) n++;
  return n / (cw * ch);
}

// the writing these pieces of art cover
export function coveredBy(items: ArtItem[], writing: Writing[], h = H) {
  if (!items.length || !writing.length) return [];
  const g = paintArt(items, h); // (h: the slate's height on this screen)
  return g ? writing.filter(w => coverOf(g, w) >= COVERED) : [];
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
