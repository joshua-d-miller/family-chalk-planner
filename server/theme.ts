// Board style ("theme"): a preset name plus the family's tweaks to it, the background, and whether it
// changes with the season. The presets themselves live in the page; the server only checks the shape.
//   kv 'theme'  { p: preset, o: { key: value }, s?: background, z?: 1 }
import type { Express } from 'express';
import type { Kv } from './kv.ts';

const FONTS = ['kalam', 'caveat', 'marker', 'pacifico', 'chalk', 'tall', 'scratchy', 'script', 'classic'];
// each tweak: a color, a font, or one of a few choices
const TWEAKS: Record<string, 'color' | 'font' | string[]> = {
  numF: 'font',
  numC: 'color',
  boxes: ['on', 'off'],
  todayC: 'color',
  todayS: ['ring', 'circle', 'heart', 'star', 'box', 'bg'], // bg: today's square filled in (from Colby Way's board)
  wkF: 'font',
  wkC: 'color',
  evF: 'font',
  evC: 'color',
  alldayC: 'color',
  holC: 'color',
  headF: 'font',
  notesC: 'color',
  mealsC: 'color',
  textF: 'font',
  textC: 'color',
  lineC: 'color',
  lineS: ['solid', 'dashed', 'dotted'],
  lineW: ['thin', 'normal', 'bold']
};
const SURFACES = ['slate', 'green', 'blue', 'cork', 'kraft', 'white', 'wood', 'glass', 'linen', 'peg'];

export interface Theme {
  p: string;
  o: Record<string, string>;
  s?: string;
  z?: 1;
}

export function cleanTheme(input: unknown): Theme {
  const t = (input || {}) as Record<string, unknown>;
  const out: Theme = { p: typeof t.p === 'string' && /^[a-z]{2,20}$/.test(t.p) ? t.p : 'classic', o: {} };
  if (typeof t.s === 'string' && SURFACES.includes(t.s) && t.s !== 'slate') out.s = t.s;
  if (t.z === 1 || t.z === true) out.z = 1; // "change with the season" (off unless turned on)
  for (const [k, v] of Object.entries((t.o || {}) as Record<string, unknown>)) {
    const kind = TWEAKS[k];
    if (typeof v !== 'string' || !kind) continue;
    const ok = kind === 'color' ? /^#[0-9a-fA-F]{6}$/.test(v) : kind === 'font' ? FONTS.includes(v) : kind.includes(v);
    if (ok) out.o[k] = v;
  }
  return out;
}

export function setup({
  app,
  kv,
  broadcast
}: {
  app: Express;
  kv: Kv;
  broadcast: (event: string, data: unknown) => void;
}) {
  app.get('/api/theme', (_req, res) => res.json(kv.get<Theme>('theme') || { p: 'classic', o: {} }));
  app.post('/api/theme', (req, res) => {
    const t = cleanTheme(req.body);
    kv.set('theme', t);
    broadcast('theme', t);
    res.json(t);
  });
}
