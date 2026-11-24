/*
===============================================================================
 Family Chalk Planner | Server | Photos | albums.ts
===============================================================================
 Version:   1.2.8
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-06
 Updated:   2026-11-24

 Purpose:
     Reading a shared photo album, the way the album's own web page reads
     it (no sign-in):
      - an iCloud Shared Album (link sharing, "anyone with the link"),
          through CloudKit
      - a Google Photos shared album (Share -> Create link)
     Neither is an official API, so either company could change it without
     notice.

 Used by:
     server/photos/immich.ts
     server/photos/photos.ts
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-06   joshua    Move photos, pages and the console's board
                        claude    settings into TypeScript modules.

 0.15.1    2026-11-10   joshua    When iCloud won't open the album, says iCloud
                        claude    may be down (and passes on iCloud's reason).

 1.2.8    2026-11-24   joshua    Only photos.google.com itself is swapped
                        claude    for the stand-in (never
                                  photos.google.com.example.org).
===============================================================================
*/

import crypto from 'node:crypto';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------- //
// | Types | //
// --------- //
export interface AlbumPhoto {
  id: string;
  url: string;
  w: number;
  h: number;
  date: number;
}

export interface AlbumConfig {
  url: string; // the album's share link
  googleHost?: string; // stand-ins for the real services (tests only)
  ckHost?: string;
}

export const GP_UA = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  'Accept-Language': 'en'
};
const CK = 'database/1/com.apple.photos.cloud/production';

export const albumKind = (cfg: AlbumConfig) =>
  /^https:\/\/(photos\.app\.goo\.gl|goo\.gl\/photos|photos\.google\.com\/(u\/\d+\/)?share)\//i.test(cfg.url) ||
  cfg.googleHost
    ? 'google'
    : 'icloud';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------------- //
