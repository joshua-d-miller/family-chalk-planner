/*
===============================================================================
 Family Chalk Planner | Server | month.ts
===============================================================================
 Version:   1.2.8
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-06
 Updated:   2026-11-24

 Purpose:
     Each month's own options: the typed title's style (or a hand-lettered
     one), what goes beside the month name (photos or room to draw), the
     holiday border, and which layout the month's art was placed on.
       month_meta(month)    { hideTitle, title, side, border, artPad, look }
       kv 'titleDefault'    the title style for months without their own
       kv 'borders'         { MM: border } borders that come back every
           year in that month

 Routes:
     GET    /api/meta
     POST   /api/meta
     POST   /api/border
     POST   /api/frame

 Used by:
     server/art.ts
     server/main.ts
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

 0.14.0    2026-11-07   joshua    A month saved by an older board has its
                        claude    photo choice completed before the screens
                                  get it.

                                  Month titles can use any of the fonts.

 0.16.0    2026-11-11   joshua    A month's own colors (look) over the board
                        claude    style's.

 0.16.1    2026-11-11   joshua    A month can have a style of its own, and its
                        claude    own fonts and lines, not just colors.

 1.1.2    2026-11-20   joshua    A month's own background (s, and img for a
                        claude    photo of your own).

 1.2.8    2026-11-24   joshua    Only a listed tweak's name is ever kept in
                        claude    a month's look.
===============================================================================
*/

import type { Express } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { isYm } from './dates.ts';
import type { Kv } from './kv.ts';
import { BOARD_FONTS } from '../shared/fonts.ts';
import { SURFACES, TWEAKS, okImg, okPreset, okTweak } from './theme.ts';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------- //
// | Types | //
// --------- //
export interface TitleStyle {
  f: number; // font
  c: string; // color
  o: string | null; // outline color, or none
  z: number; // size: 56 / 68 / 80 / 90 (S M L XL)
}
export interface Border {
  items: string[]; // up to 8 pictures, repeated around the edge
  color: string; // for the chalk drawings
  size: 's' | 'm' | 'l';
}
export interface Side {
  mode: 'photos' | 'art';
  pick: 'random' | 'chosen';
  ids: string[]; // chosen photos (kept while the month is on 'art', for when photos come back)
}
interface Stored {
  hideTitle?: boolean;
  title?: TitleStyle;
  side?: Side;
  border?: Border | { off: true }; // off: none this year, even if there's a yearly one
  artPad?: number;
  look?: Record<string, string>; // this month's own style (p) and tweaks over the board style's
}
// a month's own look: a style of its own (p: 'holiday') and tweaks to it
// or to the board style (colors, fonts, lines), and a background of its own
// (s, and img for a photo of your own); anything else left out
function cleanLook(v: unknown): Record<string, string> | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const raw = v as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const [k, c] of Object.entries(raw)) {
    if (typeof c !== 'string') continue;
    if (k === 's') {
      if (SURFACES.includes(c) && (c !== 'photo' || okImg(raw.img))) out.s = c;
    } else if (k === 'img') {
      if (raw.s === 'photo' && okImg(c)) out.img = c;
    } else if (k === 'p') {
      if (okPreset(c)) out.p = c;
    } else if (Object.hasOwn(TWEAKS, k) && okTweak(k, c)) out[k] = c; // only a listed tweak's name is ever kept
  }
  return Object.keys(out).length ? out : undefined;
}
export interface MonthMeta extends Omit<Stored, 'border'> {
  border?: Border;
  borderYearly?: boolean;
  defaultTitle?: TitleStyle;
  artPad: number;
  boardPad?: number; // the frame's thickness
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------------------------- //
// | Checking what a screen sends | //
// -------------------------------- //
const BORDER_PAD = { s: 26, m: 32, l: 40 }; // picture size + 6 (the page's BORDER_SZ)
const hex = (v: unknown) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : null);

