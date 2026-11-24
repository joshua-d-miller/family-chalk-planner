/*
===============================================================================
 Family Chalk Planner | Server | webclip.ts
===============================================================================
 Version:   1.2.8
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-14
 Updated:   2026-11-24

 Purpose:
     "From the web" in Pictures: when the board's own pictures don't have
     it, search Openverse (WordPress.org's search for openly licensed
     pictures) for public-domain illustrations. No account and no key:
     Openverse lets anyone search a little (about 20 times a minute, 200 a
     day), which is plenty for one family. Only public domain (CC0 and
     public domain marked), so nothing needs a credit line on the board.

     Only when someone searches, and never more than that: answers and
     thumbnails are kept here (a search asked twice is asked once), the
     board stays well under Openverse's limits, and stops for a minute if
     Openverse says it's busy. Its terms forbid copying the catalog
     wholesale, and the board never does.

     A picture placed on the board is fetched once and kept like an upload
     (backup/media), so the calendar never depends on Openverse to show
     it.

 Routes:
     GET    /api/clip/web?q=            up to 20 public-domain illustrations
                                        { found: [{ id, title, creator,
                                        source, w, h }], note? }
     GET    /api/clip/web/:id/thumb     its thumbnail (kept)
     POST   /api/clip/web/keep          { id } fetch it for the board
                                        { src, w, h } (a family screen can)

 Used by:
     server/main.ts

 Known limitations:
     Needs the internet (the board's own pictures don't). Openverse's
     illustrations are a mix: drawings, scans of old prints, diagrams.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.17.0    2026-11-14   joshua    New file.
                        claude

 1.2.8    2026-11-24   joshua    Openverse thumbnails are drawn again before
                        claude    they're kept (server/images.ts), inside
                                  their folder and written in one step;
                                  keepImage() waits for that.
===============================================================================
*/

import fs from 'node:fs';
import path from 'node:path';
import type { Express } from 'express';
import { inside, readIfThere, writeWhole } from './files.ts';
import { kindOf, MIME, remade } from './images.ts';

