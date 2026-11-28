/*
===============================================================================
 Family Chalk Planner | Screens | Helpers | pictureLook.ts
===============================================================================
 Version:   1.3.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-28
 Updated:   2026-11-28

 Purpose:
     A picture on the board drawn in chalk (its 🖍 Look, or the board
     style's): colored in with short marker strokes, each taking the color
     under it (Chalk marker), with a white highlight, a white outline like a
     sticker, only its outline in its own colors, or in stick chalk (wider
     strokes in two layers and the board's grain). Each is made once, at the
     size it's shown on this screen, one at a time when the screen is idle,
     and kept: the board shows the copy, it never redraws while it hangs.

 Used by:
     web/src/board/Art.tsx
     web/src/board/draw/Draw.tsx
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.3.0     2026-11-28   joshua    New file (from the chalk mockups).
                        claude
===============================================================================
*/

import { useEffect, useState } from 'react';
import { grainCanvas, seeded } from './chalk.ts';

// '' : the board style's; 'none': as it is
export const LOOKS: [string, string][] = [
  ['', 'Board style’s'],
  ['none', 'As is'],
  ['marker', 'Chalk marker'],
  ['shine', 'Marker + highlight'],
  ['sticker', 'White outline'],
  ['doodle', 'Colored outline'],
  ['chalk', 'Stick chalk']
];

type Strokes = {
  w: number;
  gap: number;
  angle: number;
  jitter: number;
  shade: number;
  alpha: number;
  white: number;
  sat: number;
};
const MARKER: Strokes = {
  w: 1 / 15,
  gap: 0.55,
  angle: -0.6,
  jitter: 0.1,
  shade: 0.07,
  alpha: 0.8,
  white: 0.08,
  sat: 1
};
const STICK: Strokes = {
  w: 1 / 9,
  gap: 0.5,
  angle: -0.6,
  jitter: 0.25,
  shade: 0.06,
  alpha: 0.55,
  white: 0.45,
  sat: 0.85
};
const STICK2: Strokes = { ...STICK, angle: -0.25, alpha: 0.3 };
const canvasOf = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

// colored in with strokes; each short piece takes the color under it, so colors change where the picture's do
function colorIn(
  sd: Uint8ClampedArray,
  W: number,
  H: number,
  o: CanvasRenderingContext2D,
  r: () => number,
  k: Strokes
) {
  const S = Math.max(W, H);
  const w = S * k.w;
  const ang = k.angle + (r() - 0.5) * 0.3;
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  const span = S * 1.5;
  o.lineCap = 'round';
  for (let t = -span / 2; t < span / 2; t += w * k.gap) {
    const a2 = ang + (r() - 0.5) * k.jitter;
    const ex = Math.cos(a2);
    const ey = Math.sin(a2);
    const cx = W / 2 - dy * t;
    const cy = H / 2 + dx * t;
    const shade = (r() - 0.5) * k.shade; // each stroke a little lighter or darker
    for (let s = -span / 2; s < span / 2; s += w * 0.8) {
      const px = cx + ex * s;
      const py = cy + ey * s;
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      const i = ((py | 0) * W + (px | 0)) * 4;
      if (sd[i + 3] < 30) continue;
      const l = 0.3 * sd[i] + 0.59 * sd[i + 1] + 0.11 * sd[i + 2];
      const ch = (c: number) =>
        Math.max(0, Math.min(255, k.white * 255 + (1 - k.white) * (l + (sd[i + c] - l) * k.sat) + shade * 255)) | 0;
      o.strokeStyle = `rgb(${ch(0)},${ch(1)},${ch(2)})`;
      o.globalAlpha = k.alpha * (0.85 + 0.15 * r());
      o.lineWidth = w * (0.85 + 0.3 * r());
      o.beginPath();
      o.moveTo(px - ex * w * 0.55, py - ey * w * 0.55);
      o.lineTo(px + ex * w * 0.55, py + ey * w * 0.55);
      o.stroke();
    }
  }
  o.globalAlpha = 1;
}
// the outside outline and where the colors change inside: white chalk, or the picture's own colors
function edges(sd: Uint8ClampedArray, W: number, H: number, colored: boolean) {
  const e = new ImageData(W, H);
  const row = W * 4;
  const lum = (i: number) => (sd[i + 3] * (0.3 * sd[i] + 0.59 * sd[i + 1] + 0.11 * sd[i + 2] + 120)) / 375;
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = (y * W + x) * 4;
      const m = Math.min(255, Math.hypot(lum(i + 4) - lum(i - 4), lum(i + row) - lum(i - row)) * 2.4);
      if (m < 40) continue;
      let j = i; // the color: the most solid neighbor's
      for (const n of [i - 4, i + 4, i - row, i + row]) if (sd[n + 3] > sd[j + 3]) j = n;
      e.data[i] = colored ? Math.min(255, sd[j] * 0.8 + 50) : 241;
      e.data[i + 1] = colored ? Math.min(255, sd[j + 1] * 0.8 + 50) : 239;
      e.data[i + 2] = colored ? Math.min(255, sd[j + 2] * 0.8 + 50) : 230;
      e.data[i + 3] = m;
    }
  const c = canvasOf(W, H);
  c.getContext('2d')!.putImageData(e, 0, 0);
  return c;
}
// the shape grown by d pixels all round (the picture drawn around a circle), in one color
function grown(src: HTMLCanvasElement, d: number, color?: string) {
  const c = canvasOf(src.width, src.height);
  const g = c.getContext('2d')!;
  for (let a = 0; a < 16; a++) g.drawImage(src, Math.cos(a * 0.3927) * d, Math.sin(a * 0.3927) * d);
  g.drawImage(src, 0, 0);
  if (color) {
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
  }
  return c;
}