function cleanTitle(t: unknown): TitleStyle | null {
  if (!t || typeof t !== 'object') return null;
  const v = t as Record<string, unknown>;
  return {
    f: Math.min(Math.max(Math.trunc(Number(v.f)) || 0, 0), BOARD_FONTS.length - 1),
    c: hex(v.c) || '#F6B3CB',
    o: hex(v.o),
    z: [56, 68, 80, 90].includes(Number(v.z)) ? Number(v.z) : 68
  };
}
function cleanSide(v: unknown): Side | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const s = v as Record<string, unknown>;
  const ids = (Array.isArray(s.ids) ? s.ids : [])
    .filter((id): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(id))
    .slice(0, 8);
  return {
    mode: s.mode === 'art' ? 'art' : 'photos',
    pick: s.pick === 'chosen' && ids.length ? 'chosen' : 'random',
    ids
  };
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------- //
// | The routes | //
// -------------- //
export function setup({
  app,
  db,
  kv,
  broadcast,
  pictureOk,
  chalk
}: {
  app: Express;
  db: DatabaseSync;
  kv: Kv;
  broadcast: (event: string, data: unknown) => void;
  pictureOk: (name: string) => boolean; // a clipart or chalk-drawing name the board has
  chalk: string; // the default color for chalk drawings
}) {
  db.exec('CREATE TABLE IF NOT EXISTS month_meta (month TEXT PRIMARY KEY, data TEXT NOT NULL)');
  const qGet = db.prepare('SELECT data FROM month_meta WHERE month = ?');
  const qSet = db.prepare(
    'INSERT INTO month_meta (month, data) VALUES (?, ?) ON CONFLICT(month) DO UPDATE SET data = excluded.data'
  );
  const stored = (ym: string): Stored => {
    const r = qGet.get(ym) as { data: string } | undefined;
    return r ? JSON.parse(r.data) : {};
  };
  const store = (ym: string, m: Stored) => qSet.run(ym, JSON.stringify(m));
  const yearly = () => kv.get<Record<string, Border>>('borders') || {};

  // --------------------------------- //
  // | A month as the screens see it | //
  // --------------------------------- //
  // A month as the screens see it: with the default title style, and its    //
  // border worked out                                                       //
  function metaFor(ym: string): MonthMeta {
    const m = stored(ym) as Stored & Partial<MonthMeta>;
    const d = kv.get<TitleStyle>('titleDefault');
    if (d) m.defaultTitle = d;
    const pad = kv.get<number>('boardPad');
    if (pad != null) m.boardPad = pad;
    m.artPad = m.artPad || 0; // art from before borders: placed with no border
    if (m.side) m.side = cleanSide(m.side); // saved by an older board: complete it (ids, pick)
    const every = yearly()[ym.slice(5)];
    if (m.border && 'off' in m.border) delete m.border;
    else if (!m.border && every) {
      m.border = every;
      m.borderYearly = true;
    }
    return m as MonthMeta;
  }
  // ---------------------- //
  // | The border's width | //
  // ---------------------- //
  // How much the border takes from the calendar's edges (0 = no border)     //
  const padOf = (m: MonthMeta) => (m.border ? BORDER_PAD[m.border.size] || BORDER_PAD.m : 0);

  function cleanBorder(b: unknown): Border | null {
    if (!b || typeof b !== 'object' || !Array.isArray((b as Border).items)) return null;
    const v = b as Record<string, unknown>;
    const items = [
      ...new Set(
        (v.items as unknown[]).filter(
          (n): n is string => typeof n === 'string' && /^[a-z0-9-]{1,64}$/.test(n) && pictureOk(n)
        )
      )
    ].slice(0, 8);
    if (!items.length) return null;
    const size = ['s', 'm', 'l'].includes(v.size as string) ? (v.size as Border['size']) : 'm';
    return { items, color: (hex(v.color) || chalk).toUpperCase(), size };
  }

  // --------------------- //
  // | A month's options | //
  // --------------------- //
  app.get('/api/meta', (req, res) => {
    if (!isYm(req.query.ym)) return res.status(400).json({ error: 'bad month' });
    res.json(metaFor(req.query.ym));
  });

  // -------------------------------------- //
  // | The title, and what goes beside it | //
  // -------------------------------------- //
  // The title (typed style, or hand-lettered) and what goes beside it.      //
  // makeDefault: for every month.                                           //
  app.post('/api/meta', (req, res) => {
    const { ym, hideTitle, title, makeDefault, side, look } = req.body || {};
    if (!isYm(ym)) return res.status(400).json({ error: 'bad month' });
    const cur = stored(ym);
    const meta: Stored = { hideTitle: hideTitle === undefined ? !!cur.hideTitle : !!hideTitle };
    if (cur.border) meta.border = cur.border; // set with /api/border
    if (cur.artPad !== undefined) meta.artPad = cur.artPad; // set with the art (/api/art/relayout)
    const t = title === undefined ? cur.title : cleanTitle(title);
    if (t) meta.title = t;
    const sd = side === undefined ? cur.side : side === null ? undefined : cleanSide(side); // null = back to the usual
    if (sd) meta.side = sd;
    const lk = look === undefined ? cur.look : look === null ? undefined : cleanLook(look); // null = the board style's
    if (lk) meta.look = lk;
    if (makeDefault && t) {
      kv.set('titleDefault', t);
      delete meta.title;
    }
    store(ym, meta);
    if (makeDefault) broadcast('meta', { ym: '*' });
    else broadcast('meta', { ym, meta: metaFor(ym) });
    res.json(metaFor(ym));
  });

  // ---------------------- //
  // | The holiday border | //
  // ---------------------- //
  // { ym, border: {...} or null, yearly: true = every year in this month }  //
  app.post('/api/border', (req, res) => {
    const { ym, border, yearly: everyYear } = req.body || {};
    if (!isYm(ym)) return res.status(400).json({ error: 'bad month' });
    const b = cleanBorder(border);
    if (border && !b) return res.status(400).json({ error: 'Pick at least one picture' });
    const cur = stored(ym);
    const all = yearly();
    const mm = ym.slice(5);
    if (everyYear) {
      if (b) all[mm] = b;
      else delete all[mm];
      delete cur.border; // this month follows the yearly one
    } else if (b) cur.border = b;
    else if (all[mm])
      cur.border = { off: true }; // none this month, even though there's a yearly one
    else delete cur.border;
    kv.set('borders', all);
    store(ym, cur);
    broadcast('meta', { ym: '*' });
    res.json(metaFor(ym));
  });

  // ------------------------------ //
  // | The frame around the board | //
  // ------------------------------ //
  // How thick the frame around the board is, in board pixels (0-80): the    //
  // same every month. From Colby Way's board.                               //
  app.post('/api/frame', (req, res) => {
    const pad = Number((req.body || {}).pad);
    if (!Number.isFinite(pad)) return res.status(400).json({ error: 'bad frame' });
    kv.set('boardPad', Math.min(Math.max(Math.round(pad), 0), 80));
    broadcast('meta', { ym: '*' });
    res.json({ boardPad: kv.get('boardPad') });
  });

  return { metaFor, padOf, stored, store };
}
export type Month = ReturnType<typeof setup>;

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
