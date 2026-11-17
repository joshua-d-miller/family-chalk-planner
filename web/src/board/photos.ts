/*
===============================================================================
 Family Chalk Planner | Screens | Board | photos.ts
===============================================================================
 Version:   1.1.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-07
 Updated:   2026-11-17

 Purpose:
     The family's photos (the shared album or Immich): framing them on the
     people in them, and taking them in a shuffled order so every photo
     shows once before any repeats.

 Used by:
     web/src/board/Board.tsx
     web/src/board/Notes.tsx
     web/src/board/Slideshow.tsx
     web/src/board/TitlePhotos.tsx
     web/src/board/editors/PhotosEditor.tsx
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    The new board: the family's style, each
                        colby     month's title and holiday border, polaroids,
                        claude    drawn jars.

                                  The new wall board: the overnight slideshow,
                                  the photo frame, the day view, reminders and
                                  timers.

 1.1.0    2026-11-17   joshua    offline and few from the board, and small
                        claude    pictures for picking.
===============================================================================
*/

import { url } from '../lib/api.ts';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------- //
// | Photos | //
// ---------- //
export type Photo = { id: string; w: number; h: number; date: number; faces?: number[][] };
export type PhotoCfg = {
  frame: boolean;
  night: boolean;
  from: string;
  to: string;
  every: number;
  dim: number;
  showEvents: boolean;
  showTemp: boolean;
  showReminders: boolean;
  sidePanel: boolean;
};
export type Photos = {
  photos: Photo[];
  cfg: PhotoCfg;
  offline?: boolean; // a big album that can't be reached right now
  few?: boolean; // only the last few photos are kept on the board
};

export const photoSrc = (p: Photo) => url('api/photos/img/' + p.id);
// a small picture for picking (a big album's aren't copied onto the board for it)
export const thumbSrc = (p: Photo) => url('api/photos/thumb/' + p.id);

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------- //
// | Faces | //
// --------- //
type FBox = { x1: number; y1: number; x2: number; y2: number; none?: boolean };
function faceBox(p: Photo, pad: boolean, only?: number[]): FBox {
  if (!p.faces?.length) return { x1: 0.5, y1: 0.42, x2: 0.5, y2: 0.42, none: true }; // no faces: a little above center
  const b = { x1: 1, y1: 1, x2: 0, y2: 0 };
  let fw = 0;
  let fh = 0;
  for (const f of only ? [only] : p.faces) {
    b.x1 = Math.min(b.x1, f[0]);
    b.y1 = Math.min(b.y1, f[1]);
    b.x2 = Math.max(b.x2, f[0] + f[2]);
    b.y2 = Math.max(b.y2, f[1] + f[3]);
    fw = Math.max(fw, f[2]);
    fh = Math.max(fh, f[3]);
  }
  if (pad) {
    // hair above, chin and shoulders below
    b.x1 -= fw * 0.6;
    b.x2 += fw * 0.6;
    b.y1 -= fh * 0.5;
    b.y2 += fh * 0.9;
  } else {
    b.x1 -= fw * 0.15;
    b.x2 += fw * 0.15;
    b.y1 -= fh * 0.25;
    b.y2 += fh * 0.15;
  }
  return { x1: Math.max(0, b.x1), y1: Math.max(0, b.y1), x2: Math.min(1, b.x2), y2: Math.min(1, b.y2) };
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------- //
// | Framing | //
// ----------- //
// How to fill a bw x bh box with photo p (object-fit: cover): where to aim, //
// whether the people still fit, and how far a small frame can zoom in so    //
// the people fill it                                                        //
export function frameFor(p: Photo, bw: number, bh: number) {
  const iw = p.w || 4;
  const ih = p.h || 3;
  const s = Math.max(bw / iw, bh / ih);
  const rw = iw * s;
  const rh = ih * s;
  // everyone with room around them, then everyone tight, then just the biggest face
  const big = (p.faces || []).slice().sort((a, b) => b[2] * b[3] - a[2] * a[3])[0];
  const tries = [faceBox(p, true), faceBox(p, false)];
  if (big && p.faces!.length > 1) tries.push(faceBox(p, true, big), faceBox(p, false, big));
  for (let i = 0; i < tries.length; i++) {
    const f = tries[i];
    const ok = (f.x2 - f.x1) * rw <= bw + 1 && (f.y2 - f.y1) * rh <= bh + 1;
    if (ok || i === tries.length - 1) {
      const cx = ((f.x1 + f.x2) / 2) * rw;
      const cy = ((f.y1 + f.y2) / 2) * rh;
      const ox = Math.min(Math.max(cx - bw / 2, 0), rw - bw);
      const oy = Math.min(Math.max(cy - bh / 2, 0), rh - bh);
      return {
        pos: `${(rw > bw + 0.5 ? (ox / (rw - bw)) * 100 : 50).toFixed(1)}% ${(rh > bh + 0.5 ? (oy / (rh - bh)) * 100 : 50).toFixed(1)}%`,
        ox: ((cx - ox) / bw) * 100,
        oy: ((cy - oy) / bh) * 100,
        fits: ok && i < 2,
        rw,
        rh,
        x0: ox, // where the shown part starts, in the scaled photo
        y0: oy,
        zoom: f.none
          ? 1
          : Math.min(
              2.6,
              Math.max(1, 0.9 * Math.min(bw / Math.max(1, (f.x2 - f.x1) * rw), bh / Math.max(1, (f.y2 - f.y1) * rh)))
            )
      };
    }
  }
  return { pos: '50% 50%', ox: 50, oy: 50, fits: false, zoom: 1, rw: bw, rh: bh, x0: 0, y0: 0 };
}

// a polaroid's photo: zoomed in on the faces, slid to the middle, never past the photo's edges
export function zoomed(p: Photo, bw: number, bh: number) {
  const fr = frameFor(p, bw, bh);
  const z = fr.zoom;
  const tx = Math.min(0, Math.max(bw - bw * z, bw / 2 - (fr.ox / 100) * bw * z));
  const ty = Math.min(0, Math.max(bh - bh * z, bh / 2 - (fr.oy / 100) * bh * z));
  return {
    objectPosition: fr.pos,
    transformOrigin: '0 0',
    transform: `translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px) scale(${z.toFixed(2)})`
  };
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------- //
// | Shuffling | //
// ------------- //
// Every photo once before any repeats, never one that's already showing     //
export function shuffleBag<T extends { id: string }>() {
  let bag: T[] = [];
  return (pool: T[], showing: string[] = []): T | null => {
    if (!pool.length) return null;
    for (let round = 0; round < 2; round++) {
      if (!bag.length) {
        bag = pool.slice();
        for (let i = bag.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [bag[i], bag[j]] = [bag[j], bag[i]];
        }
      }
      for (let k = bag.length - 1; k >= 0; k--) {
        const p = bag[k];
        if (pool.some(x => x.id === p.id) && !showing.includes(p.id)) return bag.splice(k, 1)[0];
      }
      if (pool.length <= showing.length) break;
      bag = []; // only repeats left in this round: start a fresh one
    }
    return bag.pop() || pool[0];
  };
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
