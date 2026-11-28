/*
===============================================================================
 Family Chalk Planner | Server | art.ts
===============================================================================
 Version:   1.3.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-06
 Updated:   2026-11-28

 Purpose:
     The art layer: chalk and Posca drawings, words, clipart, GIFs and
     stamps on each month, plus the stamp library (saved designs to place
     again). Every change goes to every open screen straight away.
       strokes(id, month, data, created)   one item each, drawn in id order
       stamps(id, name, data, created)     a saved design: a list of items

     Art is placed on the calendar as it looks at the time. A holiday
     border makes the days a little smaller, so each month remembers which
     layout its art was placed on (artPad: the border's width, 0 = none);
     the tablet moves the art onto the days when the border changes
     (/api/art/relayout).

 Routes:
     GET    /api/art
     POST   /api/art
     POST   /api/art/update
     POST   /api/art/bulk
     POST   /api/art/restore
     POST   /api/art/delete
     POST   /api/art/undo
     POST   /api/art/clear
     POST   /api/art/relayout
     GET    /api/stamps
     POST   /api/stamps
     POST   /api/stamps/delete

 Used by:
     server/main.ts
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-06   joshua    Art, stamps, each month's options, board
                        claude    style, meals and jars in their own
                                  TypeScript modules.

 0.14.0    2026-11-07   joshua    Words on the board can use any of the fonts.
                        claude

 0.14.1    2026-11-08   joshua    A picture's full address or a relative one
                        claude    is kept as its path.

 0.15.0    2026-11-08   joshua    A week drawn in the week view keeps its own
                        claude    art (under its first day).

 0.15.1    2026-11-10   joshua    A piece of art keeps her choice about the
                        claude    events under it (cv).

 0.16.0    2026-11-11   joshua    Pictures and words can be turned (r).
                        claude

 1.3.0    2026-11-28   joshua    A picture's 🖍 Look (lk), one it knows;
                        claude    a flight path's style (d).
===============================================================================
*/

import type { Express } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { isDate, isYm } from './dates.ts';

// art belongs to a month ('2026-11'), or a week drawn in the week view (its first day, '2026-11-08')
const isKey = (s: unknown): s is string => isYm(s) || isDate(s);
import type { Month } from './month.ts';
import { BOARD_FONTS } from '../shared/fonts.ts';

