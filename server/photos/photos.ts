/*
===============================================================================
 Family Chalk Planner | Server | Photos | photos.ts
===============================================================================
 Version:   1.3.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-06
 Updated:   2026-11-28

 Purpose:
     Photos: a shared album feeds the photos beside the month name and the
     overnight slideshow. Which of its photos: all of them, the ones picked
     in the admin console, or a few at random each day. Every chosen photo
     is copied into photo-cache/ so the wall never waits on the album; or,
     for a big album, only the last few shown are kept and the rest are
     fetched when they come up.

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
     GET    /api/board-settings/photo-choices
     GET    /api/board-settings/photo-thumb/:id
     GET    /api/photos/thumb/:id
     POST   /api/board-settings/photo-picked

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

 1.1.0    2026-11-17   joshua    Which photos (all, picked in the console, or
                        claude    a few at random each day), and for a big
                                  album copies of only the last few shown, the
                                  rest fetched when they come up. The
                                  console's photo picker.
                                  A big album that can't be reached: the last
                                  photo shown stands in, and the screens are
                                  told it's offline.
                                  Small pictures for the board's own photo
                                  picker too.
                                  The next countdown on the slideshow
                                  (showCountdown, on unless turned off).
                                  Check connections: the album read now.

 1.2.0    2026-11-21   joshua    The slideshow's timing (5 to 120 seconds)
                        claude    and brightness (10 to 100%) take any value
                                  the sliders in ⚙️ Settings give.

 1.2.8    2026-11-24   joshua    Album photos are drawn again before they're
                        claude    kept (server/images.ts), inside the cache
                                  folder and written in one step.

                                  Album photos are fetched with safeFetch()
                                  (the name and every redirect checked).

                                  A photo sync problem goes into the log
                                  without line breaks (oneLine()).

 1.3.0    2026-11-26   joshua    The overnight hours on chosen days, and up
                        claude    to 3 more times.

 1.3.0    2026-11-28   joshua    More albums (MORE_ALBUMS), each kept fresh
                        claude    on its own (makeSource); ?album= picks one.
===============================================================================
*/

