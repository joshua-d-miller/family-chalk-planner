/*
===============================================================================
 Family Chalk Planner | Server | Photos | photos.ts
===============================================================================
 Version:   0.13.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-06
 Updated:   2026-11-07

 Purpose:
     Photos: a shared album feeds the photos beside the month name and the
     overnight slideshow. Every photo is copied into photo-cache/ so the
     wall never waits on the album.

     Face finding (optional): OpenCV's YuNet model run by
     face/facefocus.py in its own Python venv. Each photo is checked once;
     the result sits next to it as <id>.json so the board can frame people
     instead of cropping the middle.

 Routes:
     GET    /api/photos
     GET    /api/photos/img/:id
     POST   /api/photos/settings
     POST   /api/photos/sync
     POST   /api/board-settings/immich-albums

 Used by:
     server/main.ts
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    Move photos, pages and the console's board
                        claude    settings into TypeScript modules.
                        colby
                                  Immich photos, slideshow extras, a filled-in
                                  today, and the frame's thickness.
===============================================================================
*/

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Express } from 'express';
import type { Kv } from '../kv.ts';
import { GP_UA, albumKind, imageHostOk, readAlbum } from './albums.ts';
import type { AlbumConfig } from './albums.ts';
import { immichAlbums, immichShare, normalizeImmichUrl, onThisDay, readImmich } from './immich.ts';
import type { ImmichPhoto, ImmichSource } from './immich.ts';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------- //
// | Types | //
// --------- //
interface Face {
  [k: string]: unknown;
}
interface Photo {
  id: string;
  w: number;
  h: number;
  date: number;
  faces?: Face[];
}
type AlbumPhotoLike = { id: string; url: string; w: number; h: number; date: number };
interface FaceResult {
  file: string;
  w?: number;
  h?: number;
  faces?: Face[];
  error?: string;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------------------------------- //
// | Slideshow and title photo settings | //
// -------------------------------------- //
// The slideshow and title-photo settings; the slideshow's extras (today's   //
// events, the temperature, reminders, photos beside the board instead of    //
// over it) are from Colby Way's board                                       //
const CFG_DEFAULT = {
  frame: true,
  night: true,
  from: '21:00',
  to: '06:00',
  every: 20,
  dim: 50,
  showEvents: false,
  showTemp: false,
  showReminders: false,
  sidePanel: false
};
type PhotoCfg = typeof CFG_DEFAULT;

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------------- //
// | Picture types | //
// ----------------- //
const isJpegPng = (b: Buffer) => b.length > 8 && ((b[0] === 0xff && b[1] === 0xd8) || b.readUInt32BE(0) === 0x89504e47);
const isWebp = (b: Buffer) =>
  b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------- //
// | The routes | //
// -------------- //
export function setup({
  app,
  kv,
  broadcast,
  today,
  album,
  immich,
  cacheDir,
  faceDir,
  facePython
}: {
  app: Express;
  kv: Kv;
  broadcast: (event: string, data: unknown) => void;
  today: () => string;
  album: AlbumConfig; // url '' = no album
  immich: { url: string; key: string; album: string }; // url and key set = Immich instead of the album link
  cacheDir: string;
  faceDir: string;
  facePython: string;
}) {
  const state = {
    list: kv.get<Photo[]>('photos') || [],
    synced: 0,
    error: null as string | null,
    running: false
  };
  const cfg = (): PhotoCfg => ({ ...CFG_DEFAULT, ...(kv.get<Partial<PhotoCfg>>('photoCfg') || {}) });
  // Where the photos come from: Immich (with a key), an Immich share link, Google Photos or iCloud
  const immichUrl = normalizeImmichUrl(immich.url);
  const immichSrc: ImmichSource | null =
    immichUrl && immich.key ? { url: immichUrl, key: immich.key, album: immich.album } : immichShare(album.url);
  const kind = immichSrc ? (immichSrc.shareKey ? 'immich-share' : 'immich') : album.url ? albumKind(album) : 'none';
  const enabled = kind !== 'none';
  const google = kind === 'google';

  const faceScript = path.join(faceDir, 'facefocus.py');
  const faceModel = path.join(faceDir, 'yunet.onnx');
  // ------------------- //
  // | The face finder | //
  // ------------------- //
  // Face/facefocus.py (OpenCV YuNet), if it's installed: where the faces    //
  // are in each photo, so frames can be filled with people.                 //
  const faceReady = () => [facePython, faceScript, faceModel].every(f => fs.existsSync(f));
  function findFaces(files: string[]): Promise<FaceResult[]> {
    return new Promise(resolve => {
      if (!files.length || !faceReady()) return resolve([]);
      execFile(
        facePython,
        [faceScript, faceModel, ...files],
        { timeout: 10 * 60 * 1000, maxBuffer: 4 << 20 },
        (err, stdout) => {
          if (err && !stdout) console.error('Face finder:', err.message);
          resolve(
            String(stdout || '')
              .split('\n')
              .map(l => {
                try {
                  return JSON.parse(l) as FaceResult;
                } catch {
                  return null;
                }
              })
              .filter(r => r !== null)
          );
        }
      );
    });
  }

  // ----------------------- //
  // | Downloading a photo | //
  // ----------------------- //
  // Only from the album service's own image hosts (Immich: the server that  //
  // was set up)                                                             //
  const hostOk = (u: string) => (immichSrc ? u.startsWith(immichSrc.url + '/') : imageHostOk(album, u));
  // JPEG or PNG (the wall can't show HEIC); Immich's previews can also be WebP
  const imageOk = (b: Buffer) => isJpegPng(b) || (!!immichSrc && isWebp(b));
  async function getImage(
    url: string,
    headers: Record<string, string> = {},
    fallback?: string
  ): Promise<Buffer | null> {
    const r = await fetch(url, {
      headers: google
        ? { ...GP_UA, Accept: 'image/jpeg,image/png' }
        : { Accept: 'image/jpeg,image/png,image/webp,image/*', ...headers },
      signal: AbortSignal.timeout(60000)
    });
    const buf = r.ok ? Buffer.from(await r.arrayBuffer()) : null;
    if (buf && imageOk(buf)) return buf;
    if (buf && google && !url.endsWith('-rj')) return getImage(url + '-rj'); // ask Google for JPEG
    if (fallback && fallback !== url) return getImage(fallback, headers);
    return null;
  }

  const fileOf = (id: string, ext: string) => path.join(cacheDir, `${id}.${ext}`);

  // --------------------------------- //
  // | Keeping the copies up to date | //
  // --------------------------------- //
  // Every photo is copied into photo-cache/, so the wall never waits on the //
  // album; the album is checked again every few hours.                      //
  async function sync() {
    if (!enabled || state.running) return;
    state.running = true;
    try {
      const assets: (AlbumPhotoLike & Partial<ImmichPhoto>)[] = immichSrc
        ? await readImmich(immichSrc, today())
        : await readAlbum(album);
      fs.mkdirSync(cacheDir, { recursive: true });
      for (const a of assets) {
        const file = fileOf(a.id, 'jpg');
        if (fs.existsSync(file) || !hostOk(a.url) || (a.fallbackUrl && !hostOk(a.fallbackUrl))) continue;
        const buf = await getImage(a.url, a.headers, a.fallbackUrl);
        if (!buf) continue;
        fs.writeFileSync(file + '.part', buf);
        fs.renameSync(file + '.part', file);
        // Immich already found the faces
        if (a.faces?.length && a.w && a.h && !fs.existsSync(fileOf(a.id, 'json')))
          fs.writeFileSync(fileOf(a.id, 'json'), JSON.stringify({ w: a.w, h: a.h, faces: a.faces }));
      }
      const have = assets.filter(a => fs.existsSync(fileOf(a.id, 'jpg')));
      const todo = have.filter(a => !fs.existsSync(fileOf(a.id, 'json'))).map(a => fileOf(a.id, 'jpg'));
      for (const r of await findFaces(todo)) {
        if (r.error || !r.w) continue;
        fs.writeFileSync(
          fileOf(path.basename(r.file, '.jpg'), 'json'),
          JSON.stringify({ w: r.w, h: r.h, faces: r.faces })
        );
      }
      const list: Photo[] = have.map(({ id, w, h, date }) => {
        let f: { w: number; h: number; faces: Face[] } | null = null;
        try {
          f = JSON.parse(fs.readFileSync(fileOf(id, 'json'), 'utf8'));
        } catch {
          /* not checked for faces */
        }
        return f ? { id, w: f.w, h: f.h, date, faces: f.faces } : { id, w, h, date };
      });
      const keep = new Set(list.flatMap(p => [`${p.id}.jpg`, `${p.id}.json`]));
      for (const f of fs.readdirSync(cacheDir)) if (!keep.has(f)) fs.rmSync(path.join(cacheDir, f), { force: true }); // removed from the album
      const changed = JSON.stringify(list) !== JSON.stringify(state.list);
      state.list = list;
      state.synced = Date.now();
      state.error = null;
      if (changed) {
        kv.set('photos', list);
        broadcast('photos', {});
      }
    } catch (e) {
      state.error = (e as Error).message;
      console.error('Photo sync:', state.error);
    } finally {
      state.running = false;
    }
  }
  if (enabled) {
    setTimeout(sync, 5000);
    setInterval(sync, 15 * 60 * 1000);
  }

  // -------------- //
  // | The photos | //
  // -------------- //
  // ?thisDay=1: only photos taken on this date in earlier years, if there   //
  // are any                                                                 //
  app.get('/api/photos', (req, res) => {
    let photos = state.list;
    if (req.query.thisDay === '1' || req.query.thisDay === 'true') {
      const hits = onThisDay(photos, today());
      if (hits.length) photos = hits;
    }
    res.json({ enabled, kind, photos, cfg: cfg(), synced: state.synced, error: state.error });
  });

  app.get('/api/photos/img/:id', (req, res) => {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(req.params.id)) return res.sendStatus(404);
    const file = fileOf(req.params.id, 'jpg');
    let type: string;
    try {
      const fd = fs.openSync(file, 'r');
      const b = Buffer.alloc(16);
      fs.readSync(fd, b, 0, 16, 0);
      fs.closeSync(fd);
      type = b.readUInt32BE(0) === 0x89504e47 ? 'image/png' : isWebp(b) ? 'image/webp' : 'image/jpeg';
    } catch {
      return res.sendStatus(404);
    }
    res.set('Cache-Control', 'public, max-age=31536000, immutable').type(type);
    res.sendFile(file, err => {
      if (err && !res.headersSent) res.sendStatus(404);
    });
  });

