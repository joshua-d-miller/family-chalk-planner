// Stand-in for an Immich server (the calls the board makes), for tests. One API key ('KEY'), two albums
// (one shared with us), favorites, and a share link ('SHAREKEY0001'). Previews come back as WebP.
import http from 'node:http';

export const KEY = 'KEY';
export const SHARE = 'SHAREKEY0001';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([20, 0, 0, 0]),
  Buffer.from('WEBPVP8 '),
  Buffer.alloc(12)
]);

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
                { id: '33333333-3333-3333-3333-333333333333', albumName: 'Trip', assetCount: 2 }
              ]
        );
      const alb = /^\/api\/albums\/([\w-]+)$/.exec(u.pathname);
      if (alb) {
        if (alb[1].startsWith('1111')) return json(200, { assets: kids });
        if (alb[1].startsWith('3333')) return json(200, { assets: trip });
        return json(404, {});
      }
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
