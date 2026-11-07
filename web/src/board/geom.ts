// Where things are on the board, in board pixels (the slate is 1252 x 642).
import { fontCss } from './Art.tsx';
import type { ArtItem } from './Art.tsx';

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

export function itemBox(it: ArtItem): Box {
  if (it.k === 't') return textBox(it);
  if (it.k === 'g') {
    const x = it.x || 0;
    const y = it.y || 0;
    const w = it.w || 0;
    const h = it.h || 0;
    return { x1: x - w / 2, y1: y - h / 2, x2: x + w / 2, y2: y + h / 2 };
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
// a copy moved by dx, dy and scaled by k around (cx, cy)
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
export const isClosedLine = (s: ArtItem) =>
  !s.k &&
  !!s.p &&
  s.p.length >= 8 &&
  Math.hypot(s.p[0] - s.p[s.p.length - 2], s.p[1] - s.p[s.p.length - 1]) <= Math.max(2.5, (s.w || 4) * 0.8);
