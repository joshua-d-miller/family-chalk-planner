/*
===============================================================================
 Family Chalk Planner | Server | Photos | immich.ts
===============================================================================
 Version:   0.13.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-07
 Updated:   2026-11-07

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
===============================================================================
*/

import crypto from 'node:crypto';
import type { AlbumPhoto } from './albums.ts';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------- //
// | Types | //
// --------- //
export interface ImmichSource {
  url: string; // the server, as you open Immich (http://192.168.1.50:2283)
  key?: string; // an API key (Account Settings → API Keys): album.read, asset.read, asset.view, person.read
  album?: string; // an album's name or id, 'favorites', 'all' or 'thisday'; empty = Favorites, else recent
  shareKey?: string; // or a share link's key, with no API key
}
export interface ImmichPhoto extends AlbumPhoto {
  fallbackUrl: string; // the smaller copy, if the preview won't come
  headers: Record<string, string>;
  faces?: number[][]; // [x, y, w, h], 0-1
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------------- //
// | The server address | //
// ---------------------- //
// Whatever was pasted from the address bar: no /api, no web-page path       //
// (/photos, /albums/…, /auth/login…)                                        //
export function normalizeImmichUrl(u: string) {
  return String(u || '')
    .trim()
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
  let r: Response;
  try {
    r = await fetch(`${base}${apiPath}`, { ...opts, headers, signal: AbortSignal.timeout(30000) });
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
export function toPhotos(assets: any[], base: string, key?: string, shareKey?: string): ImmichPhoto[] {
  const out: ImmichPhoto[] = [];
  const seen = new Set<string>();
  for (const a of assets || []) {
    if (!a?.id || a.isTrashed || a.isArchived || seen.has(a.id)) continue;
    if (String(a.type || '').toUpperCase() === 'VIDEO' || /video|mp4|quicktime/i.test(String(a.originalMimeType || '')))
      continue;
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
      ...(faces.length ? { faces } : {})
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
// ---------------------- //
// | Reading the photos | //
// ---------------------- //
// An album by name, Favorites, everything, or a share link.                 //
export async function readImmich(src: ImmichSource, today: string): Promise<ImmichPhoto[]> {
  if (src.shareKey) {
    const k = encodeURIComponent(src.shareKey);
    const info = await request(src.url, undefined, `/api/shared-links/me?key=${k}`);
    let assets = info?.assets?.length ? info.assets : info?.album?.assets || [];
    if (!assets.length && info?.album?.id) {
      const alb = await request(src.url, undefined, `/api/albums/${encodeURIComponent(info.album.id)}?key=${k}`);
      assets = alb?.assets || [];
    }
    return toPhotos(assets, src.url, undefined, src.shareKey);
  }
  const search = async (extra: Record<string, unknown>) => {
    const r = await request(src.url, src.key, '/api/search/metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'IMAGE', size: 250, withExif: true, withPeople: true, ...extra })
    });
    return Array.isArray(r?.assets?.items) ? r.assets.items : Array.isArray(r) ? r : [];
  };
  const photos = (assets: any[]) => toPhotos(assets, src.url, src.key);
  const want = (src.album || '').trim();
  const kind = want.toLowerCase();
  if (['__thisday__', 'thisday', 'on this day'].includes(kind)) {
    const all = photos(await search({}));
    const hits = onThisDay(all, today);
    return hits.length ? hits : all; // nothing from this day: recent photos, so the slideshow isn't empty
  }
  if (['__favorites__', 'favorites'].includes(kind)) return photos(await search({ isFavorite: true }));
  if (['__all__', 'all'].includes(kind)) return photos(await search({}));
  const albumAssets = async (id: string) =>
    (await request(src.url, src.key, `/api/albums/${encodeURIComponent(id)}`))?.assets || [];
  if (want) {
    let id = want;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(want)) {
      const hit = (await immichAlbums(src.url, src.key || '')).find(a => a.name.toLowerCase() === kind);
      if (!hit) throw new Error(`Immich album “${want}” not found`);
      id = hit.id;
    }
    return photos(await albumAssets(id));
  }
  // nothing chosen: Favorites, else recent photos, else the first album with photos
  const favs = await search({ isFavorite: true }).catch(() => []);
  if (favs.length) return photos(favs);
  const recent = await search({}).catch(() => []);
  if (recent.length) return photos(recent);
  const first = (await immichAlbums(src.url, src.key || '')).find(a => a.count > 0);
  return first ? photos(await albumAssets(first.id)) : [];
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
