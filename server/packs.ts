/*
===============================================================================
 Family Chalk Planner | Server | packs.ts
===============================================================================
 Version:   0.17.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-14
 Updated:   2026-11-14

 Purpose:
     The picture packs in Pictures (Thanksgiving, Christmas, Birthdays...),
     from clipart/packs.json, this month's first; and Favorites: the
     pictures the family pins with ★, kept on the board for every screen.
       kv 'clipfav'  [picture names, newest first, up to 300]
     (Saved stamps, the family's own designs, are kept by server/art.ts
     and shown in Favorites next to these.)

 Routes:
     GET    /api/clip/packs            the packs: name, cover, how many
     GET    /api/clip/pack/:id         one pack's pictures
     GET    /api/clip/favorites        the pinned pictures
     POST   /api/clip/favorites        { id, on } pin or unpin one

 Used by:
     server/main.ts
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.17.0    2026-11-14   joshua    New file.
                        claude
===============================================================================
*/

import fs from 'node:fs';
import path from 'node:path';
import type { Express } from 'express';
import type { Kv } from './kv.ts';

export interface Pack {
  id: string;
  name: string;
  months: number[]; // the months it comes first in (none: all year)
  border: string; // the border it goes with (for reference)
  cover: string[];
  pictures: string[];
}
const FILE = path.join(import.meta.dirname, '..', 'clipart', 'packs.json');
const MAX_FAVORITES = 300;
const NAME = /^[a-z0-9-]{1,80}$/;

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------- //
// | The packs | //
// ------------- //
// Read once (a restart picks up an edit).                                 //
let packsCache: Pack[] | null = null;
export function loadPacks(): Pack[] {
  if (!packsCache) packsCache = (JSON.parse(fs.readFileSync(FILE, 'utf8')) as { packs: Pack[] }).packs;
  return packsCache;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------ //
// | This month's first | //
// ------------------------ //
// In season now, then all year, then the rest; each in the file's order.  //
export function packOrder(packs: Pack[], month: number) {
  const rank = (p: Pack) => (p.months.includes(month) ? 0 : p.months.length ? 2 : 1);
  return packs.map((p, i) => [p, i] as const).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]);
}

export function setup({
  app,
  kv,
  broadcast,
  today,
  pictureOk
}: {
  app: Express;
  kv: Kv;
  broadcast: (event: string, data: unknown) => void;
  today: () => string; // 'YYYY-MM-DD' where the board is
  pictureOk: (name: string) => boolean;
}) {
  const ok = (n: string) => {
    try {
      return pictureOk(n);
    } catch {
      return false;
    }
  };
  // ----------------- //
  // | Every pack | //
  // ----------------- //
  app.get('/api/clip/packs', (_req, res) => {
    const month = Number(today().slice(5, 7));
    res.set('Cache-Control', 'no-cache').json({
      packs: packOrder(loadPacks(), month).map(([p]) => ({
        id: p.id,
        name: p.name,
        now: p.months.includes(month),
        cover: p.cover.filter(ok).slice(0, 4),
        count: p.pictures.filter(ok).length
      }))
    });
  });
  // ------------- //
  // | One pack | //
  // ------------- //
  app.get('/api/clip/pack/:id', (req, res) => {
    const p = loadPacks().find(x => x.id === req.params.id);
    if (!p) return res.status(404).json({ error: 'No such pack' });
    res.set('Cache-Control', 'no-cache').json({ id: p.id, name: p.name, pictures: p.pictures.filter(ok) });
  });

  // ------------- //
  // | Favorites | //
  // ------------- //
  // The pictures pinned with ★, for every screen (newest first).           //
  const favs = () => (kv.get<string[]>('clipfav') || []).filter(n => typeof n === 'string');
  app.get('/api/clip/favorites', (_req, res) => {
    res.set('Cache-Control', 'no-cache').json({ items: favs().filter(ok) });
  });
  app.post('/api/clip/favorites', (req, res) => {
    const id = String(req.body?.id || '');
    const on = req.body?.on !== false;
    if (!NAME.test(id) || (on && !ok(id))) return res.status(400).json({ error: 'That picture isn’t on the board' });
    const items = favs().filter(n => n !== id);
    if (on) items.unshift(id);
    kv.set('clipfav', items.slice(0, MAX_FAVORITES));
    broadcast('clipfav', {});
    res.json({ items: items.slice(0, MAX_FAVORITES).filter(ok) });
  });
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