// | Only from the album service | //
// ------------------------------- //
// Only download from the album service's own image hosts                    //
export function imageHostOk(cfg: AlbumConfig, u: string) {
  return albumKind(cfg) === 'google'
    ? !!cfg.googleHost || /^https:\/\/lh\d\.googleusercontent\.com\//.test(u)
    : !!cfg.ckHost || /^https:\/\/[a-z0-9.-]+\.(icloud-content\.com|icloud\.com)\//.test(u);
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------------- //
// | Reading an album | //
// -------------------- //
export function readAlbum(cfg: AlbumConfig): Promise<AlbumPhoto[]> {
  return albumKind(cfg) === 'google' ? googleAlbum(cfg) : icloudAlbum(cfg);
}

// ---- iCloud ----
/* eslint-disable @typescript-eslint/no-explicit-any -- CloudKit's records are loosely shaped JSON */

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------ //
// | iCloud Shared Albums | //
// ------------------------ //
// Through CloudKit, the way the album's own web page does it.               //
async function ckPost(url: string, body: unknown): Promise<any> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000)
  });
  if (!r.ok) throw new Error(`iCloud said ${r.status}`);
  return r.json();
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------------------------- //
// | Apple's records -> photos | //
// ----------------------------- //
// Apple's records -> photos, newest first. CPLAsset = the photo in the      //
// album (date, hidden, edits); CPLMaster = the file, with ready-made JPEG   //
// versions. resJPEGMedRes is ~2048 px and already upright, the right size   //
// for the wall. Videos are skipped.                                         //
export function photoAssets(records: any[]): AlbumPhoto[] {
  const masters = new Map(
    records.filter(r => r.recordType === 'CPLMaster' && !r.deleted && r.fields).map(r => [r.recordName, r.fields])
  );
  const out: AlbumPhoto[] = [];
  const seen = new Set<string>();
  for (const r of records) {
    if (r.recordType !== 'CPLAsset' || r.deleted || !r.fields) continue;
    const f = r.fields;
    const v = (k: string) => (f[k] ? f[k].value : undefined);
    if (v('isHidden') || v('isDeleted') || v('trashReason')) continue;
    const m = masters.get(((f.masterRef || {}).value || {}).recordName);
    if (!m) continue;
    if (/movie|mpeg|video/i.test(String((m.itemType || {}).value))) continue;
    // an edited photo carries its own rendered JPEG; otherwise use the master's.
    // Small JPEG/PNG originals get no resized copy from Apple, so use the original itself.
    const origOk =
      /^public\.(jpeg|png)$/.test(String((m.resOriginalFileType || {}).value)) &&
      ((m.resOriginalRes || {}).value || {}).size < 20e6;
    const pick = (
      [
        [f, 'resJPEGMedRes', 'resJPEGMed'],
        [f, 'resJPEGFullRes', 'resJPEGFull'],
        [m, 'resJPEGMedRes', 'resJPEGMed'],
        [m, 'resJPEGFullRes', 'resJPEGFull']
      ] as [any, string, string][]
    )
      .concat(origOk ? [[m, 'resOriginalRes', 'resOriginal']] : [])
      .find(([src, k]) => src[k] && src[k].value && src[k].value.downloadURL);
    if (!pick) continue;
    const [src, k, p] = pick;
    const sum: string = src[k].value.fileChecksum || '';
    const same = sum + '|' + (f.masterRef.value.recordName || '');
    if (seen.has(same) || seen.has(sum)) continue; // the same picture added twice shows once
    seen.add(same);
    if (sum) seen.add(sum);
    out.push({
      id: crypto
        .createHash('sha1')
        .update(r.recordName + '|' + sum)
        .digest('hex')
        .slice(0, 24),
      url: src[k].value.downloadURL.replace('${f}', 'photo.jpg'),
      w: (src[p + 'Width'] || {}).value || 0,
      h: (src[p + 'Height'] || {}).value || 0,
      date: v('assetDate') || v('addedDate') || 0
    });
  }
  return out.sort((a, b) => b.date - a.date);
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------- //
// | An iCloud album | //
// ------------------- //
async function icloudAlbum(cfg: AlbumConfig) {
  const ckHost = cfg.ckHost || 'https://ckdatabasews.icloud.com';
  const guid = (/\/album\/([A-Za-z0-9_-]{10,})/.exec(cfg.url) || [])[1];
  if (!guid) throw new Error('PHOTO_ALBUM_URL doesn’t look like an iCloud or Google Photos shared album link');
  const res = (
    await ckPost(`${ckHost}/${CK}/public/records/resolve?remapEnums=true`, {
      shortGUIDs: [{ value: guid, shouldFetchRootRecord: true }]
    })
  ).results[0];
  // iCloud says why when it can (an outage looks like this too, so the message says both)
  if (!res || !res.anonymousPublicAccess)
    throw new Error(
      `iCloud didn’t open the album${res?.serverErrorCode ? ` (${res.serverErrorCode}${res.reason ? ': ' + res.reason : ''})` : ''}: iCloud may be down, or the album isn’t shared by link (set “anyone with the link”)`
    );
  const part = String(res.anonymousPublicAccess.databasePartition || '');
  const host = /^https:\/\/[a-z0-9-]+\.icloud\.com(:443)?$/.test(part) ? part.replace(/:443$/, '') : ckHost;
  const qs = `?remapEnums=true&sharing_url_key=${encodeURIComponent(guid)}&publicAccessAuthToken=${encodeURIComponent(res.anonymousPublicAccess.token)}`;
  let records: any[] = [];
  let syncToken: string | undefined;
  let more = true;
  for (let i = 0; more && i < 50; i++) {
    const z = (
      await ckPost(`${host}/${CK}/shared/changes/zone${qs}`, {
        zones: [{ zoneID: res.zoneID, ...(syncToken ? { syncToken } : {}) }]
      })
    ).zones[0];
    records = records.concat(z.records || []);
    syncToken = z.syncToken;
    more = z.moreComing;
  }
  return photoAssets(records);
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------------- //
// | Google Photos | //
// ----------------- //
// Each item is [itemId, [imageUrl, w, h, ...], takenMs, hash, ?, addedMs,   //
// ..., {extra}]. Image URLs take size options: "=w2048-h2048" = fit inside  //
// 2048 px, already upright.                                                 //
export function gpItems(items: any[]): AlbumPhoto[] {
  const out: AlbumPhoto[] = [];
  for (const e of items || []) {
    if (!Array.isArray(e) || typeof e[0] !== 'string' || !Array.isArray(e[1]) || typeof e[1][0] !== 'string') continue;
    const extra = e.find(x => x && typeof x === 'object' && !Array.isArray(x)) || {};
    if ('76647426' in extra) continue; // a video
    const [url, w, h] = e[1];
    out.push({
      id: 'g' + crypto.createHash('sha1').update(e[0]).digest('hex').slice(0, 23),
      url: url + '=w2048-h2048',
      w: +w || 0,
      h: +h || 0,
      date: +e[2] || +e[5] || 0
    });
  }
  return out;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------- //
// | A Google Photos album | //
// ------------------------- //
// The shared page carries a token; the photos come from the same call the   //
// page itself makes.                                                        //
async function googleAlbum(cfg: AlbumConfig) {
  const gpHost = cfg.googleHost || 'https://photos.google.com';
  // only photos.google.com itself (the address ends there or a / follows), never photos.google.com.example.org
  const page = await fetch(cfg.url.replace(/^https:\/\/photos\.google\.com(?=\/|$)/i, gpHost), {
    headers: GP_UA,
    redirect: 'follow',
    signal: AbortSignal.timeout(30000)
  });
  if (page.status === 404)
    throw new Error('Google Photos album not found - check the link, and that link sharing is on');
  if (!page.ok) throw new Error(`Google Photos said ${page.status}`);
  const html = await page.text();
  const at = new URL(page.url);
  const id = (/\/share\/([\w-]{10,})/.exec(at.pathname) || [])[1];
  const key = at.searchParams.get('key');
  if (!id || !key) throw new Error('That Google Photos link doesn’t open a shared album (Share -> Create link)');
  // the first page is in the page itself; later pages come from the same call Google's page makes
  let items: any[] = [];
  let next: string | null = null;
  const m = /AF_initDataCallback\(\{key: 'ds:1'[\s\S]*?data:([\s\S]*?), sideChannel: \{\}\}\);<\/script>/.exec(html);
  if (m) {
    try {
      const d = JSON.parse(m[1]);
      items = d[1] || [];
      next = d[2] || null;
    } catch {
      /* fall through to the call below */
    }
  }
  const rpc = async (token: string | null) => {
    const body = new URLSearchParams({
      'f.req': JSON.stringify([[['snAcKc', JSON.stringify([id, token, null, key])]]])
    });
    const r = await fetch(`${gpHost}/_/PhotosUi/data/batchexecute`, {
      method: 'POST',
      headers: { ...GP_UA, 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body,
      signal: AbortSignal.timeout(30000)
    });
    if (!r.ok) throw new Error(`Google Photos said ${r.status}`);
    const list = JSON.parse((await r.text()).replace(/^\)\]\}'/, ''));
    const hit = list.find((x: any) => Array.isArray(x) && x[1] === 'snAcKc');
    if (!hit || !hit[2])
      throw new Error('Google Photos sent something unexpected (it may have changed how albums work)');
    const d = JSON.parse(hit[2]);
    return { items: (d[1] || []) as any[], next: (d[2] || null) as string | null };
  };
  if (!m) ({ items, next } = await rpc(null));
  for (let i = 0; next && i < 40; i++) {
    const p = await rpc(next);
    items = items.concat(p.items);
    next = p.next;
  }
  return gpItems(items).sort((a, b) => b.date - a.date);
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
