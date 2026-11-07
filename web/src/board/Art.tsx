/*
===============================================================================
 Family Chalk Planner | Screens | Board | Art.tsx
===============================================================================
 Version:   0.13.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-07
 Updated:   2026-11-07

 Purpose:
     The art on a month: chalk and Posca lines, fills, words, clipart and
     GIFs, drawn as SVG over the calendar. SVG is vector, so it's sharp at
     any size: a 4K wall shows the same chalk lines four times as finely
     as a 1080p one. The chalk grain is a tile made at the screen's
     resolution.

 Used by:
     web/src/board/Board.tsx
     web/src/board/Title.tsx
     web/src/board/TitlePhotos.tsx
     web/src/board/draw/Draw.tsx
     web/src/board/draw/Find.tsx
     web/src/board/draw/Library.tsx
     web/src/board/draw/Tools.tsx
     web/src/board/draw/useArt.ts
     web/src/board/editors/TitleEditor.tsx
     web/src/board/geom.ts
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    The board in React (wall view, next/board):
                        claude    month, events, art, notes column; sharp at
                                  4K.

                                  The new board: drawing on a tablet (chalk,
                                  Posca, writing, eraser, select, stamps,
                                  GIFs).
===============================================================================
*/

import { useEffect, useMemo, useRef, useState } from 'react';
import { url } from '../lib/api.ts';
import { readable } from './color.ts';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------ //
// | A piece of art | //
// ------------------ //
export type ArtItem = {
  id: number;
  k?: 't' | 'g';
  p?: number[]; // stroke points [x, y, x, y...]
  c?: string;
  w?: number;
  m?: boolean; // Posca (solid) instead of chalk
  e?: boolean; // eraser
  fc?: string; // fill of a closed line
  s?: string; // words
  f?: number;
  z?: number;
  x?: number;
  y?: number;
  h?: number;
  src?: string;
  still?: string;
  mode?: string;
  g?: string; // things added together (a stamp, a copy) move as one
};

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------------- //
// | Colors and fonts | //
// -------------------- //
export const CHALK = ['#EDEAE0', '#F6B3CB', '#F2D479', '#9CC9E6', '#A9D8A0', '#E8A35C', '#B49CE0'];
const FONTS = [
  "700 {z}px 'Kalam', cursive",
  "600 {z}px 'Caveat', cursive",
  "400 {z}px 'Permanent Marker', cursive",
  "400 {z}px 'Pacifico', cursive",
  "400 {z}px 'Fredericka the Great', serif",
  "700 {z}px 'Amatic SC', cursive",
  "400 {z}px 'Rock Salt', cursive",
  "700 {z}px 'Dancing Script', cursive"
];
export const fontCss = (f = 0, z = 40) => (FONTS[f] || FONTS[0]).replace('{z}', String(z));

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------------- //
// | Chalk grain | //
// --------------- //
// The speckled chalk grain for a color, as an image tile (`res` pixels per  //
// board pixel)                                                              //
const grains = new Map<string, string>();
function grain(color: string, res: number) {
  const key = color + res;
  if (grains.has(key)) return grains.get(key)!;
  const n = Math.round(64 * res);
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d')!;
  g.fillStyle = color;
  g.fillRect(0, 0, n, n);
  const img = g.getImageData(0, 0, n, n);
  const d = img.data;
  let seed = 7;
  // the same speckles as the board's 64x64 tile, each one res x res pixels
  const cell = new Uint8Array(64 * 64);
  for (let i = 0; i < cell.length; i++) {
    seed = (seed * 16807) % 2147483647;
    const r = seed / 2147483647;
    cell[i] = r < 0.08 ? 60 : r < 0.3 ? 185 : 250;
  }
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) d[(y * n + x) * 4 + 3] = cell[Math.floor(y / res) * 64 + Math.floor(x / res)];
  g.putImageData(img, 0, 0);
  const out = c.toDataURL('image/png');
  grains.set(key, out);
  return out;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------- //