// the picture in its look, W x H screen pixels (a white outline: a little room round it for the outline)
export function drawLook(img: CanvasImageSource, W: number, H: number, look: string, res: number) {
  const pad = look === 'sticker' ? Math.round(Math.max(W, H) / 14) : 0;
  const src = canvasOf(W, H);
  const sg = src.getContext('2d', { willReadFrequently: true })!;
  sg.drawImage(img, pad, pad, W - 2 * pad, H - 2 * pad);
  const sd = sg.getImageData(0, 0, W, H).data;
  const out = canvasOf(W, H);
  const o = out.getContext('2d')!;
  const r = seeded(W * 31 + H + look.length);
  const S = Math.max(W, H);
  if (look === 'doodle') {
    const e = edges(sd, W, H, true);
    const d = S / 110;
    for (let a = 0; a < 8; a++) o.drawImage(e, Math.cos(a * 0.785) * d, Math.sin(a * 0.785) * d);
    return out;
  }
  const fill = canvasOf(W, H);
  const f = fill.getContext('2d')!;
  colorIn(sd, W, H, f, r, look === 'chalk' ? STICK : MARKER);
  if (look === 'chalk') colorIn(sd, W, H, f, r, STICK2);
  // marker stays inside the lines; stick chalk wanders a little past them
  f.globalCompositeOperation = 'destination-in';
  f.drawImage(look === 'chalk' ? grown(src, S / 120) : src, 0, 0);
  if (look === 'sticker') {
    o.drawImage(grown(src, S / 16, '#ffffff'), 0, 0);
    o.globalCompositeOperation = 'destination-out'; // the little gap between the outline and the picture
    o.drawImage(grown(src, S / 40, '#000'), 0, 0);
    o.globalCompositeOperation = 'source-over';
  }
  o.drawImage(fill, 0, 0);
  if (look === 'shine') {
    // a white highlight on the shiny side, kept inside the shape
    let x0 = W;
    let y0 = H;
    let x1 = 0;
    let y1 = 0;
    for (let y = 0; y < H; y += 2)
      for (let x = 0; x < W; x += 2)
        if (sd[(y * W + x) * 4 + 3] > 128) {
          x0 = Math.min(x0, x);
          y0 = Math.min(y0, y);
          x1 = Math.max(x1, x);
          y1 = Math.max(y1, y);
        }
    if (x1 > x0) {
      const hl = canvasOf(W, H);
      const g = hl.getContext('2d')!;
      const rr = Math.min(x1 - x0, y1 - y0) * 0.34;
      g.strokeStyle = '#fff';
      g.lineCap = 'round';
      g.globalAlpha = 0.85;
      g.lineWidth = S / 26;
      g.beginPath();
      g.arc((x0 + x1) / 2, (y0 + y1) / 2, rr, Math.PI * 1.05, Math.PI * 1.35);
      g.stroke();
      g.beginPath();
      g.arc((x0 + x1) / 2, (y0 + y1) / 2, rr, Math.PI * 1.45, Math.PI * 1.52);
      g.stroke();
      g.globalCompositeOperation = 'destination-in';
      g.drawImage(src, 0, 0);
      o.drawImage(hl, 0, 0);
    }
  }
  if (look === 'chalk') {
    const e = edges(sd, W, H, true); // outlined in its own colors, pressed a little harder
    o.drawImage(e, S / 300, 0);
    o.drawImage(e, -S / 300, S / 340);
    // the board's grain, finer on a picture: chalk laid on its side catches only the bumps
    o.globalCompositeOperation = 'destination-in';
    const p = o.createPattern(grainCanvas(res, 'normal'), 'repeat')!;
    p.setTransform(new DOMMatrix().scale(0.4));
    o.fillStyle = p;
    o.fillRect(0, 0, W, H);
  }
  return out;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------------- //
// | Made once, and kept | //
// ---------------------- //
// One at a time, when the screen has a moment (a wall full of art never   //
// stutters); each kept as a small file in memory, by picture, look and   //
// size. A picture that can't be read here (or a look the screen can't    //
// draw) shows as it is.                                                  //
const made = new Map<string, Promise<string | null>>();
let queue: Promise<unknown> = Promise.resolve();
const idle = () =>
  new Promise<void>(ok =>
    'requestIdleCallback' in window
      ? (window as unknown as { requestIdleCallback: (f: () => void, o: object) => void }).requestIdleCallback(ok, {
          timeout: 2000
        })
      : setTimeout(ok, 16)
  );
function looked(src: string, look: string, W: number, H: number, res: number) {
  const key = `${src}|${look}|${W}x${H}`;
  let p = made.get(key);
  if (!p) {
    p = (queue = queue.then(async () => {
      try {
        const img = new Image();
        img.src = src;
        await img.decode();
        await idle();
        const c = drawLook(img, W, H, look, res);
        const blob = await new Promise<Blob | null>(ok => c.toBlob(ok));
        return blob ? URL.createObjectURL(blob) : null;
      } catch {
        return null;
      }
    })) as Promise<string | null>;
    made.set(key, p);
  }
  return p;
}
// the picture's address, in its look (as it is until that's made, or if it can't be)
export function useLook(src: string, look: string, w: number, h: number, res: number) {
  const W = Math.max(8, Math.round(w * res));
  const H = Math.max(8, Math.round(h * res));
  const on = !!src && !!look && look !== 'none';
  const [out, setOut] = useState<string | null>(null);
  useEffect(() => {
    if (!on) return setOut(null);
    let live = true;
    void looked(src, look, W, H, res).then(u => live && setOut(u));
    return () => {
      live = false;
    };
  }, [on, src, look, W, H, res]);
  return (on && out) || src;
}
