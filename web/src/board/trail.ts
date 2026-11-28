/*
===============================================================================
 Family Chalk Planner | Screens | Board | trail.ts
===============================================================================
 Version:   1.3.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-28
 Updated:   2026-11-28

 Purpose:
     A flight path (✏️ Draw → Path): a line drawn as dashes, dots, dashes
     and dots, or little hearts, laid down one at a time along it, each a
     touch longer or shorter than the last, the way a hand does it. As SVG
     path data: sharp at any size, and the same every time (from where the
     line starts).

 Used by:
     web/src/board/Art.tsx
     test/trail.test.ts
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.3.0     2026-11-28   joshua    New file (from the flight path mockup).
                        claude
===============================================================================
*/

import { seeded } from '../lib/chalk.ts';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------------- //
// | Laying down a path | //
// ---------------------- //
// Each mark (a dash, a dot, a heart) placed along the line by how far along //
// it is, its length and gap each a little different.                        //
export const DASHES = ['dash', 'dots', 'dashdot', 'hearts'];
const f1 = (v: number) => (Math.round(v * 10) / 10).toString();

// along the line [x, y, x, y, …]: dashes as a line to stroke, dots and hearts as shapes to fill
export function trail(p: number[], w: number, style: string, seed: number): { line: string; fill: string } {
  const pts: [number, number][] = [];
  for (let i = 0; i + 1 < p.length; i += 2) pts.push([p[i], p[i + 1]]);
  const cum = [0];
  for (let i = 1; i < pts.length; i++)
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[cum.length - 1] || 0;
  let line = '';
  let fill = '';
  if (pts.length < 2 || total < 1) return { line, fill };
  let j = 0;
  const at = (s: number): [number, number, number] => {
    while (j < cum.length - 2 && cum[j + 1] < s) j++;
    while (j > 0 && cum[j] > s) j--;
    const [a, b] = [pts[j], pts[j + 1]];
    const u = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, Math.atan2(b[1] - a[1], b[0] - a[0])];
  };
  const r = seeded(seed);
  const vary = () => 0.85 + 0.3 * r();
  const dash = (s: number, len: number) => {
    let d = '';
    for (let q = s; q <= Math.min(total, s + len); q += 1.5) {
      const [x, y] = at(q);
      d += (d ? 'L' : 'M') + f1(x) + ' ' + f1(y);
    }
    line += d;
  };
  const dot = (s: number) => {
    const [x, y] = at(s);
    const rr = w * 0.62 * vary();
    fill += `M${f1(x - rr)} ${f1(y)}a${f1(rr)} ${f1(rr)} 0 1 0 ${f1(2 * rr)} 0a${f1(rr)} ${f1(rr)} 0 1 0 ${f1(-2 * rr)} 0Z`;
  };
  const heart = (s: number) => {
    const [x, y, a] = at(s);
    const z = w * 1.5;
    const c = Math.cos(a + Math.PI / 2);
    const sn = Math.sin(a + Math.PI / 2);
    const P = (u: number, v: number) => `${f1(x + u * c - v * sn)} ${f1(y + u * sn + v * c)}`;
    fill +=
      `M${P(0, z * 0.9)}C${P(-z * 1.9, -z * 0.2)} ${P(-z * 0.9, -z * 1.6)} ${P(0, -z * 0.55)}` +
      `C${P(z * 0.9, -z * 1.6)} ${P(z * 1.9, -z * 0.2)} ${P(0, z * 0.9)}Z`;
  };
  const gap = 2.4 * w + 3;
  for (let s = 0, n = 0; s < total - 1; n++) {
    if (style === 'dash' || (style === 'dashdot' && n % 2 === 0)) {
      const l = (3.2 * w + 2) * vary();
      dash(s, l);
      s += l + gap * vary();
    } else if (style === 'hearts') {
      heart(s);
      s += w * 4.5 + 8;
    } else {
      dot(s);
      s += style === 'dots' ? (w * 1.4 + 3) * vary() : (w * 0.8 + 2) * vary() + gap * 0.6;
    }
  }
  return { line, fill };
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------------- //
// | Where it ends | //
// ----------------- //
// Where a picture riding on the path lands, and which way it faces there.   //
// where the line ends, and which way it's going there (a picture riding on it faces that way)
export function endOf(p: number[]): { x: number; y: number; deg: number } {
  const n = p.length;
  const x = p[n - 2];
  const y = p[n - 1];
  // the direction over the last stretch (not just the last two points, which may be a jitter apart)
  let k = n - 4;
  while (k > 0 && Math.hypot(x - p[k], y - p[k + 1]) < 24) k -= 2;
  const deg = (Math.atan2(y - p[Math.max(k, 0) + 1], x - p[Math.max(k, 0)]) * 180) / Math.PI;
  return { x, y, deg };
}