import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Express } from 'express';
import type { Kv } from '../kv.ts';
import { inside, writeIfNew, writeWhole } from '../files.ts';
import { safeFetch } from '../address.ts';
import { oneLine } from '../access/http.ts';
import { remade } from '../images.ts';
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
type Source = AlbumPhotoLike & Partial<ImmichPhoto>; // a photo in the album, and where to get it
// which photos, and how many copies are kept (admin console → ⚙️ Board → Photos)
export interface PhotoChoice {
  pick: 'all' | 'picked' | 'random';
  randomCount: number; // pick 'random': how many a day
  keep: 'all' | 'few'; // a copy of every chosen photo, or only the last few shown
  keepCount: number; // keep 'few': how many copies
}
// one of the admin's more albums: a shared album's link, or which photos on the Immich server that's set up
export interface MoreAlbum {
  id: string;
  name: string;
  url?: string;
  immich?: string; // an album's name or id, 'favorites', 'all' or 'thisday'
}
const CHOICE_DEFAULT: PhotoChoice = { pick: 'all', randomCount: 50, keep: 'all', keepCount: 5 };
const MAX_PICKED = 5000;
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
  sidePanel: false,
  showCountdown: true // the next countdown on the slideshow (from 30 days out)
};
type NightWindow = { from: string; to: string; days: number[] };
// days: the overnight hours' weekdays (none saved: every day, as before 1.3.0); more: up to 3 more windows
type PhotoCfg = typeof CFG_DEFAULT & { days?: number[]; more?: NightWindow[] };

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
  facePython,
  choose = CHOICE_DEFAULT,
  moreAlbums = [],
  albumsDir = path.join(path.dirname(cacheDir), 'photo-albums')
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
  choose?: PhotoChoice;
  moreAlbums?: MoreAlbum[]; // ⚙️ Board → Photos → More albums (MORE_ALBUMS)
  albumsDir?: string; // their copies, one folder each (not inside photo-cache/: its sync removes what isn't its own)
}) {
  const cfg = (): PhotoCfg => ({ ...CFG_DEFAULT, ...(kv.get<Partial<PhotoCfg>>('photoCfg') || {}) });

  // ------------------------- //
  // | One album, kept fresh | //
  // ------------------------- //
  // The board's own album (its list kept as 'photos', its copies in        //
  // photo-cache/, as before 1.3.0) and each of the admin's more albums      //
  // (MORE_ALBUMS: 'photos:<id>', photo-albums/<id>/) work the same way.     //
  function makeSource(
    album: AlbumConfig,
    immich: { url: string; key: string; album: string },
    cacheDir: string,
    listKey: string,
    first: boolean // the board's own album: the console's picked photos are its
  ) {
    const state = {
      list: kv.get<Photo[]>(listKey) || [],
      all: [] as Source[], // every photo the album had when it was last read (for picking, and fetching)
      synced: 0,
      error: null as string | null,
      running: false,
      offline: false // a big album that can't be reached: its last copy is shown instead
    };
    const few = choose.keep === 'few';
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
    // Face/facefocus.py (OpenCV YuNet), if it's installed: where the faces  //
    // are in each photo, so frames can be filled with people.               //
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
    // Only from the album service's own image hosts (Immich: the server     //
    // that was set up)                                                      //
    const hostOk = (u: string) => (immichSrc ? u.startsWith(immichSrc.url + '/') : imageHostOk(album, u));
    // JPEG or PNG (the wall can't show HEIC); Immich's previews can also be WebP
    const imageOk = (b: Buffer) => isJpegPng(b) || (!!immichSrc && isWebp(b));
    async function getImage(
      url: string,
      headers: Record<string, string> = {},
      fallback?: string
    ): Promise<Buffer | null> {
      // album servers (Immich on your network, Google, iCloud): the name and every redirect checked (server/address.ts)
      const r = await safeFetch(url, {
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

    // a photo's copy (or its faces) in the cache folder: always inside it, whatever the album calls the photo
    const fileOf = (id: string, ext: string) => {
      const file = inside(cacheDir, `${id}.${ext}`);
      if (!file) throw new Error('Not a photo the board keeps');
      return file;
    };
    // a fetched photo, kept as the board's own copy (drawn again in the same type, server/images.ts: the
    // wall shows JPEG, PNG and WebP alike) and written in one step
    async function keepCopy(file: string, buf: Buffer) {
      const pic = await remade(buf);
      if (!pic) return false;
      writeWhole(file, pic.buf);
      return true;
    }

    // ---------------- //
    // | Which photos | //
    // ---------------- //
    // All of them, the ones picked in the console (all of them until some   //
    // are), or a few at random: the same few all day, new ones each day.    //
    function chosen(all: Source[]): Source[] {
      if (choose.pick === 'picked' && first) {
        const picked = new Set(kv.get<string[]>('photoPicked') || []);
        const hits = all.filter(a => picked.has(a.id));
        return hits.length ? hits : all;
      }
      if (choose.pick === 'random') {
        const day = today();
        const rank = new Map(
          all.map(a => [a.id, crypto.createHash('sha1').update(`${day}|${a.id}`).digest('hex')] as const)
        );
        return [...all]
          .sort((a, b) => (rank.get(a.id)! < rank.get(b.id)! ? -1 : 1))
          .slice(0, choose.randomCount)
          .sort((a, b) => b.date - a.date);
      }
      return all;
    }

    // ----------------------------- //
    // | A big album: a few copies | //
    // ----------------------------- //
    // The board lists every chosen photo but keeps copies of only the last  //
    // few shown (enough for the slideshow's photos side by side); the rest  //
    // are fetched from the album when a screen asks for them. Immich's own  //
    // faces come along in the list (the face finder needs a copy, so it     //
    // only runs when every photo is kept).                                  //
    const fetching = new Map<string, Promise<boolean>>();
    function trimCopies() {
      const copies = fs
        .readdirSync(cacheDir)
        .filter(f => f.endsWith('.jpg'))
        .map(f => ({ f, t: fs.statSync(path.join(cacheDir, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t);
      for (const { f } of copies.slice(choose.keepCount)) {
        fs.rmSync(path.join(cacheDir, f), { force: true });
        fs.rmSync(path.join(cacheDir, f.replace(/\.jpg$/, '.json')), { force: true });
      }
    }
    // the album can't be reached (or can again): the screens show a small note
    function setOffline(v: boolean) {
      if (state.offline === v) return;
      state.offline = v;
      broadcast('photos', {});
    }
    // the copy shown most recently, for when the album can't be reached
    function lastCopy(): string | null {
      const copies = fs.existsSync(cacheDir)
        ? fs
            .readdirSync(cacheDir)
            .filter(f => f.endsWith('.jpg'))
            .map(f => ({ f, t: fs.statSync(path.join(cacheDir, f)).mtimeMs }))
            .sort((a, b) => b.t - a.t)
        : [];
      return copies.length ? path.join(cacheDir, copies[0].f) : null;
    }
    function fetchOne(id: string): Promise<boolean> {
      const a = state.all.find(x => x.id === id);
      if (!a) return Promise.resolve(false);
      let p = fetching.get(id);
      if (!p) {
        p = getImage(a.url, a.headers, a.fallbackUrl)
          .then(async buf => {
            if (!buf) return false;
            fs.mkdirSync(cacheDir, { recursive: true });
            if (!(await keepCopy(fileOf(id, 'jpg'), buf))) return false;
            trimCopies();
            setOffline(false);
            return true;
          })
          .catch(() => false)
          .finally(() => fetching.delete(id));
        fetching.set(id, p);
      }
      return p;
    }
    function keepFew(assets: Source[]) {
      const list: Photo[] = assets.map(({ id, w, h, date, faces }) =>
        faces?.length ? { id, w, h, date, faces: faces as unknown as Face[] } : { id, w, h, date }
      );
      // copies of photos no longer chosen go; then only the newest few stay
      const keep = new Set(list.map(p => `${p.id}.jpg`));
      for (const f of fs.readdirSync(cacheDir)) if (!keep.has(f)) fs.rmSync(path.join(cacheDir, f), { force: true });
      trimCopies();
      done(list);
    }
    // the new list: saved, and the screens told if it changed
    function done(list: Photo[]) {
      const changed = JSON.stringify(list) !== JSON.stringify(state.list);
      state.list = list;
      state.synced = Date.now();
      state.error = null;
      if (changed) {
        kv.set(listKey, list);
        broadcast('photos', {});
      }
    }

    // --------------------------------- //
    // | Keeping the copies up to date | //
    // --------------------------------- //
    // Every photo is copied into its album's folder, so the wall never      //
    // waits on the album; the album is checked again every few hours.       //
    async function sync() {
      if (!enabled || state.running) return;
      state.running = true;
      try {
        const read: Source[] = immichSrc ? await readImmich(immichSrc, today()) : await readAlbum(album);
        // only photos from the album service's own hosts are ever fetched
        state.all = read.filter(a => hostOk(a.url) && (!a.fallbackUrl || hostOk(a.fallbackUrl)));
        const assets = chosen(state.all);
        fs.mkdirSync(cacheDir, { recursive: true });
        if (few) return keepFew(assets);
        for (const a of assets) {
          const file = fileOf(a.id, 'jpg');
          if (fs.existsSync(file) || !hostOk(a.url) || (a.fallbackUrl && !hostOk(a.fallbackUrl))) continue;
          const buf = await getImage(a.url, a.headers, a.fallbackUrl);
          if (!buf || !(await keepCopy(file, buf))) continue;
          // Immich already found the faces
          if (a.faces?.length && a.w && a.h)
            writeIfNew(fileOf(a.id, 'json'), JSON.stringify({ w: a.w, h: a.h, faces: a.faces }));
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
        done(list);
      } catch (e) {
        state.error = (e as Error).message;
        console.error('Photo sync:', oneLine(state.error)); // (the album's own words, never a fake log line)
      } finally {
        state.running = false;
      }
    }
    if (enabled) {
      setTimeout(sync, 5000);
      setInterval(sync, 15 * 60 * 1000);
    }
    return { state, sync, fetchOne, fileOf, lastCopy, setOffline, getImage, enabled, kind, few };
  }
  const board = makeSource(album, immich, cacheDir, 'photos', true);
  // the admin's more albums: a shared album's link, or an album (or Favorites, or "on this day") on the Immich
  // server that's set up. Only these can ever be shown: nobody can point the board at a photo source of their own
  const more = new Map(
    moreAlbums.map(m => [
      m.id,
      {
        name: m.name,
        src: makeSource(
          m.url ? { ...album, url: m.url } : { url: '' },
          m.immich !== undefined ? { ...immich, album: m.immich } : { url: '', key: '', album: '' },
          path.join(albumsDir, m.id),
          'photos:' + m.id,
          false
        )
      }
    ])
  );
  type Src = typeof board;
  const srcOf = (q: unknown): Src | null => (!q ? board : more.get(String(q))?.src || null);

  // -------------- //
  // | The photos | //
  // -------------- //
  // ?thisDay=1: only photos taken on this date in earlier years, if there   //
  // are any                                                                 //
  // ?album=<id>: one of the more albums (none: the board's own)            //
  app.get('/api/photos', (req, res) => {
    const src = srcOf(req.query.album);
    if (!src) return res.status(404).json({ error: 'No such album' });
    const { state, enabled, kind, few } = src;
    let photos = state.list;
    if (req.query.thisDay === '1' || req.query.thisDay === 'true') {
      const hits = onThisDay(photos, today());
      if (hits.length) photos = hits;
    }
    res.json({
      enabled,
      kind,
      photos,
      cfg: cfg(),
      synced: state.synced,
      error: state.error,
      offline: few && state.offline,
      few, // only the last few kept: pictures for picking come from /api/photos/thumb
      // every album there is to show (the 📷 Albums page, and what each part of the board shows)
      albums: [
        { id: '', name: 'Photos', count: board.state.list.length, cover: board.state.list[0]?.id || null },
        ...[...more].map(([id, m]) => ({
          id,
          name: m.name,
          count: m.src.state.list.length,
          cover: m.src.state.list[0]?.id || null
        }))
      ]
    });
  });

  app.get('/api/photos/img/:id', async (req, res) => {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(req.params.id)) return res.sendStatus(404);
    const src = srcOf(req.query.album);
    if (!src) return res.sendStatus(404);
    const { state, few, fileOf, sync, fetchOne, setOffline, lastCopy } = src;
    let file = fileOf(req.params.id, 'jpg');
    let stand = false; // the last photo shown, standing in while the album can't be reached
    if (few) {
      // a big album: fetched now if there's no copy (the board was just started: read the album first)
      if (!fs.existsSync(file)) {
        if (!state.all.length) await sync();
        if (!state.list.some(p => p.id === req.params.id)) return res.sendStatus(404);
        if (!(await fetchOne(req.params.id))) {
          // the album can't be reached: the last photo shown, not a blank frame (and not kept by the screen)
          setOffline(true);
          const last = lastCopy();
          if (!last) return res.sendStatus(404);
          file = last;
          stand = true;
        }
      } else {
        const now = new Date();
        fs.utimesSync(file, now, now); // just shown: among the last few, so it stays
      }
    }
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
    // (a big album's copies come and go: screens keep theirs a day, not a year)
    res
      .set('Cache-Control', stand ? 'no-store' : few ? 'public, max-age=86400' : 'public, max-age=31536000, immutable')
      .type(type);
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
    // the overnight hours' days: weekdays 0 (Sunday) to 6, at least one; up to 3 more windows, each whole
    const days = (v: unknown) =>
      Array.isArray(v) && v.length && v.every(n => Number.isInteger(n) && n >= 0 && n <= 6)
        ? [...new Set(v as number[])].sort()
        : null;
    const more = (v: unknown) =>
      Array.isArray(v) && v.length <= 3
        ? v.map(w => ({ from: hm(w?.from), to: hm(w?.to), days: days(w?.days) }))
        : null;
    const extra = b.more === undefined ? null : more(b.more);
    const next: PhotoCfg = {
      frame: b.frame === undefined ? cur.frame : !!b.frame,
      night: b.night === undefined ? cur.night : !!b.night,
      from: hm(b.from) || cur.from,
      to: hm(b.to) || cur.to,
      days: (b.days === undefined ? null : days(b.days)) || cur.days,
      more: extra && extra.every(w => w.from && w.to && w.days) ? (extra as NightWindow[]) : cur.more,
      // (⚙️ Settings has sliders: 5 to 120 seconds, in 5s; 10 to 100%, in 10s)
      every: Number.isInteger(+b.every) && +b.every >= 5 && +b.every <= 120 ? +b.every : cur.every,
      dim: Number.isInteger(+b.dim) && +b.dim >= 10 && +b.dim <= 100 ? +b.dim : cur.dim, // slideshow brightness, %
      showEvents: b.showEvents === undefined ? cur.showEvents : !!b.showEvents,
      showTemp: b.showTemp === undefined ? cur.showTemp : !!b.showTemp,
      showReminders: b.showReminders === undefined ? cur.showReminders : !!b.showReminders,
      sidePanel: b.sidePanel === undefined ? cur.sidePanel : !!b.sidePanel,
      showCountdown: b.showCountdown === undefined ? cur.showCountdown : !!b.showCountdown
    };
    kv.set('photoCfg', next);
    broadcast('photos', {});
    res.json(next);
  });

  app.post('/api/photos/sync', async (_req, res) => {
    await Promise.all([board, ...[...more.values()].map(m => m.src)].map(s => s.sync()));
    res.json({ photos: board.state.list.length, error: board.state.error });
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

  // ---------------------------- //
  // | Picking photos (console) | //
  // ---------------------------- //
  // Admin console → ⚙️ Board → Photos → Pick photos: every photo in the     //
  // album as a small picture to tick. The small pictures come straight      //
  // from the album and aren't kept.                                         //
  app.get('/api/board-settings/photo-choices', async (_req, res) => {
    const { state, enabled, sync } = board; // (the console picks from the board's own album)
    if (!enabled) return res.json({ enabled, photos: [], picked: [] });
    if (!state.all.length) await sync();
    const picked = new Set(kv.get<string[]>('photoPicked') || []);
    res.json({
      enabled,
      error: state.error,
      pick: choose.pick,
      photos: state.all.map(({ id, date }) => ({ id, date })),
      picked: state.all.filter(a => picked.has(a.id)).map(a => a.id)
    });
  });
  // also for the board's own photo picker (📷 Photos I pick), so a big album's pictures aren't all copied
  app.get(['/api/board-settings/photo-thumb/:id', '/api/photos/thumb/:id'], async (req, res) => {
    const { state, enabled, sync, getImage } = board;
    if (!state.all.length && enabled) await sync();
    const a = state.all.find(x => x.id === req.params.id);
    if (!a) return res.sendStatus(404);
    try {
      const buf = await getImage(a.fallbackUrl || a.url, a.headers);
      if (!buf) return res.sendStatus(502);
      const type = buf.readUInt32BE(0) === 0x89504e47 ? 'image/png' : isWebp(buf) ? 'image/webp' : 'image/jpeg';
      res.set('Cache-Control', 'private, max-age=3600').type(type).send(buf);
    } catch {
      res.sendStatus(502);
    }
  });
  app.post('/api/board-settings/photo-picked', async (req, res) => {
    const ids = (req.body || {}).ids;
    if (
      !Array.isArray(ids) ||
      ids.length > MAX_PICKED ||
      !ids.every(i => typeof i === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(i))
    )
      return res.status(400).json({ error: `A list of up to ${MAX_PICKED} photos` });
    kv.set('photoPicked', [...new Set(ids as string[])]);
    await board.sync();
    res.json({ picked: ids.length, photos: board.state.list.length });
  });

  // ------------------------------------- //
  // | Check connections (admin console) | //
  // ------------------------------------- //
  // The album read now, with the board's own settings.                      //
  async function check() {
    const { state, enabled, sync } = board;
    if (!enabled) return { name: 'Photos', ok: null, detail: 'No photo album set up yet' };
    await sync();
    if (state.error) return { name: 'Photos', ok: false, detail: state.error };
    // the more albums too: one that can't be read is named
    const others = [...more.values()];
    await Promise.all(others.map(m => m.src.sync()));
    const bad = others.find(m => m.src.state.error);
    if (bad) return { name: 'Photos', ok: false, detail: `${bad.name}: ${bad.src.state.error}` };
    return {
      name: 'Photos',
      ok: true,
      detail:
        `Read the album: ${state.all.length} photos, ${state.list.length} shown on the board` +
        (others.length ? ` (and ${others.length} more album${others.length > 1 ? 's' : ''})` : '')
    };
  }
  return { check };
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