export interface WebPicture {
  id: string;
  title: string;
  creator: string;
  source: string;
  w: number;
  h: number;
}
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const UA = 'FamilyChalkPlanner/1 (family wall calendar; https://github.com/joshua-d-miller/family-chalk-planner)';
const PER_MINUTE = 15; // searches (Openverse allows about 20 a minute without a key)
const PER_DAY = 180; // (and about 200 a day)
const KEEP_MAX = 10 * 1024 * 1024;
const PUBLIC_DOMAIN = new Set(['cc0', 'pdm']);

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------- //
// | The routes | //
// -------------- //
export function setup({
  app,
  cacheDir,
  keepImage,
  api = 'https://api.openverse.org/v1'
}: {
  app: Express;
  cacheDir: string;
  keepImage: (buf: Buffer) => Promise<{ src: string } | null>;
  api?: string; // (tests: a stand-in for Openverse)
}) {
  const thumbs = path.join(cacheDir, 'web');
  const answers = new Map<string, { at: number; found: WebPicture[] }>();
  const asked: number[] = []; // when each search went to Openverse (the last day)
  let busyUntil = 0; // Openverse said "too many": wait until then

  // ------------------------- //
  // | Asking Openverse once | //
  // ------------------------- //
  async function openverse(url: string) {
    if (Date.now() < busyUntil) throw Object.assign(new Error('busy'), { busy: true });
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
    if (r.status === 429) {
      busyUntil = Date.now() + 60e3;
      throw Object.assign(new Error('busy'), { busy: true });
    }
    if (!r.ok) throw new Error(`Openverse answered ${r.status}`);
    return r;
  }
  const wait = (note: string) => ({ found: [] as WebPicture[], note });

  // ---------- //
  // | Search | //
  // ---------- //
  app.get('/api/clip/web', async (req, res) => {
    const q = String(req.query.q || '')
      .toLowerCase()
      .replace(/[^a-z0-9 '-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60);
    res.set('Cache-Control', 'no-cache');
    if (!q) return res.json({ found: [] });
    const had = answers.get(q);
    if (had && Date.now() - had.at < 24 * 3600e3) return res.json({ found: had.found });
    const now = Date.now();
    while (asked.length && now - asked[0] > 24 * 3600e3) asked.shift();
    if (asked.length >= PER_DAY) return res.json(wait('That’s a lot of searching for one day - more tomorrow'));
    if (asked.filter(t => now - t < 60e3).length >= PER_MINUTE)
      return res.json(wait('Searching the web again in a minute'));
    asked.push(now);
    try {
      const u = new URL(api + '/images/');
      u.searchParams.set('q', q);
      u.searchParams.set('license', 'cc0,pdm');
      u.searchParams.set('category', 'illustration');
      u.searchParams.set('filter_dead', 'true');
      u.searchParams.set('mature', 'false');
      const j = (await (await openverse(u.href)).json()) as {
        results?: {
          id: string;
          title?: string;
          creator?: string;
          source?: string;
          license?: string;
          width?: number;
          height?: number;
          mature?: boolean;
        }[];
      };
      const found = (j.results || [])
        .filter(x => ID.test(x.id) && PUBLIC_DOMAIN.has(String(x.license)) && !x.mature)
        .map(x => ({
          id: x.id,
          title: String(x.title || '').slice(0, 120),
          creator: String(x.creator || '').slice(0, 80),
          source: String(x.source || '').slice(0, 40),
          w: Math.max(1, +(x.width || 0) || 1),
          h: Math.max(1, +(x.height || 0) || 1)
        }));
      answers.set(q, { at: now, found });
      if (answers.size > 300) answers.delete(answers.keys().next().value!);
      res.json({ found });
    } catch (e) {
      res.json(
        (e as { busy?: boolean }).busy
          ? wait('The web pictures are busy - try again in a minute')
          : wait('Couldn’t reach the web pictures (is the board online?)')
      );
    }
  });

  // ------------- //
  // | Thumbnail | //
  // ------------- //
  // Kept, so showing a search again costs Openverse nothing.               //
  app.get('/api/clip/web/:id/thumb', async (req, res) => {
    const id = req.params.id;
    if (!ID.test(id)) return res.sendStatus(404);
    const file = inside(thumbs, id);
    if (!file) return res.sendStatus(404);
    try {
      // kept once it's been drawn again as the board's own picture (server/images.ts), in one step
      let buf = readIfThere(file);
      if (!buf) {
        const r = await openverse(`${api}/images/${id}/thumb/`);
        const got = Buffer.from(await r.arrayBuffer());
        if (got.byteLength > KEEP_MAX) return res.sendStatus(404);
        const pic = await remade(got);
        if (!pic) return res.sendStatus(404);
        fs.mkdirSync(thumbs, { recursive: true });
        writeWhole(file, pic.buf);
        buf = pic.buf;
      }
      const kind = kindOf(buf);
      if (!kind) return res.sendStatus(404);
      const type = MIME[kind];
      res.set('Cache-Control', 'public, max-age=604800').type(type).send(buf);
    } catch {
      res.sendStatus(503);
    }
  });

  // ------------------------ //
  // | Onto the board: kept | //
  // ------------------------ //
  // Checked again (public domain, not mature) before it's fetched: only    //
  // ever a picture Openverse itself serves, never an address from a page.  //
  app.post('/api/clip/web/keep', async (req, res) => {
    const id = String((req.body || {}).id || '');
    if (!ID.test(id)) return res.status(400).json({ error: 'No such picture' });
    try {
      const info = (await (await openverse(`${api}/images/${id}/`)).json()) as {
        license?: string;
        mature?: boolean;
      };
      if (!PUBLIC_DOMAIN.has(String(info.license)) || info.mature)
        return res.status(400).json({ error: 'That picture isn’t public domain' });
      const r = await openverse(`${api}/images/${id}/thumb/?full_size=true&compressed=false`);
      if (+(r.headers.get('content-length') || 0) > KEEP_MAX)
        return res.status(400).json({ error: 'That picture is too big' });
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > KEEP_MAX) return res.status(400).json({ error: 'That picture is too big' });
      const kept = await keepImage(buf);
      if (!kept) return res.status(400).json({ error: 'That isn’t a picture the board can show' });
      res.json(kept);
    } catch (e) {
      res.status(503).json({
        error: (e as { busy?: boolean }).busy
          ? 'The web pictures are busy - try again in a minute'
          : 'Couldn’t fetch that picture (is the board online?)'
      });
    }
  });
}