// | Lines | //
// --------- //
const r1 = (n: number) => Math.round(n * 10) / 10;
export function strokePath(p: number[]) {
  let d = `M${r1(p[0])} ${r1(p[1])}`;
  if (p.length === 2) return d + ` L${r1(p[0] + 0.1)} ${r1(p[1] + 0.1)}`;
  for (let i = 2; i < p.length - 2; i += 2)
    d += ` Q${r1(p[i])} ${r1(p[i + 1])} ${r1((p[i] + p[i + 2]) / 2)} ${r1((p[i + 1] + p[i + 3]) / 2)}`;
  return d + ` L${r1(p[p.length - 2])} ${r1(p[p.length - 1])}`;
}
const isClosed = (s: ArtItem) => {
  const p = s.p;
  return (
    !s.k &&
    !!p &&
    p.length >= 8 &&
    Math.hypot(p[0] - p[p.length - 2], p[1] - p[p.length - 1]) <= Math.max(2.5, (s.w || 4) * 0.8)
  );
};

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------------- //
// | Moving gently | //
// ----------------- //
// "Gentle" GIFs rest on a still frame and play for about 6 seconds every    //
// 2.5-4 minutes, each on its own schedule so they don't all go at once      //
function useGentle(items: ArtItem[], on: boolean) {
  const [playing, setPlaying] = useState<Set<number>>(new Set());
  const plan = useRef(new Map<number, { next: number; stop: number }>());
  const ids = items.filter(it => it.k === 'g' && it.mode === 'gentle').map(it => it.id);
  const key = ids.join(',');
  useEffect(() => {
    if (!on || !key) return;
    const t = setInterval(() => {
      const now = Date.now();
      const p = plan.current;
      const play = new Set<number>();
      for (const id of key.split(',').map(Number)) {
        let s = p.get(id);
        if (!s) p.set(id, (s = { next: now + 20000 + Math.random() * 120000, stop: 0 }));
        if (s.stop > now) play.add(id);
        else if (s.stop && s.stop <= now) {
          s.stop = 0;
          s.next = now + 150000 + Math.random() * 90000;
        } else if (now >= s.next) {
          s.stop = now + 6000;
          play.add(id);
        }
      }
      setPlaying(cur => (cur.size === play.size && [...play].every(x => cur.has(x)) ? cur : play));
    }, 1000);
    return () => clearInterval(t);
  }, [on, key]);
  return playing;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------ //
// | The art, drawn | //
// ------------------ //
// Stored addresses are /api/...; shown relative to the board's address      //
const src = (s?: string) => (s ? url(s) : '');

export function Art({ items, bg, res, gifsPlay }: { items: ArtItem[]; bg: number; res: number; gifsPlay: boolean }) {
  const colors = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) {
      if (!it.m && it.c && !it.e && it.k !== 'g') set.add(readable(it.c, bg, 3));
      if (it.fc && CHALK.includes(it.fc)) set.add(readable(it.fc, bg, 1.5));
    }
    return [...set];
  }, [items, bg]);
  const playing = useGentle(items, gifsPlay);
  const pid = (c: string) => 'g' + c.slice(1);
  const paint = (c: string, chalk: boolean) => (chalk ? `url(#${pid(c)})` : c);
  return (
    <>
      <svg className="artSvg" width="1252" height="642" viewBox="0 0 1252 642" aria-hidden="true">
        <defs>
          {colors.map(c => (
            <pattern key={c} id={pid(c)} patternUnits="userSpaceOnUse" width="64" height="64">
              <image href={grain(c, res)} width="64" height="64" />
            </pattern>
          ))}
        </defs>
        <g className="fills">
          {items.map(it =>
            it.fc && isClosed(it) ? (
              <path
                key={it.id}
                d={strokePath(it.p!) + ' Z'}
                stroke="none"
                fill={paint(readable(it.fc, bg, 1.5), CHALK.includes(it.fc))}
              />
            ) : null
          )}
        </g>
        <g className="lines">
          {items.map(it => {
            if (it.e || it.k === 'g') return null;
            const ic = readable(it.c || '#EDEAE0', bg, 3);
            const p = paint(ic, !it.m);
            if (it.k === 't') {
              const ls = String(it.s).split('\n');
              const lh = (it.z || 40) * 1.2;
              const y0 = (it.y || 0) - ((ls.length - 1) * lh) / 2;
              const text = (fill: string, op?: number) => (
                <text
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={fill}
                  opacity={op}
                  style={{ font: fontCss(it.f, it.z) }}
                >
                  {ls.map((l, i) => (
                    <tspan key={i} x={it.x} y={y0 + i * lh}>
                      {l}
                    </tspan>
                  ))}
                </text>
              );
              return (
                <g key={it.id} data-id={it.id}>
                  {!it.m && text(ic, 0.4)}
                  {text(p)}
                </g>
              );
            }
            if (!it.p || it.p.length < 2) return null;
            const d = strokePath(it.p);
            return (
              <g key={it.id} data-id={it.id}>
                {!it.m && (
                  <path
                    d={d}
                    fill="none"
                    stroke={ic}
                    opacity={0.4}
                    strokeWidth={it.w}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
                <path d={d} fill="none" stroke={p} strokeWidth={it.w} strokeLinecap="round" strokeLinejoin="round" />
              </g>
            );
          })}
        </g>
      </svg>
      <div className="gifLayer">
        {items
          .filter(it => it.k === 'g')
          .map(it => (
            <img
              key={it.id}
              alt=""
              decoding="async"
              src={src(
                gifsPlay && (it.mode === 'loop' || (it.mode === 'gentle' && playing.has(it.id))) ? it.src : it.still
              )}
              style={{
                left: (it.x || 0) - (it.w || 0) / 2,
                top: (it.y || 0) - (it.h || 0) / 2,
                width: it.w,
                height: it.h
              }}
            />
          ))}
      </div>
    </>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
