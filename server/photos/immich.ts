/*
===============================================================================
 Family Chalk Planner | Server | Photos | immich.ts
===============================================================================
 Version:   1.3.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-07
 Updated:   2026-11-28

 Purpose:
     Immich (a photo server many families run at home): an album,
     Favorites, everything, or "on this day", read with an API key; or an
     Immich share link, read with no key. From Colby Way's board. Immich
     already knows where the faces are, so those come along for framing.

 Used by:
     server/photos/photos.ts
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    Immich photos, slideshow extras, a filled-in
                        colby     today, and the frame's thickness.
                        claude

 1.1.0    2026-11-17   joshua    Immich 3: an album's photos come from its
                        claude    timeline (it no longer lists them with the
                                  album), share links too; searches page
                                  through every result (cursor or page
                                  number).

 1.2.8    2026-11-24   joshua    Every Immich address passes the one address
                        claude    check (server/address.ts); an address
                                  longer than any real one isn't read.

                                  Immich requests go through safeFetch() (the
                                  name and every redirect checked).

 1.3.0    2026-11-28   joshua    person:<name or id>: every photo of someone
                        claude    Immich knows. memories: today's. Videos
                                  too (videos on), up to VIDEO_MAX seconds.
===============================================================================
*/

import crypto from 'node:crypto';
import type { AlbumPhoto } from './albums.ts';
import { checkedAddress, safeFetch } from '../address.ts';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------- //
// | Types | //
// --------- //
export interface ImmichSource {
  url: string; // the server, as you open Immich (http://192.168.1.50:2283)
  key?: string; // an API key (Account Settings → API Keys): album.read, asset.read, asset.view, person.read
  album?: string; // an album's name or id, 'favorites', 'all', 'thisday', 'memories' or 'person:<name or id>'; empty = Favorites, else recent
  shareKey?: string; // or a share link's key, with no API key
  videos?: boolean; // videos too (⚙️ Board → Photos → Videos), up to VIDEO_MAX seconds each
}
export interface ImmichPhoto extends AlbumPhoto {
  fallbackUrl: string; // the smaller copy, if the preview won't come
  headers: Record<string, string>;
  faces?: number[][]; // [x, y, w, h], 0-1
  video?: string; // a video: where to get it (an MP4 Immich makes for playing); url is its still picture
  secs?: number; // how long it is
}
export const VIDEO_MAX = 120; // seconds: a longer video is left out (the slideshow isn't a film)
// "0:00:12.345678" (Immich's duration) -> seconds
const secsOf = (d: unknown) => {
  const m = /^(\d+):(\d\d):(\d\d(?:\.\d+)?)$/.exec(String(d || ''));
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0;
};

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------------- //
// | The server address | //
// ---------------------- //
// Whatever was pasted from the address bar: no /api, no web-page path       //
// (/photos, /albums/…, /auth/login…)                                        //
export function normalizeImmichUrl(u: string) {
  const s = String(u || '').trim();
  if (s.length > 2048) return ''; // longer than any real address: not one (and the patterns below stay quick)
  return s
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
    .replace(
      /\/(photos|albums|album|people|explore|favorites|sharing|search|map|user-settings|admin|auth\/login|auth)(\/.*)?$/i,
      ''
    )
    .replace(/\/api(\/.*)?$/i, '')
    .replace(/\/+$/, '');
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------- //
// | A share link | //
// ---------------- //
// An Immich share link ("https://immich.example/share/<key>"), not iCloud   //
// or Google                                                                 //
export function immichShare(link: string): ImmichSource | null {
  const m = /^(https?:\/\/[^/]+(?:\/[^/]+)*?)\/share\/([A-Za-z0-9_-]{10,})/i.exec(link || '');
  if (!m || /photos\.google\.com|icloud\.com|goo\.gl/i.test(m[1])) return null;
  return { url: normalizeImmichUrl(m[1]), shareKey: m[2] };
}

/* eslint-disable @typescript-eslint/no-explicit-any -- Immich's replies are large JSON objects */

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------------- //
// | Asking Immich | //
// ----------------- //
async function request(base: string, key: string | undefined, apiPath: string, opts: RequestInit = {}): Promise<any> {
  const headers = { Accept: 'application/json', ...(key ? { 'x-api-key': key } : {}), ...(opts.headers || {}) };
  // the one address check (server/address.ts): a typed address is only fetched once it's passed, and
  // safeFetch() checks where its name leads and every redirect too
  const url = checkedAddress(`${base}${apiPath}`);
  if (!url) throw new Error('That isn’t an Immich server address (like http://192.168.1.50:2283)');
  let r: Response;
  try {
    r = await safeFetch(url, {
      method: opts.method,
      body: typeof opts.body === 'string' ? opts.body : undefined,
      headers: headers as Record<string, string>,
      signal: AbortSignal.timeout(30000)
    });
  } catch (e) {
    throw new Error(`Couldn’t reach Immich at ${base} (${(e as Error).message})`, { cause: e });
  }
  const where = apiPath.replace(/\?.*$/, '');
  if (r.status === 401) throw new Error('Immich didn’t accept the API key: check you copied the whole key');
  if (r.status === 403)
    throw new Error(
      `The Immich API key is missing a permission for ${where}: it needs album.read, asset.read and asset.view (person.read too, for framing faces)`
    );
  if (r.status === 404)
    throw new Error(
      `Immich answered 404 for ${base}${where}: that isn’t the Immich server. Use the address you open Immich at, like http://192.168.1.50:2283 (nothing after the port)`
    );
  if (!r.ok) throw new Error(`Immich answered ${r.status}`);
  return r.json();
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------------ //
// | The albums (admin console) | //
// ------------------------------ //
export async function immichAlbums(base: string, key: string) {
  const [own, shared] = await Promise.all([
    request(base, key, '/api/albums'),
    request(base, key, '/api/albums?shared=true').catch(() => [])
  ]);
  const out: { id: string; name: string; count: number; shared: boolean }[] = [];
  for (const a of [...(Array.isArray(own) ? own : []), ...(Array.isArray(shared) ? shared : [])]) {
    if (!a?.id || out.some(x => x.id === a.id)) continue;
    out.push({
      id: String(a.id),
      name: String(a.albumName || 'Untitled'),
      count: a.assetCount ?? (Array.isArray(a.assets) ? a.assets.length : 0),
      shared: !!a.shared
    });
  }
  return out;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------------------------------- //
// | Immich photos -> board photos | //
// --------------------------------- //
// With the faces Immich found, for framing.                                 //
export function toPhotos(assets: any[], base: string, key?: string, shareKey?: string, videos = false): ImmichPhoto[] {
  const out: ImmichPhoto[] = [];
  const seen = new Set<string>();
  for (const a of assets || []) {
    if (!a?.id || a.isTrashed || a.isArchived || seen.has(a.id)) continue;
    if (['archive', 'hidden', 'locked'].includes(String(a.visibility || '').toLowerCase())) continue; // (newer Immich)
    const isVideo =
      String(a.type || '').toUpperCase() === 'VIDEO' || /video|mp4|quicktime/i.test(String(a.originalMimeType || ''));
    const secs = isVideo ? secsOf(a.duration) : 0;
    if (isVideo && (!videos || secs > VIDEO_MAX)) continue;
    seen.add(a.id);
    const ex = a.exifInfo || {};
    let w = +ex.exifImageWidth || +a.width || 0;
    let h = +ex.exifImageHeight || +a.height || 0;
    if (/^(5|6|7|8|.*90|.*270)/i.test(String(ex.orientation || '')) && w && h) [w, h] = [h, w]; // turned on its side
    const faces: number[][] = [];
    const raw = [
      ...(Array.isArray(a.people) ? a.people : []).flatMap((p: any) => (Array.isArray(p.faces) ? p.faces : [])),
      ...(Array.isArray(a.unassignedFaces) ? a.unassignedFaces : [])
    ];
    for (const f of raw) {
      const iw = +f.imageWidth || w;
      const ih = +f.imageHeight || h;
      if (!(iw > 0 && ih > 0) || f.boundingBoxX1 == null || f.boundingBoxX2 == null) continue;
      const x = Math.max(0, Math.min(1, f.boundingBoxX1 / iw));
      const y = Math.max(0, Math.min(1, f.boundingBoxY1 / ih));
      const fw = Math.max(0, Math.min(1 - x, (f.boundingBoxX2 - f.boundingBoxX1) / iw));
      const fh = Math.max(0, Math.min(1 - y, (f.boundingBoxY2 - f.boundingBoxY1) / ih));
      if (fw > 0.01 && fh > 0.01) faces.push([+x.toFixed(4), +y.toFixed(4), +fw.toFixed(4), +fh.toFixed(4)]);
    }
    const qs = (size: string) => new URLSearchParams({ size, ...(shareKey ? { key: shareKey } : {}) }).toString();
    const thumb = `${base}/api/assets/${encodeURIComponent(a.id)}/thumbnail`;
    out.push({
      id:
        'im_' +
        crypto
          .createHash('sha1')
          .update(String(a.id) + '|' + String(a.checksum || ''))
          .digest('hex')
          .slice(0, 21),
      url: `${thumb}?${qs('preview')}`,
      fallbackUrl: `${thumb}?${qs('thumbnail')}`,
      headers: key ? { 'x-api-key': key } : {},
      w,
      h,
      date: Date.parse(a.localDateTime || a.fileCreatedAt || ex.dateTimeOriginal || a.createdAt || '') || 0,
      ...(faces.length ? { faces } : {}),
      ...(isVideo
        ? {
            video: `${base}/api/assets/${encodeURIComponent(a.id)}/video/playback${shareKey ? '?' + new URLSearchParams({ key: shareKey }) : ''}`,
            ...(secs ? { secs } : {})
          }
        : {})
    });
  }
  return out.sort((a, b) => b.date - a.date);
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------------- //
// | On this day | //
// --------------- //
// Photos taken on today's date in earlier years (month and day as `today`,  //
// YYYY-MM-DD)                                                               //
export function onThisDay<T extends { date: number }>(photos: T[], today: string) {
  const [y, m, d] = today.split('-').map(Number);
  return photos.filter(p => {
    if (!p.date) return false;
    const t = new Date(p.date);
    return t.getFullYear() < y && t.getMonth() + 1 === m && t.getDate() === d;
  });
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------------------ //
// | An album's photos, on any Immich | //
// ------------------------------------ //
// Older Immich lists an album's photos with the album; Immich 3 only        //
// counts them, so they're read from its timeline instead (month by month,   //
// the way Immich's own album page does; it works with a share link too).    //
// The timeline gives each photo's shape, not its size or faces.             //
const MAX_PHOTOS = 20000; // a sanity limit for one album or search
async function albumAssets(base: string, key: string | undefined, id: string, shareKey?: string): Promise<any[]> {
  const k = shareKey ? `key=${encodeURIComponent(shareKey)}` : '';
  const alb = await request(base, key, `/api/albums/${encodeURIComponent(id)}${k ? '?' + k : ''}`);
  if (Array.isArray(alb?.assets) && alb.assets.length) return alb.assets;
  if (!(alb?.assetCount > 0)) return [];
  const q = (more: string) => `albumId=${encodeURIComponent(id)}${k ? '&' + k : ''}${more}`;
  const buckets = await request(base, key, `/api/timeline/buckets?${q('')}`);
  const out: any[] = [];
  for (const b of Array.isArray(buckets) ? buckets : []) {
    if (!b?.timeBucket || out.length >= MAX_PHOTOS) continue;
    const c = await request(base, key, `/api/timeline/bucket?${q('&timeBucket=' + encodeURIComponent(b.timeBucket))}`);
    const ids: string[] = Array.isArray(c?.id) ? c.id : [];
    ids.forEach((aid, i) => {
      const ratio = +c.ratio?.[i] || 1;
      out.push({
        id: aid,
        type: c.isImage?.[i] === false ? 'VIDEO' : 'IMAGE',
        duration: c.duration?.[i],
        fileCreatedAt: c.fileCreatedAt?.[i],
        width: Math.round(1000 * ratio),
        height: 1000,
        isTrashed: !!c.isTrashed?.[i],
        visibility: c.visibility?.[i]
      });
    });
  }
  return out;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------------- //
// | Reading the photos | //
// ---------------------- //
// An album by name, Favorites, everything, or a share link.                 //
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function readImmich(src: ImmichSource, today: string): Promise<ImmichPhoto[]> {
  if (src.shareKey) {
    const k = encodeURIComponent(src.shareKey);
    const info = await request(src.url, undefined, `/api/shared-links/me?key=${k}`);
    let assets = info?.assets?.length ? info.assets : info?.album?.assets || [];
    if (!assets.length && info?.album?.id) assets = await albumAssets(src.url, undefined, info.album.id, src.shareKey);
    return toPhotos(assets, src.url, undefined, src.shareKey, src.videos);
  }
  // a search, page after page (Immich 3.2+ hands back a cursor, older ones a page number)
  const search = async (extra: Record<string, unknown>) => {
    const all: any[] = [];
    let more: Record<string, unknown> = {};
    for (;;) {
      const r = await request(src.url, src.key, '/api/search/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(src.videos ? {} : { type: 'IMAGE' }),
          size: 1000,
          withExif: true,
          withPeople: true,
          ...extra,
          ...more
        })
      });
      const items = Array.isArray(r?.assets?.items) ? r.assets.items : Array.isArray(r) ? r : [];
      all.push(...items);
      const cursor = r?.assets?.nextCursor;
      const page = r?.assets?.nextPage;
      if (!items.length || all.length >= MAX_PHOTOS) break;
      if (cursor) more = { cursor };
      else if (page) more = { page: +page };
      else break;
    }
    return all;
  };
  const photos = (assets: any[]) => toPhotos(assets, src.url, src.key, undefined, src.videos);
  const want = (src.album || '').trim();
  const kind = want.toLowerCase();
  if (['__thisday__', 'thisday', 'on this day'].includes(kind)) {
    const all = photos(await search({}));
    const hits = onThisDay(all, today);
    return hits.length ? hits : all; // nothing from this day: recent photos, so the slideshow isn't empty
  }
  // Immich's memories for today ("on this day" years ago, and the like); none today: this day in other years
  if (kind === 'memories') {
    const now = Date.now();
    const r = await request(
      src.url,
      src.key,
      `/api/memories?for=${encodeURIComponent(new Date(today + 'T12:00:00').toISOString())}`
    );
    const list: any[] = Array.isArray(r) ? r : [];
    const showing = list.filter(
      m => !m?.isTrashed && (!m?.showAt || Date.parse(m.showAt) <= now) && (!m?.hideAt || Date.parse(m.hideAt) > now)
    );
    const hits = photos(showing.flatMap(m => (Array.isArray(m?.assets) ? m.assets : [])));
    if (hits.length) return hits;
    const all = photos(await search({}));
    const day = onThisDay(all, today);
    return day.length ? day : all;
  }
  // a person Immich knows ("person:Nora", or their id): every photo they're in
  const person = /^person:\s*(.+)$/i.exec(want);
  if (person) {
    const who = person[1].trim();
    let id = who;
    if (!UUID.test(who)) {
      const r = await request(src.url, src.key, '/api/people?withHidden=false&size=1000');
      const people: any[] = Array.isArray(r?.people) ? r.people : Array.isArray(r) ? r : [];
      const hit = people.find(p => String(p?.name || '').toLowerCase() === who.toLowerCase());
      if (!hit) throw new Error(`Immich has nobody named “${who}” (name them in Immich's People first)`);
      id = String(hit.id);
    }
    return photos(await search({ personIds: [id] }));
  }
  if (['__favorites__', 'favorites'].includes(kind)) return photos(await search({ isFavorite: true }));
  if (['__all__', 'all'].includes(kind)) return photos(await search({}));
  if (want) {
    let id = want;
    if (!UUID.test(want)) {
      const hit = (await immichAlbums(src.url, src.key || '')).find(a => a.name.toLowerCase() === kind);
      if (!hit) throw new Error(`Immich album “${want}” not found`);
      id = hit.id;
    }
    return photos(await albumAssets(src.url, src.key, id));
  }
  // nothing chosen: Favorites, else recent photos, else the first album with photos
  const favs = await search({ isFavorite: true }).catch(() => []);
  if (favs.length) return photos(favs);
  const recent = await search({}).catch(() => []);
  if (recent.length) return photos(recent);
  const first = (await immichAlbums(src.url, src.key || '')).find(a => a.count > 0);
  return first ? photos(await albumAssets(src.url, src.key, first.id)) : [];
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
