/*
===============================================================================
 Family Chalk Planner | Server | media.ts
===============================================================================
 Version:   0.13.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-06
 Updated:   2026-11-06

 Purpose:
     Pictures people add to the board: uploads, "Add from link", and the
     GIF library. Stored in backup/media (inside the synced backup folder,
     so they ride along with the backups).

     "Add from link": paste a link to a GIF (or a GIPHY / Tenor / KLIPY
     page) and the board downloads it once and keeps it with your uploads,
     so it works offline and never depends on that site later. The board
     only fetches public internet addresses: never anything on your own
     network (no SSRF).

 Routes:
     POST   /api/media
     POST   /api/media/fromlink
     GET    /api/media/:file
     POST   /api/test/clean-media
     GET    /api/gifs
     POST   /api/gifs/add
     POST   /api/gifs/delete

 Used by:
     server/main.ts
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-06   joshua    Move clipart and media into their own
                        claude    TypeScript modules.
===============================================================================
*/

import crypto from 'node:crypto';
import dns from 'node:dns';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import path from 'node:path';
import express from 'express';
import type { Express } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import type { Kv } from './kv.ts';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------------- //
// | Picture types | //
// ----------------- //
// Recognized by their first bytes, never by the name or what the sender     //
// says it is.                                                               //
type Kind = 'gif' | 'png' | 'jpg' | 'webp';
const MAGIC: [Kind, (b: Buffer) => boolean][] = [
  ['gif', b => b.subarray(0, 6).toString('latin1').startsWith('GIF8')],
  ['png', b => b.readUInt32BE(0) === 0x89504e47],
  ['jpg', b => b[0] === 0xff && b[1] === 0xd8],
  ['webp', b => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP']
];
const kindOf = (b: Buffer) => (b.length > 16 ? MAGIC.find(([, test]) => test(b))?.[0] : undefined);
const MIME: Record<Kind, string> = { gif: 'image/gif', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
const FILE = /^[a-z0-9]{16}\.(gif|webp|png|jpg)$/;
const SRC = /^\/api\/media\/[a-z0-9]{16}\.(gif|webp|png|jpg)$/;
const LINK_MAX = 10 * 1024 * 1024;

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------------------- //
// | Private addresses | //
// --------------------- //
// The board only fetches public internet addresses for "Add from link":     //
// never anything on your own network (no SSRF), checked again after every   //
// redirect.                                                                 //
export function privateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return privateIp(v.slice(7));
  return v === '::' || v === '::1' || /^(fc|fd|fe[89ab]|ff)/.test(v);
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------- //
// | GIF sites | //
// ------------- //
// A GIPHY page or media link -> its id (GIPHY pages are built by script, so //
// read the id from the link)                                                //
function giphyId(u: string) {
  const m =
    /giphy\.com\/(?:gifs|stickers|clips|embed)\/(?:[\w-]*-)?([A-Za-z0-9]{8,40})(?:[/?#]|$)/.exec(u) ||
    /giphy\.com\/media\/(?:v1\.[^/]+\/)?([A-Za-z0-9]{8,40})\//.exec(u) ||
    /i\.giphy\.com\/(?:media\/)?([A-Za-z0-9]{8,40})/.exec(u);
  return m && m[1];
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------------------------- //
// | The picture a page shares | //
// ----------------------------- //
// The picture a web page shares (a GIF if it has one)                       //
function pageImage(html: string, base: string) {
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map(t => t[0]);
  const val = (want: string[]) => {
    for (const t of metas) {
      const key = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(t);
      const c = /content\s*=\s*["']([^"']+)["']/i.exec(t);
      if (key && c && want.includes(key[1].toLowerCase())) {
        try {
          return new URL(c[1].replace(/&amp;/g, '&'), base).href;
        } catch {
          /* not an address */
        }
      }
    }
    return null;
  };
  const all = metas
    .map(t => /content\s*=\s*["']([^"']+\.(?:gif|webp)(?:\?[^"']*)?)["']/i.exec(t))
    .filter(m => m !== null)
    .map(m => m[1].replace(/&amp;/g, '&'));
  return all.find(x => /\.gif/i.test(x)) || val(['og:image', 'twitter:image', 'og:image:url']) || all[0] || null;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------- //
// | The routes | //
// -------------- //
export function setup({
  app,
  db,
  kv,
  mediaDir,
  allowPrivateLinks, // tests only (the mock sites run on 127.0.0.1)
  testRoutes
}: {
  app: Express;
  db: DatabaseSync;
  kv: Kv;
  mediaDir: string;
  allowPrivateLinks: boolean;
  testRoutes: boolean;
}) {
  // --------------------- //
  // | Keeping a picture | //
  // --------------------- //
  // Named by its contents (a hash), so the same picture uploaded twice is   //
  // kept once.                                                              //
  function keep(buf: Buffer, kind: Kind) {
    fs.mkdirSync(mediaDir, { recursive: true });
    const file = `${crypto.randomBytes(8).toString('hex')}.${kind}`;
    fs.writeFileSync(path.join(mediaDir, file), buf);
    return { src: `/api/media/${file}` };
  }

  // ----------- //
  // | Uploads | //
  // ----------- //
  app.post('/api/media', express.raw({ type: () => true, limit: '10mb' }), (req, res) => {
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || buf.length < 16) return res.status(400).json({ error: 'No image received' });
    const kind = MAGIC.find(([, test]) => test(buf))?.[0];
    if (!kind) return res.status(400).json({ error: 'That file isn’t a GIF, PNG, JPEG or WebP' });
    res.json(keep(buf, kind));
  });

  // ---- from a link ----
  type Lookup = (err: Error | null, address?: string | dns.LookupAddress[], family?: number) => void;
  // -------------------------------- //
  // | Fetching from a link, safely | //
  // -------------------------------- //
  // The address a name points to is checked before connecting (and on every //
  // redirect, at most 5); at most 10 MB.                                    //
  function safeLookup(host: string, opts: dns.LookupOptions, cb: Lookup) {
    dns.lookup(host, { ...opts, all: true }, (err, addrs) => {
      if (err) return cb(err);
      if (!addrs.length || (!allowPrivateLinks && addrs.some(a => privateIp(a.address))))
        return cb(new Error('That link points at a private network address'));
      if (opts.all) cb(null, addrs);
      else cb(null, addrs[0].address, addrs[0].family);
    });
  }
  const tooBig = () => Object.assign(new Error('That GIF is over 10 MB'), { big: true });

  function linkGet(url: string, hops = 0): Promise<{ buf: Buffer; type: string; url: string }> {
    return new Promise((resolve, reject) => {
      let u: URL;
      try {
        u = new URL(url);
      } catch {
        return reject(new Error('That isn’t a link'));
      }
      if (!/^https?:$/.test(u.protocol) || u.username || u.password)
        return reject(new Error('Only http(s) links work'));
      if (u.port && !['80', '443'].includes(u.port) && !allowPrivateLinks)
        return reject(new Error('Only normal web links work'));
      const host = u.hostname.replace(/^\[|\]$/g, '');
      if (net.isIP(host) && privateIp(host) && !allowPrivateLinks)
        return reject(new Error('That link points at a private network address'));
      const req = (u.protocol === 'https:' ? https : http).get(
        u,
        {
          lookup: safeLookup as unknown as typeof dns.lookup,
          timeout: 15000,
          headers: {
            'User-Agent': 'FamilyChalkPlanner/1 (+link import)',
            Accept: 'image/gif,image/webp,image/*;q=0.9,text/html;q=0.8'
          }
        },
        r => {
          const status = r.statusCode || 0;
          if (status >= 300 && status < 400 && r.headers.location) {
            r.resume();
            if (hops >= 4) return reject(new Error('Too many redirects'));
            return resolve(linkGet(new URL(r.headers.location, u).href, hops + 1));
          }
          if (status !== 200) {
            r.resume();
            return reject(new Error(`The site answered ${status}`));
          }
          if (+(r.headers['content-length'] || 0) > LINK_MAX) {
            r.destroy();
            return reject(tooBig());
          }
          const parts: Buffer[] = [];
          let n = 0;
          r.on('data', (c: Buffer) => {
            n += c.length;
            if (n > LINK_MAX) {
              r.destroy();
              reject(tooBig());
            } else parts.push(c);
          });
          r.on('end', () =>
            resolve({ buf: Buffer.concat(parts), type: String(r.headers['content-type'] || ''), url: u.href })
          );
          r.on('error', reject);
        }
      );
      req.on('timeout', () => req.destroy(new Error('The site took too long')));
      req.on('error', reject);
    });
  }

  // ---------------------------- //
  // | From a link to a picture | //
  // ---------------------------- //
  // A link to the GIF itself, or a GIPHY / Tenor / KLIPY page: read the     //
  // page for the picture it shares, and fetch that.                         //
  async function imageFromLink(link: string): Promise<{ buf: Buffer; kind: Kind }> {
    const gid = giphyId(link);
    // GIPHY: the 200-pixel copy is plenty for the board and far lighter for the wall (originals can be 7 MB+)
    const tries = gid
      ? [`https://media.giphy.com/media/${gid}/200.gif`, `https://media.giphy.com/media/${gid}/giphy.gif`]
      : [link];
    let got: Awaited<ReturnType<typeof linkGet>> | undefined;
    let lastErr: unknown;
    for (const t of tries) {
      try {
        got = await linkGet(t);
        break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (!got) throw lastErr;
    let kind = kindOf(got.buf);
    if (!kind && /html/i.test(got.type)) {
      // a web page: take the picture it shares
      const img = pageImage(got.buf.toString('utf8', 0, 2e6), got.url);
      if (!img) throw new Error('No GIF found on that page — try “Copy image address” / “Copy GIF link”');
      if (giphyId(img)) return imageFromLink(img);
      got = await linkGet(img);
      kind = kindOf(got.buf);
    }
    if (!kind) throw new Error('That link isn’t a GIF, PNG, JPEG or WebP');
    return { buf: got.buf, kind };
  }

  const linkTries = new Map<string | undefined, number[]>();
  // ----------------- //
  // | Add from link | //
  // ----------------- //
  app.post('/api/media/fromlink', async (req, res) => {
    const link = String((req.body || {}).url || '')
      .trim()
      .slice(0, 2000);
    const now = Date.now();
    const t = (linkTries.get(req.ip) || []).filter(x => now - x < 60e3);
    t.push(now);
    linkTries.set(req.ip, t);
    if (t.length > 20) return res.status(429).json({ error: 'Too many links at once — wait a minute' });
    try {
      const { buf, kind } = await imageFromLink(link);
      res.json(keep(buf, kind));
    } catch (e) {
      res.status(400).json({ error: (e as Error).message || 'That link didn’t work' });
    }
  });

  // --------------------- //
  // | Showing a picture | //
  // --------------------- //
  app.get('/api/media/:file', (req, res) => {
    const m = FILE.exec(req.params.file);
    if (!m) return res.sendStatus(404);
    res.set('Cache-Control', 'public, max-age=31536000, immutable').type(MIME[m[1] as Kind]);
    res.sendFile(path.join(mediaDir, req.params.file), err => {
      if (err && !res.headersSent) res.sendStatus(404);
    });
  });

  // ----------- //
  // | Tidy-up | //
  // ----------- //
  // Pictures that nothing uses any more (not on any month, not in the GIF   //
  // library, not in a stamp) and are over 30 days old are removed once a    //
  // day, so the backups don't grow forever.                                 //
  function inUse() {
    const used = new Set<string>();
    for (const table of ['strokes', 'stamps', 'kv', 'month_meta'])
      for (const r of db.prepare(`SELECT data FROM ${table} WHERE data LIKE '%/api/media/%'`).all() as {
        data: string;
      }[])
        for (const m of r.data.matchAll(/\/api\/media\/([a-z0-9]{16}\.(?:gif|webp|png|jpg))/g)) used.add(m[1]);
    return used;
  }
  function clean(maxAgeDays = 30) {
    let removed = 0;
    try {
      if (!fs.existsSync(mediaDir)) return 0;
      const used = inUse();
      const cutoff = Date.now() - maxAgeDays * 86400e3;
      for (const f of fs.readdirSync(mediaDir)) {
        if (!FILE.test(f) || used.has(f)) continue;
        const full = path.join(mediaDir, f);
        if (fs.statSync(full).mtimeMs < cutoff) {
          fs.unlinkSync(full);
          removed++;
        }
      }
      if (removed) console.log(`Chalkboard: removed ${removed} unused picture(s) from media`);
    } catch (e) {
      console.error('Chalkboard: media tidy-up failed:', (e as Error).message);
    }
    return removed;
  }
  setTimeout(clean, 60e3).unref();
  setInterval(clean, 24 * 3600e3).unref();
  if (testRoutes) app.post('/api/test/clean-media', (req, res) => res.json({ removed: clean(+req.body.days || 0) }));

  // ---- the GIF library (what you have uploaded) ----
  interface Gif {
    id: string;
    src: string;
    still: string;
    w: number;
    h: number;
  }
  // ------------------- //
  // | The GIF library | //
  // ------------------- //
  const gifs = () => kv.get<Gif[]>('gifs') || [];
  app.get('/api/gifs', (_req, res) => res.json(gifs()));
  app.post('/api/gifs/add', (req, res) => {
    const { src, still, w, h } = req.body || {};
    const ok = (v: unknown): v is string => typeof v === 'string' && SRC.test(v);
    if (!ok(src)) return res.status(400).json({ error: 'bad gif' });
    const size = (v: unknown) => Math.min(Math.max(Number(v) || 100, 1), 4000);
    const item: Gif = {
      id: crypto.randomBytes(6).toString('hex'),
      src,
      still: ok(still) ? still : src,
      w: size(w),
      h: size(h)
    };
    kv.set('gifs', [item, ...gifs()].slice(0, 200));
    res.json(item);
  });
  app.post('/api/gifs/delete', (req, res) => {
    const id = (req.body || {}).id;
    kv.set(
      'gifs',
      gifs().filter(g => g.id !== id)
    );
    res.json({ ok: true }); // files stay, in case a GIF on some month still uses it
  });
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
