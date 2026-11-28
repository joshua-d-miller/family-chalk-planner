/*
===============================================================================
 Family Chalk Planner | Screens | Helpers | chalk.ts
===============================================================================
 Version:   1.3.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-28
 Updated:   2026-11-28

 Purpose:
     The chalk look (🎨 Board style → Chalk), drawn once and kept, never on
     every frame (a wall's browser can be slow):
       - the board's grain (stick chalk): one tile of noise, chalk caught
         on the bumps and skipping the dips, laid over everything chalk
         (the calendar, the Notes column, the art) as a mask;
       - a hand-drawn grid: chalk lines stamped dot by dot, with a little
         wobble and pressure, ends that overshoot;
       - a used board: felt-eraser swipes, the ghosts of old writing and
         dust along the bottom, painted into the background.
     Each is made at the screen's own pixel count, so it's sharp at 4K,
     and from a fixed seed, so it looks the same every time.

 Used by:
     web/src/board/Board.tsx
     web/src/board/Month.tsx
     web/src/lib/surface.ts
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.3.0     2026-11-28   joshua    New file (from the chalk mockups).
                        claude
===============================================================================
*/

// a small, fast random number from a seed (the same seed, the same board)
export function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------- //
// | The board's grain | //
// ------------------- //
// A 256 board-pixel tile of noise that repeats without a seam, made once   //
// for each resolution and strength. White where chalk sticks, see-through //
// where it skips: used as a CSS mask.                                      //
export const GRAIN_TILE = 256;
const STRENGTH = { light: [150, 105], normal: [115, 140], heavy: [70, 185] } as const;
const grains = new Map<string, string>();
export function grainTile(res: number, level: string) {
  const key = res + level;
  const had = grains.get(key);
  if (had) return had;
  const [floor, span] = STRENGTH[level as keyof typeof STRENGTH] || STRENGTH.normal;
  const n = Math.round(GRAIN_TILE * res);
  const v = new Float32Array(n * n);
  const r = seeded(42);
  for (const [g, w] of [
    [6, 0.38],
    [14, 0.3],
    [34, 0.2],
    [80, 0.12]
  ]) {
    const grid = Float32Array.from({ length: g * g }, r);
    for (let y = 0; y < n; y++) {
      const fy = (y / n) * g;
      const y0 = fy | 0;
      const ty = fy - y0;
      const sy = ty * ty * (3 - 2 * ty);
      const y1 = (y0 + 1) % g;
      for (let x = 0; x < n; x++) {
        const fx = (x / n) * g;
        const x0 = fx | 0;
        const tx = fx - x0;
        const sx = tx * tx * (3 - 2 * tx);
        const x1 = (x0 + 1) % g;
        const a = grid[y0 * g + x0];
        const b = grid[y0 * g + x1];
        const c = grid[y1 * g + x0];
        const d = grid[y1 * g + x1];
        v[y * n + x] += w * (a + (b - a) * sx + (c - a + (a - b + d - c) * sx) * sy);
      }
    }
  }
  const cv = document.createElement('canvas');
  cv.width = cv.height = n;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(n, n);
  for (let i = 0; i < n * n; i++) {
    const k = Math.min(1, Math.max(0, (v[i] - 0.33) / 0.22));
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255;
    img.data[i * 4 + 3] = (floor + span * k * k) * (r() < 0.06 ? 0.4 : 1); // (tiny pits)
  }
  ctx.putImageData(img, 0, 0);
  const url = cv.toDataURL();
  grains.set(key, url);
  return url;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------- //
// | A line of chalk | //
// ------------------- //
// Tiny dots along it: a slight wobble, pressure that comes and goes, ends //
// that overshoot by a hair. ctx.fillStyle is the chalk's color.           //
export function chalkLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  r: () => number,
  width = 1.9
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let len = Math.hypot(dx, dy);
  if (!len) return;
  const ux = dx / len;
  const uy = dy / len;
  const e1 = r() * 4 - 1;
  const sx = x1 - ux * e1;
  const sy = y1 - uy * e1;
  const ph = r() * 6;
  const fr = 0.008 + r() * 0.015;
  len += e1 + r() * 4 - 1;
  let o = 0;
  for (let s = 0; s < len; s += 0.5) {
    o = Math.max(-1.1, Math.min(1.1, o + (r() - 0.5) * 0.14));
    const p = 0.78 + 0.22 * Math.sin(s * fr + ph);
    for (let k = 0; k < 3; k++) {
      const off = o + (r() - 0.5) * width;
      const d = 0.5 + r() * 0.9;
      ctx.globalAlpha = 0.85 * p * (0.4 + 0.6 * r());
      ctx.fillRect(sx + ux * s - uy * off, sy + uy * s + ux * off, d, d);
    }
  }
  ctx.globalAlpha = 1;
}