  // ------------ //
  // | Settings | //
  // ------------ //
  app.post('/api/photos/settings', (req, res) => {
    const b = req.body || {};
    const hm = (v: unknown) => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : null);
    const cur = cfg();
    const next: PhotoCfg = {
      frame: b.frame === undefined ? cur.frame : !!b.frame,
      night: b.night === undefined ? cur.night : !!b.night,
      from: hm(b.from) || cur.from,
      to: hm(b.to) || cur.to,
      every: [10, 20, 30, 60].includes(+b.every) ? +b.every : cur.every,
      dim: [30, 50, 70, 100].includes(+b.dim) ? +b.dim : cur.dim, // slideshow brightness, %
      showEvents: b.showEvents === undefined ? cur.showEvents : !!b.showEvents,
      showTemp: b.showTemp === undefined ? cur.showTemp : !!b.showTemp,
      showReminders: b.showReminders === undefined ? cur.showReminders : !!b.showReminders,
      sidePanel: b.sidePanel === undefined ? cur.sidePanel : !!b.sidePanel
    };
    kv.set('photoCfg', next);
    broadcast('photos', {});
    res.json(next);
  });

  app.post('/api/photos/sync', async (_req, res) => {
    await sync();
    res.json({ photos: state.list.length, error: state.error });
  });

  // ----------------- //
  // | Immich albums | //
  // ----------------- //
  // Admin console → Board settings → Photos: the albums on an Immich server //
  // (what was typed, else what's saved). Only admins choose where photos    //
  // come from: the board fetches from that address.                         //
  app.post('/api/board-settings/immich-albums', async (req, res) => {
    const b = req.body || {};
    const url = normalizeImmichUrl(b.url !== undefined ? String(b.url) : immich.url);
    const key = String(b.apiKey || immich.key || '').trim();
    if (!url)
      return res.status(400).json({ error: 'Enter your Immich server address first (like http://192.168.1.50:2283)' });
    try {
      if (!/^https?:$/.test(new URL(url).protocol)) throw new Error('not http');
    } catch {
      return res.status(400).json({ error: 'The Immich address should start with http:// or https://' });
    }
    if (!key)
      return res.status(400).json({ error: 'Enter your Immich API key first (Immich: Account Settings → API Keys)' });
    try {
      res.json({ albums: await immichAlbums(url, key) });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