const HEX = /^#[0-9a-fA-F]{6}$/;
const GROUP = /^[a-z0-9]{1,16}$/; // items placed together move together
const MEDIA_SRC =
  /^\/api\/(media\/[a-z0-9]{16}\.(gif|webp|png|jpg)|anim\/[0-9a-f_]{2,48}\/(gif|svg)|clip\/[a-z0-9-]{1,64}\.svg)$/;

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------------------------- //
// | What a piece of art looks like | //
// ---------------------------------- //
// A line { c, w, p: [x, y, ...], m: Posca, e: eraser, fc: fill }, words {   //
// k: 't', s, x, y, f, z, c }, or a picture { k: 'g', src, still, x, y, w,   //
// h, mode } (a GIF, animated emoji or clipart).                             //
export type ArtItem = Record<string, unknown>;

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------------------------- //
// | Checking what a screen sends | //
// -------------------------------- //
// Anything missing or odd falls back to something safe; anything that can't //
// be drawn is refused.                                                      //
// a picture's 🖍 Look: as it is, or drawn in chalk (web/src/lib/pictureLook.ts)
const LOOKS = ['none', 'marker', 'shine', 'sticker', 'doodle', 'chalk'];
// a flight path's style (web/src/board/trail.ts)
const DASHES = ['dash', 'dots', 'dashdot', 'hearts'];
export function cleanItem(raw: unknown): ArtItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const it = raw as Record<string, unknown>;
  const c = typeof it.c === 'string' && HEX.test(it.c) ? it.c : '#EDEAE0';
  const group = typeof it.g === 'string' && GROUP.test(it.g) ? { g: it.g } : {};
  // over events: 'hide' hides the events under it, 'under' draws it behind the writing (none: not asked yet)
  const cover = it.cv === 'hide' || it.cv === 'under' ? { cv: it.cv } : {};
  // a picture or words, turned (degrees)
  const r = Math.round(Number(it.r));
  const turn = Number.isFinite(r) && r && r >= -180 && r <= 180 ? { r } : {};
  const x = Number(it.x);
  const y = Number(it.y);
  if (it.k === 'g') {
    // the board keeps a path (/api/clip/x.svg); a screen that sends the full address or a relative one means the same
    const toPath = (v: unknown) =>
      typeof v === 'string' ? v.replace(/^https?:\/\/[^/]+(?=\/)/, '').replace(/^(?=api\/)/, '/') : v;
    it.src = toPath(it.src);
    it.still = toPath(it.still);
    const okSrc = (v: unknown): v is string => typeof v === 'string' && MEDIA_SRC.test(v);
    if (!okSrc(it.src) || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    const size = (v: unknown) => Math.min(Math.max(Math.round(Number(v)) || 80, 16), 700);
    return {
      k: 'g',
      src: it.src,
      still: okSrc(it.still) ? it.still : it.src,
      x: Math.round(x),
      y: Math.round(y),
      w: size(it.w),
      h: size(it.h),
      mode: ['gentle', 'loop', 'still'].includes(it.mode as string) ? it.mode : 'gentle',
      // its 🖍 Look (web/src/lib/pictureLook.ts); none: the board style's
      ...(LOOKS.includes(it.lk as string) ? { lk: it.lk } : {}),
      ...turn,
      ...group,
      ...cover
    };
  }
  if (it.k === 't') {
    const s = String(it.s || '')
      .replace(/\r/g, '')
      .slice(0, 160);
    if (!s.trim() || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    return {
      k: 't',
      s,
      c,
      x: Math.round(Math.min(Math.max(x, 0), 1252)),
      y: Math.round(Math.min(Math.max(y, 0), 642)),
      f: Math.min(Math.max(Math.trunc(Number(it.f)) || 0, 0), BOARD_FONTS.length - 1),
      z: Math.min(Math.max(Math.round(Number(it.z)) || 40, 12), 120),
      ...(it.m ? { m: true } : {}),
      ...turn,
      ...group,
      ...cover
    };
  }
  if (!Array.isArray(it.p) || it.p.length < 2 || it.p.length > 20000) return null;
  return {
    c,
    w: Math.min(Math.max(Number(it.w) || 4, 1), 60),
    e: !!it.e,
    p: it.p.map(n => Math.round((Number(n) || 0) * 2) / 2),
    ...(it.m ? { m: true } : {}),
    ...(typeof it.fc === 'string' && HEX.test(it.fc) ? { fc: it.fc } : {}),
    ...(DASHES.includes(it.d as string) ? { d: it.d } : {}),
    ...group,
    ...cover
  };
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------- //
// | The routes | //
// -------------- //
export function setup({
  app,
  db,
  month,
  broadcast
}: {
  app: Express;
  db: DatabaseSync;
  month: Month;
  broadcast: (event: string, data: unknown) => void;
}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS strokes (id INTEGER PRIMARY KEY AUTOINCREMENT, month TEXT NOT NULL, data TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS strokes_month ON strokes(month);
    CREATE TABLE IF NOT EXISTS stamps (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, data TEXT NOT NULL, created INTEGER NOT NULL);
  `);
  const q = {
    list: db.prepare('SELECT id, data FROM strokes WHERE month = ? ORDER BY id'),
    insert: db.prepare('INSERT INTO strokes (month, data, created) VALUES (?, ?, ?)'),
    lastId: db.prepare('SELECT MAX(id) AS id FROM strokes WHERE month = ?'),
    delete: db.prepare('DELETE FROM strokes WHERE id = ?'),
    clear: db.prepare('DELETE FROM strokes WHERE month = ?'),
    deleteIn: db.prepare('DELETE FROM strokes WHERE id = ? AND month = ?'),
    restore: db.prepare('INSERT OR IGNORE INTO strokes (id, month, data, created) VALUES (?, ?, ?, ?)'),
    update: db.prepare('UPDATE strokes SET data = ? WHERE id = ? AND month = ?'),
    count: db.prepare('SELECT COUNT(*) AS n FROM strokes WHERE month = ?'),
    stamps: db.prepare('SELECT id, name, data FROM stamps ORDER BY id DESC'),
    stampAdd: db.prepare('INSERT INTO stamps (name, data, created) VALUES (?, ?, ?)'),
    stampDelete: db.prepare('DELETE FROM stamps WHERE id = ?')
  };
  const add = (ym: string, item: ArtItem) => Number(q.insert.run(ym, JSON.stringify(item), Date.now()).lastInsertRowid);

  // ----------------------------------- //
  // | The layout new art is placed on | //
  // ----------------------------------- //
  // The first art of a month is placed on the layout the month has now      //
  function noteLayout(ym: string) {
    if (!isYm(ym)) return; // a week's art isn't moved by a border
    const cur = month.stored(ym);
    if (cur.artPad !== undefined || (q.count.get(ym) as { n: number }).n) return;
    month.store(ym, { ...cur, artPad: month.padOf(month.metaFor(ym)) });
  }

  // ----------------- //
  // | A month's art | //
  // ----------------- //
  app.get('/api/art', (req, res) => {
    if (!isKey(req.query.ym)) return res.status(400).json({ error: 'bad month' });
    res.json(
      (q.list.all(req.query.ym) as { id: number; data: string }[]).map(r => ({ id: r.id, ...JSON.parse(r.data) }))
    );
  });

  // -------------------------------- //
  // | A new line, words or picture | //
  // -------------------------------- //
  // From: the screen that made the change (it already shows it, so it skips //
  // the broadcast)                                                          //
  app.post('/api/art', (req, res) => {
    const { ym, stroke, from } = req.body || {};
    const item = cleanItem(stroke);
    if (!isKey(ym) || !item) return res.status(400).json({ error: 'bad stroke' });
    noteLayout(ym);
    const id = add(ym, item);
    broadcast('stroke', { ym, from, stroke: { id, ...item } });
    res.json({ id });
  });

  // ----------------------------- //
  // | Moving or changing things | //
  // ----------------------------- //
  // Move / re-word / restyle items in place: { items: [{ id, ... }] } (or   //
  // the older { id, stroke })                                               //
  app.post('/api/art/update', (req, res) => {
    const { ym, from } = req.body || {};
    let list = req.body?.items;
    if (!list && req.body?.stroke) list = [{ ...req.body.stroke, id: req.body.id }];
    if (!isKey(ym) || !Array.isArray(list)) return res.status(400).json({ error: 'bad update' });
    const done = [];
    for (const it of list.slice(0, 5000)) {
      const item = cleanItem(it);
      if (!item || !Number.isInteger(it.id)) continue;
      q.update.run(JSON.stringify(item), it.id, ym);
      done.push({ id: it.id, ...item });
    }
    broadcast('update', { ym, from, items: done });
    res.json({ ok: true });
  });

  // ------------------- //
  // | Several at once | //
  // ------------------- //
  // Several new items at once (placing a stamp, copying)                    //
  app.post('/api/art/bulk', (req, res) => {
    const { ym, items, from } = req.body || {};
    if (!isKey(ym) || !Array.isArray(items) || items.length > 5000) return res.status(400).json({ error: 'bad items' });
    noteLayout(ym);
    const ids: (number | null)[] = [];
    const added = [];
    for (const it of items) {
      const item = cleanItem(it);
      if (!item) {
        ids.push(null);
        continue;
      }
      const id = add(ym, item);
      ids.push(id);
      added.push({ id, ...item });
    }
    broadcast('restore', { ym, from, items: added });
    res.json({ ids });
  });

  // ----------------- //
  // | Undo an erase | //
  // ----------------- //
  // Undo of an erase or a wipe: the items come back with their old ids (so  //
  // they keep their layering)                                               //
  app.post('/api/art/restore', (req, res) => {
    const { ym, items, from } = req.body || {};
    if (!isKey(ym) || !Array.isArray(items)) return res.status(400).json({ error: 'bad restore' });
    noteLayout(ym);
    const back = [];
    for (const it of items.slice(0, 5000)) {
      const item = cleanItem(it);
      if (!item || !Number.isInteger(it.id)) continue;
      q.restore.run(it.id, ym, JSON.stringify(item), Date.now());
      back.push({ id: it.id, ...item });
    }
    broadcast('restore', { ym, from, items: back });
    res.json({ ok: true, restored: back.length });
  });

  // -------------- //
  // | The eraser | //
  // -------------- //
  // The eraser: whole strokes, words or pictures                            //
  app.post('/api/art/delete', (req, res) => {
    const { ym, ids } = req.body || {};
    if (!isKey(ym) || !Array.isArray(ids)) return res.status(400).json({ error: 'bad delete' });
    const list = ids.filter(Number.isInteger).slice(0, 5000);
    for (const id of list) q.deleteIn.run(id, ym);
    broadcast('remove', { ym, ids: list });
    res.json({ ok: true });
  });

  // ------------------------ //
  // | Undo (older screens) | //
  // ------------------------ //
  app.post('/api/art/undo', (req, res) => {
    const ym = req.body?.ym;
    if (!isKey(ym)) return res.status(400).json({ error: 'bad month' });
    const row = q.lastId.get(ym) as { id: number | null } | undefined;
    if (row?.id) {
      q.delete.run(row.id);
      broadcast('undo', { ym, id: row.id });
    }
    res.json({ ok: true });
  });

  // ------------------ //
  // | Wipe the month | //
  // ------------------ //
  // Wipe the month; its next art starts on whatever layout the month has    //
  // then                                                                    //
  app.post('/api/art/clear', (req, res) => {
    const ym = req.body?.ym;
    if (!isKey(ym)) return res.status(400).json({ error: 'bad month' });
    q.clear.run(ym);
    const cur = isYm(ym) ? month.stored(ym) : {};
    if (isYm(ym) && cur.artPad !== undefined) {
      delete cur.artPad;
      month.store(ym, cur);
    }
    broadcast('clear', { ym });
    res.json({ ok: true });
  });

  // -------------------------- //
  // | Art following a border | //
  // -------------------------- //
  // The border changed: the tablet sends the month's art moved onto the new //
  // layout. Done once, by whichever screen gets there first ({ padFrom,     //
  // padTo } must match what the server has; 409 = already done).            //
  app.post('/api/art/relayout', (req, res) => {
    const { ym, padFrom, padTo, items, from } = req.body || {};
    if (!isYm(ym) || !Array.isArray(items) || items.length > 5000)
      return res.status(400).json({ error: 'bad relayout' });
    const cur = month.stored(ym);
    if ((cur.artPad || 0) !== padFrom || month.padOf(month.metaFor(ym)) !== padTo)
      return res.status(409).json({ error: 'The art was already moved', artPad: cur.artPad || 0 });
    const done = [];
    db.exec('BEGIN');
    try {
      for (const it of items) {
        const item = cleanItem(it);
        if (!item || !Number.isInteger(it.id)) continue;
        if (q.update.run(JSON.stringify(item), it.id, ym).changes) done.push({ id: it.id, ...item });
      }
      month.store(ym, { ...cur, artPad: padTo });
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    broadcast('update', { ym, from, items: done });
    broadcast('meta', { ym, meta: month.metaFor(ym) });
    res.json({ ok: true, artPad: padTo, moved: done.length });
  });

  // --------------------- //
  // | The stamp library | //
  // --------------------- //
  // ---- the stamp library ----                                             //
  app.get('/api/stamps', (_req, res) => {
    res.json(
      (q.stamps.all() as { id: number; name: string; data: string }[]).map(r => ({
        id: r.id,
        name: r.name,
        items: JSON.parse(r.data)
      }))
    );
  });

  app.post('/api/stamps', (req, res) => {
    const { name, items } = req.body || {};
    const nm = String(name || '')
      .trim()
      .slice(0, 40);
    if (!nm || !Array.isArray(items) || !items.length || items.length > 5000)
      return res.status(400).json({ error: 'Give it a name and pick something to save' });
    const clean = items.map(cleanItem).filter(Boolean);
    if (!clean.length) return res.status(400).json({ error: 'Nothing to save' });
    const id = Number(q.stampAdd.run(nm, JSON.stringify(clean), Date.now()).lastInsertRowid);
    res.json({ id });
  });

  app.post('/api/stamps/delete', (req, res) => {
    const id = req.body?.id;
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad id' });
    q.stampDelete.run(id);
    res.json({ ok: true });
  });
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
