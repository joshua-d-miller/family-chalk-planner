// Photos: a shared album feeds the photos beside the month name and the overnight slideshow.
// Every photo is copied into photo-cache/ so the wall never waits on the album.
//
// Face finding (optional): OpenCV's YuNet model run by face/facefocus.py in its own Python venv. Each photo
// is checked once; the result sits next to it as <id>.json so the board can frame people instead of
// cropping the middle.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Express } from 'express';
import type { Kv } from '../kv.ts';
import { GP_UA, albumKind, imageHostOk, readAlbum } from './albums.ts';
import type { AlbumConfig } from './albums.ts';

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
interface FaceResult {
  file: string;
  w?: number;
  h?: number;
  faces?: Face[];
  error?: string;
}

// the slideshow and title-photo settings
const CFG_DEFAULT = { frame: true, night: true, from: '21:00', to: '06:00', every: 20, dim: 50 };
type PhotoCfg = typeof CFG_DEFAULT;

const isJpegPng = (b: Buffer) => b.length > 8 && ((b[0] === 0xff && b[1] === 0xd8) || b.readUInt32BE(0) === 0x89504e47);

export function setup({
  app,
  kv,
  broadcast,
  album,
  cacheDir,
  faceDir,
  facePython
}: {
  app: Express;
  kv: Kv;
  broadcast: (event: string, data: unknown) => void;
  album: AlbumConfig; // url '' = no album
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
  const google = albumKind(album) === 'google';

  const faceScript = path.join(faceDir, 'facefocus.py');
  const faceModel = path.join(faceDir, 'yunet.onnx');
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

  async function getImage(url: string): Promise<Buffer | null> {
    const r = await fetch(url, {
      headers: google ? { ...GP_UA, Accept: 'image/jpeg,image/png' } : {},
      signal: AbortSignal.timeout(60000)
    });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (!isJpegPng(buf) && google && !url.endsWith('-rj')) return getImage(url + '-rj'); // ask Google for JPEG
    return isJpegPng(buf) ? buf : null; // JPEG or PNG only (the wall can't show HEIC)
  }

  const fileOf = (id: string, ext: string) => path.join(cacheDir, `${id}.${ext}`);

  async function sync() {
    if (!album.url || state.running) return;
    state.running = true;
    try {
      const assets = await readAlbum(album);
      fs.mkdirSync(cacheDir, { recursive: true });
      for (const a of assets) {
        const file = fileOf(a.id, 'jpg');
        if (fs.existsSync(file) || !imageHostOk(album, a.url)) continue;
        const buf = await getImage(a.url);
        if (!buf) continue;
        fs.writeFileSync(file + '.part', buf);
        fs.renameSync(file + '.part', file);
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
  if (album.url) {
    setTimeout(sync, 5000);
    setInterval(sync, 15 * 60 * 1000);
  }

  app.get('/api/photos', (_req, res) => {
    res.json({ enabled: !!album.url, photos: state.list, cfg: cfg(), synced: state.synced, error: state.error });
  });

  app.get('/api/photos/img/:id', (req, res) => {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(req.params.id)) return res.sendStatus(404);
    const file = fileOf(req.params.id, 'jpg');
    let png: boolean;
    try {
      const fd = fs.openSync(file, 'r');
      const b = Buffer.alloc(4);
      fs.readSync(fd, b, 0, 4, 0);
      fs.closeSync(fd);
      png = b.readUInt32BE(0) === 0x89504e47;
    } catch {
      return res.sendStatus(404);
    }
    res.set('Cache-Control', 'public, max-age=31536000, immutable').type(png ? 'image/png' : 'image/jpeg');
    res.sendFile(file, err => {
      if (err && !res.headersSent) res.sendStatus(404);
    });
  });

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
      dim: [30, 50, 70, 100].includes(+b.dim) ? +b.dim : cur.dim // slideshow brightness, %
    };
    kv.set('photoCfg', next);
    broadcast('photos', {});
    res.json(next);
  });

  app.post('/api/photos/sync', async (_req, res) => {
    await sync();
    res.json({ photos: state.list.length, error: state.error });
  });
}
