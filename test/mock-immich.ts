/*
===============================================================================
 Family Chalk Planner | Tests | mock-immich.ts
===============================================================================
 Version:   1.2.8
 Author:    Joshua D. Miller, Colby Way, Claude
 Updated:   2026-11-24

 Purpose:
     Stand-in for an Immich server (the calls the board makes), for tests.
     One API key ('KEY'), two albums (one shared with us), favorites, and
     a share link ('SHAREKEY0001'). Previews come back as WebP.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    Immich photos, slideshow extras, a filled-in
                        colby     today, and the frame's thickness.
                        claude

 1.1.0    2026-11-17   joshua    A big album (20 photos) for picking, a few
                        claude    at random, and keeping only a few copies.
                                  The big album acts like Immich 3: the album
                                  only counts its photos, which are on its
                                  timeline.

 1.2.8    2026-11-24   joshua    Whole pictures from
                        claude    test/sample-pictures.ts.
===============================================================================
*/

import http from 'node:http';
import { JPEG, WEBP } from './sample-pictures.ts';

export const KEY = 'KEY';
export const SHARE = 'SHAREKEY0001';

const asset = (id: string, date: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: 'IMAGE',
  checksum: 'c' + id,
  localDateTime: date,
  exifInfo: { exifImageWidth: 4000, exifImageHeight: 3000 },
  ...extra
});
const kids = [
  asset('a1', '2025-07-04T10:00:00Z', {
    people: [
      {
        faces: [
          {
            imageWidth: 4000,
            imageHeight: 3000,
            boundingBoxX1: 1000,
            boundingBoxY1: 600,
            boundingBoxX2: 1400,
            boundingBoxY2: 1100
          }
        ]
      }
    ]
  }),
  asset('a2', '2024-12-25T09:00:00Z'),
  asset('v1', '2025-01-01T00:00:00Z', { type: 'VIDEO' })
];
const trip = [asset('b1', '2023-06-01T12:00:00Z'), asset('b2', '2023-06-02T12:00:00Z', { isTrashed: true })];
const favorites = [kids[1]];
// a big album (20 photos, one a day in March 2024): for picking, a few at random, and a few copies
export const BIG = Array.from({ length: 20 }, (_, i) =>
  asset('big' + String(i + 1).padStart(2, '0'), `2024-03-${String(i + 1).padStart(2, '0')}T12:00:00Z`)
);

export function start(port: number): Promise<http.Server & { calls: string[] }> {
  const calls: string[] = [];
  const srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', d => (body += d));
    req.on('end', () => {
      const u = new URL(req.url || '/', 'http://x');
      calls.push(`${req.method} ${u.pathname}${u.searchParams.get('key') ? '?key' : ''}`);
      const json = (code: number, o: unknown) => {
        res.writeHead(code, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(o));
      };
      const shared = u.searchParams.get('key') === SHARE;
      if (!shared && req.headers['x-api-key'] !== KEY) return json(401, { message: 'Invalid API key' });
      if (u.pathname === '/api/albums')
        return json(
          200,
          u.searchParams.get('shared') === 'true'
            ? [{ id: '22222222-2222-2222-2222-222222222222', albumName: 'Grandma', assetCount: 0, shared: true }]
            : [
                { id: '11111111-1111-1111-1111-111111111111', albumName: 'Kids', assetCount: 3 },
                { id: '33333333-3333-3333-3333-333333333333', albumName: 'Trip', assetCount: 2 },
                { id: '44444444-4444-4444-4444-444444444444', albumName: 'Big', assetCount: BIG.length }
              ]
        );
      const alb = /^\/api\/albums\/([\w-]+)$/.exec(u.pathname);
      if (alb) {
        if (alb[1].startsWith('1111')) return json(200, { assets: kids });
        if (alb[1].startsWith('3333')) return json(200, { assets: trip });
        // Immich 3: the album only counts its photos; they're on its timeline
        if (alb[1].startsWith('4444')) return json(200, { id: alb[1], albumName: 'Big', assetCount: BIG.length });
        return json(404, {});
      }
      // Immich 3's timeline for an album: its months, then each month's photos as columns
      if (u.pathname === '/api/timeline/buckets' && u.searchParams.get('albumId')?.startsWith('4444'))
        return json(200, [{ timeBucket: '2024-03-01', count: BIG.length }]);
      if (u.pathname === '/api/timeline/bucket' && u.searchParams.get('albumId')?.startsWith('4444'))
        return json(200, {
          id: BIG.map(a => a.id),
          isImage: BIG.map(() => true),
          fileCreatedAt: BIG.map(a => a.localDateTime),
          ratio: BIG.map(() => 4 / 3),
          isTrashed: BIG.map(() => false),
          visibility: BIG.map(() => 'timeline')
        });
      if (u.pathname === '/api/search/metadata') {
        const q = JSON.parse(body || '{}');
        return json(200, { assets: { items: q.isFavorite ? favorites : [...kids, ...trip] } });
      }
      if (u.pathname === '/api/shared-links/me' && shared) return json(200, { assets: trip });
      const th = /^\/api\/assets\/(\w+)\/thumbnail$/.exec(u.pathname);
      if (th) {
        res.writeHead(200, { 'Content-Type': 'image/webp' });
        return res.end(u.searchParams.get('size') === 'preview' ? WEBP : JPEG);
      }
      json(404, {});
    });
  });
  return new Promise(r => srv.listen(port, '127.0.0.1', () => r(Object.assign(srv, { calls }))));
}
