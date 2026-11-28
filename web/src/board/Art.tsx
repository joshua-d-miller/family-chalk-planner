/*
===============================================================================
 Family Chalk Planner | Screens | Board | Art.tsx
===============================================================================
 Version:   1.3.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-07
 Updated:   2026-11-28

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

 0.14.0    2026-11-07   joshua    The fonts come from shared/fonts.ts.
                        claude

 0.15.1    2026-11-10   joshua    Art she put behind the writing is drawn under
                        claude    the calendar.

 0.16.0    2026-11-11   joshua    Pictures and words turned.
                        claude

 1.2.0    2026-11-21   joshua    As tall as the slate on a screen that fills
                        claude    itself.

 1.2.6    2026-11-22   joshua    The art on a layer of its own over the
                        claude    calendar (layer), not painted in with it.

 1.2.8    2026-11-24   joshua    An animated emoji's still is asked for at
                        claude    the size it's shown on this screen: sharp,
                                  and light on a wall's memory.

 1.3.0    2026-11-28   joshua    A picture in its 🖍 Look (lib/pictureLook.ts),
                        claude    or the board style's. Flight paths (d).
===============================================================================
*/

import { fontShorthand } from '../../../shared/fonts.ts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { url } from '../lib/api.ts';
import { useLook } from '../lib/pictureLook.ts';
import { readable } from './color.ts';
import { trail } from './trail.ts';

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
  d?: string; // a flight path: dashes, dots, dashes and dots, or hearts (trail.ts)
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
  lk?: string; // a picture's 🖍 Look (lib/pictureLook.ts; none: the board style's, 'none': as it is)
  r?: number; // a picture or words, turned (degrees, -179 to 180)
  cv?: 'hide' | 'under'; // over events: hide them, or sit behind the writing (none: not asked yet)
};

// a picture (clipart, an emoji, a GIF), in its 🖍 Look (lib/pictureLook.ts)
function Picture({ it, src, look, res }: { it: ArtItem; src: string; look: string; res: number }) {
  const shown = useLook(src, look, it.w || 0, it.h || 0, res);
  return (
    <img
      alt=""
      decoding="async"
      src={shown}
      style={{
        left: (it.x || 0) - (it.w || 0) / 2,
        top: (it.y || 0) - (it.h || 0) / 2,
        width: it.w,
        height: it.h,
        transform: it.r ? `rotate(${it.r}deg)` : undefined
      }}
    />
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------------- //
// | Colors and fonts | //
// -------------------- //
export const CHALK = ['#EDEAE0', '#F6B3CB', '#F2D479', '#9CC9E6', '#A9D8A0', '#E8A35C', '#B49CE0'];
// the fonts are numbered in shared/fonts.ts (words and month titles keep the number)
export const fontCss = (f = 0, z = 40) => fontShorthand(f, z);

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
// An animated emoji's still picture, asked for at the size it's shown on this screen (its longer side in
// board pixels × res, the screen's pixels per board pixel): 256, 512, 1024 or 2048 across (server/clipart.ts).
// Sharp on any screen, and a small emoji never holds a big picture in the screen's memory.
const STILL = /^\/?api\/anim\/[0-9a-f_]{2,48}\/svg$/;
const stillSrc = (s: string | undefined, w: number, h: number, res: number) => {
  if (!s || !STILL.test(s)) return src(s);
  const need = Math.max(w, h) * res;
  const px = [256, 512, 1024].find(p => p >= need) || 2048;
  return src(s) + '?px=' + px;
};

export function Art({
  items,
  bg,
  res,
  gifsPlay,
  under = false,
  layer = false,
  h = 642,
  look = '',
  looks = true
}: {
  look?: string; // the board style's look for pictures (🎨 Board style → Chalk): each picture's own 🖍 Look first
  looks?: boolean; // looks drawn at all (not on a low-power screen: as they are there)
  items: ArtItem[];
  bg: number;
  res: number;
  gifsPlay: boolean;
  under?: boolean; // the art she put behind the writing (drawn under the calendar's words)
  layer?: boolean; // on a layer of its own, over (or under) the calendar: see board.css
  h?: number; // the slate's height on this screen (taller where it fills the screen)
}) {
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
      <svg
        className={'artSvg' + (under ? ' under' : '') + (layer ? ' own' : '')}
        width="1252"
        height={h}
        viewBox={`0 0 1252 ${h}`}
        aria-hidden="true"
      >
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
                <g key={it.id} data-id={it.id} transform={it.r ? `rotate(${it.r} ${it.x} ${it.y})` : undefined}>
                  {!it.m && text(ic, 0.4)}
                  {text(p)}
                </g>
              );
            }
            if (!it.p || it.p.length < 2) return null;
            if (it.d) {
              // seeded by where it starts, so it looks the same while drawn and once saved
              const t = trail(it.p, it.w || 4, it.d, Math.floor(it.p[0] / 8) * 31 + Math.floor(it.p[1] / 8) + 1);
              return (
                <g key={it.id} data-id={it.id} className="trail">
                  {t.line && (
                    <path
                      d={t.line}
                      fill="none"
                      stroke={p}
                      strokeWidth={it.w}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                  {t.fill && <path d={t.fill} fill={p} />}
                </g>
              );
            }
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
      <div className={'gifLayer' + (under ? ' under' : '') + (layer ? ' own' : '')}>
        {items
          .filter(it => it.k === 'g')
          .map(it => {
            const moving = gifsPlay && (it.mode === 'loop' || (it.mode === 'gentle' && playing.has(it.id)));
            return (
              <Picture
                key={it.id}
                it={it}
                src={moving ? src(it.src) : stillSrc(it.still, it.w || 0, it.h || 0, res)}
                // (moving, a GIF is as it is: its look is for its still)
                look={moving || !looks ? '' : it.lk === 'none' ? '' : it.lk || look}
                res={res}
              />
            );
          })}
      </div>
    </>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
