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
