/*
===============================================================================
 Family Chalk Planner | Server | theme.ts
===============================================================================
 Version:   1.2.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Updated:   2026-11-21

 Purpose:
     Board style ("theme"): a preset name plus the family's tweaks to it,
     the background, and whether it changes with the season. The presets
     themselves live in the page; the server only checks the shape.
       kv 'theme'  { p: preset, o: { key: value }, s?: background, z?: 1 }
     And the styles the family saved by name, to pick again (or share):
       kv 'savedStyles'  [{ name, theme }]  (up to 20)
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    Art, stamps, each month's options, board
                        claude    style, meals and jars in their own
                        colby     TypeScript modules.

                                  Immich photos, slideshow extras, a filled-in
                                  today, and the frame's thickness.

 0.14.0    2026-11-07   joshua    The board style can use any of the fonts.
                        claude

 0.16.0    2026-11-11   joshua    The names of its colors, for a month's own.
                        claude

 0.16.1    2026-11-11   joshua    Checks a tweak or a style's name for a
                        claude    month's own look too.

 1.1.0    2026-11-17   joshua    More backgrounds, and a photo of your own
                        claude    (one the board keeps) as the background.

 1.1.2    2026-11-20   joshua    The backgrounds and the photo check, shared
                        claude    with month.ts.

 1.2.0    2026-11-21   joshua    Saved styles, by name (up to 20).
                        claude
===============================================================================
*/

import type { Express } from 'express';
import type { Kv } from './kv.ts';
import { BOARD_FONTS, CLASSIC_FONT } from '../shared/fonts.ts';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------- //
// | What a style may hold | //
// ------------------------- //
const FONTS = [...BOARD_FONTS.map(b => b.id), CLASSIC_FONT.id];
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
// a tweak a style may hold: a known part, with a value that part can take
// (a month can have its own style and tweaks too: server/month.ts)
export function okTweak(k: string, v: unknown): v is string {
  const kind = TWEAKS[k];
  if (typeof v !== 'string' || !kind) return false;
  return kind === 'color' ? /^#[0-9a-fA-F]{6}$/.test(v) : kind === 'font' ? FONTS.includes(v) : kind.includes(v);
}
export const okPreset = (v: unknown): v is string => typeof v === 'string' && /^[a-z]{2,20}$/.test(v);
export const SURFACES = [
  'slate',
  'green',
  'blue',
  'cork',
  'kraft',
  'white',
  'wood',
  'glass',
  'linen',
  'peg',
  // 1.1
  'navy',
  'burgundy',
  'felt',
  'brick',
  'burlap',
  'barn',
  'graph',
  'photo' // a photo of your own: img says which (one the board keeps, /api/media/...)
];
export const okImg = (v: unknown): v is string =>
  typeof v === 'string' && /^\/api\/media\/[a-z0-9]{16}\.(jpg|png|webp)$/.test(v);

export interface Theme {
  p: string;
  o: Record<string, string>;
  s?: string;
  z?: 1;
  img?: string; // s 'photo': the photo
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------------------------- //
// | Checking what a screen sends | //
// -------------------------------- //
export function cleanTheme(input: unknown): Theme {
  const t = (input || {}) as Record<string, unknown>;
  const out: Theme = { p: okPreset(t.p) ? t.p : 'classic', o: {} };
  if (typeof t.s === 'string' && SURFACES.includes(t.s) && t.s !== 'slate') out.s = t.s;
  if (out.s === 'photo') {
    if (okImg(t.img)) out.img = t.img;
    else delete out.s; // no photo yet: the slate
  }
  if (t.z === 1 || t.z === true) out.z = 1; // "change with the season" (off unless turned on)
  for (const [k, v] of Object.entries((t.o || {}) as Record<string, unknown>)) if (okTweak(k, v)) out.o[k] = v;
  return out;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------- //
// | The routes | //
// -------------- //
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

  // ------------------- //
  // | Saved styles | //
  // ------------------- //
  // Styles the family saved by name (up to 20), to pick again later; each   //
  // one checked like the board style itself.                                //
  app.get('/api/styles', (_req, res) => res.json(kv.get<SavedStyle[]>('savedStyles') || []));
  app.post('/api/styles', (req, res) => {
    const list = (req.body || {}).styles;
    if (!Array.isArray(list)) return res.status(400).json({ error: 'bad styles' });
    const out: SavedStyle[] = list
      .slice(0, 20)
      .map((x: { name?: unknown; theme?: unknown }) => ({
        name: String(x?.name || '')
          .trim()
          .slice(0, 30),
        theme: cleanTheme(x?.theme)
      }))
      .filter(x => x.name);
    kv.set('savedStyles', out);
    broadcast('styles', {});
    res.json(out);
  });
}
interface SavedStyle {
  name: string;
  theme: Theme;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