// the calendar's lines, by hand: a box of `cols` x `rows`, w x h board pixels
export function handGrid(
  cv: HTMLCanvasElement,
  w: number,
  h: number,
  cols: number,
  rows: number,
  color: string,
  res: number,
  seed: number
) {
  cv.width = Math.round(w * res);
  cv.height = Math.round(h * res);
  const ctx = cv.getContext('2d')!;
  ctx.setTransform(res, 0, 0, res, 0, 0);
  ctx.fillStyle = color;
  const r = seeded(seed);
  const j = () => (r() - 0.5) * 2; // each line a little off true
  for (let i = 0; i <= rows; i++) {
    const y = Math.min(h - 1, (i / rows) * h + 0.5);
    chalkLine(ctx, 0, y + j(), w, y + j(), r);
  }
  for (let i = 0; i <= cols; i++) {
    const x = Math.min(w - 1, (i / cols) * w + 0.5);
    chalkLine(ctx, x + j(), 0, x + j(), h, r);
  }
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------- //
// | A used board | //
// ---------------- //
// Painted into a chalkboard's background (lib/surface.ts), once: felt      //
// eraser swipes (soft at the edges, streaky the way they were dragged), the //
// ghosts of old writing, dust gathered along the bottom. level 1: lightly   //
// used, 2: well used. dust: the board's chalk color, "r,g,b".              //
let felt: HTMLCanvasElement | null = null;
function eraser() {
  if (felt) return felt;
  const bw = 160;
  const bh = 56;
  felt = document.createElement('canvas');
  felt.width = bw;
  felt.height = bh;
  const g = felt.getContext('2d')!;
  const r = seeded(9);
  g.save();
  g.scale(1, bh / bw);
  const rg = g.createRadialGradient(bw / 2, bw / 2, 0, bw / 2, bw / 2, bw / 2);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(0.55, 'rgba(255,255,255,0.55)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, bw, bw);
  g.restore();
  g.globalCompositeOperation = 'destination-out';
  for (let y = 0; y < bh; y += 1.5) {
    g.globalAlpha = r() * 0.8;
    g.fillRect(0, y, bw, 1 + r());
  }
  return felt;
}
export function paintWear(g: CanvasRenderingContext2D, W: number, H: number, level: number, dust: string) {
  if (!level) return;
  const r = seeded(7 + level);
  // the eraser, tinted the board's chalk color
  const b = eraser();
  const tint = document.createElement('canvas');
  tint.width = b.width;
  tint.height = b.height;
  const t = tint.getContext('2d')!;
  t.drawImage(b, 0, 0);
  t.globalCompositeOperation = 'source-in';
  t.fillStyle = `rgb(${dust})`;
  t.fillRect(0, 0, b.width, b.height);
  const bw = W / 9;
  const bh = bw * 0.35;
  for (let n = 0; n < 4 * level; n++) {
    // a swipe: back and forth along a gentle curve, the way an arm moves
    const x0 = r() * W * 0.75;
    const y0 = H * (0.1 + r() * 0.8);
    const len = W * (0.2 + r() * 0.3);
    const tilt = (r() - 0.5) * 0.35;
    const sweeps = 2 + ((r() * 3) | 0);
    for (let s = 0; s < sweeps; s++) {
      const yOff = (s - sweeps / 2) * bh * 0.55;
      for (let d = 0; d < len; d += bw * 0.06) {
        const u = d / len;
        g.save();
        g.globalAlpha = (0.004 + 0.006 * Math.sin(u * Math.PI)) * Math.min(level, 1.4);
        g.translate(x0 + (s % 2 ? len - d : d), y0 + yOff - Math.sin(u * Math.PI) * bh * 0.6);
        g.rotate(tilt + Math.cos(u * Math.PI) * 0.25);
        g.drawImage(tint, -bw / 2, -bh / 2, bw, bh);
        g.restore();
      }
    }
  }
  // ghosts of old writing: barely there (never mistaken for an event), soft (drawn three times, a hair apart:
  // no canvas blur, which older Safari ignores)
  g.save();
  g.font = `${Math.round(W / 40)}px Kalam, cursive`;
  g.fillStyle = `rgba(${dust},${0.0045 * level})`;
  for (const w of ['Dentist 3:30', 'Pizza night', 'Bus 7:40', 'Library books', 'Soccer']) {
    const x = r() * W * 0.8;
    const y = H * (0.15 + r() * 0.75);
    g.fillText(w, x, y);
    g.fillText(w, x + 0.8, y + 0.6);
    g.fillText(w, x - 0.6, y + 0.9);
  }
  g.restore();
  // dust along the bottom, where it falls
  for (let i = 0; i < W * 0.8 * level; i++) {
    const s = 0.4 + r() * 1.1;
    g.fillStyle = `rgba(${dust},${0.04 + r() * 0.12})`;
    g.fillRect(r() * W, H - Math.pow(r(), 2.4) * H * 0.12, s, s);
  }
}
