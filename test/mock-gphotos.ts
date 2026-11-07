/*
===============================================================================
 Family Chalk Planner | Tests | mock-gphotos.ts
===============================================================================
 Version:   0.13.0
 Author:    Joshua D. Miller, Claude
 Updated:   2026-11-06

 Purpose:
     A stand-in for a Google Photos shared album (the page and the
     follow-up call the board makes), for tests.

     Usage:
          (await import('./mock-gphotos.ts')).start(port, { drop })
          album link:
            http://127.0.0.1:<port>/share/AF1QipTESTALBUM?key=TESTKEY
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-06   joshua    Server and tests are all TypeScript (ES
                        claude    modules).
===============================================================================
*/

import http from 'node:http';
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=',
  'base64'
);
const WEBP = Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'binary');
const ID = 'AF1QipTESTALBUM',
  KEY = 'TESTKEY';
function item(base, n, w, h, taken, extra = {}) {
  return [
    `AF1Qip${n}`,
    [`${base}/img/${n}`, w, h, null, null, null, null, null, [null, null, 1]],
    taken,
    'hash' + n,
    0,
    taken + 1000,
    ['x'],
    [[2]],
    2,
    { 15: 1, ...extra }
  ];
}
function start(port = 5994, opts: { drop?: string } = {}) {
  const base = `http://127.0.0.1:${port}`;
  const page1 = () =>
    [
      item(base, 'a', 2048, 1536, 1719072959548),
      item(base, 'b', 1536, 2048, 1791000000000),
      item(base, 'v', 1920, 1080, 1700000000000, { 76647426: [1] })
    ].filter(x => !opts.drop || !x[0].endsWith(opts.drop));
  const page2 = () => [item(base, 'c', 2048, 1536, 1729400000000)].filter(x => !opts.drop || !x[0].endsWith(opts.drop));
  const srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', d => (body += d));
    req.on('end', () => {
      const u = new URL(req.url, base);
      if (u.pathname === '/s/short') {
        res.writeHead(302, { Location: `${base}/share/${ID}?key=${KEY}` });
        return res.end();
      }
      if (u.pathname === `/share/${ID}` && u.searchParams.get('key') === KEY) {
        const data = [null, page1(), 'NEXT1', [ID, 'Test album']];
        res.setHeader('Content-Type', 'text/html');
        return res.end(
          `<html><script>AF_initDataCallback({key: 'ds:0', hash: '1', data:[], sideChannel: {}});</script><script>AF_initDataCallback({key: 'ds:1', hash: '2', data:${JSON.stringify(data)}, sideChannel: {}});</script></html>`
        );
      }
      if (u.pathname === '/_/PhotosUi/data/batchexecute' && req.method === 'POST') {
        const f = JSON.parse(new URLSearchParams(body).get('f.req'))[0][0],
          args = JSON.parse(f[1]);
        if (f[0] !== 'snAcKc' || args[0] !== ID || args[3] !== KEY || args[1] !== 'NEXT1') {
          res.statusCode = 400;
          return res.end();
        }
        const payload = JSON.stringify([null, page2(), '', [ID]]);
        return res.end(
          `)]}'\n\n${JSON.stringify([
            ['wrb.fr', 'snAcKc', payload, null, null, null, 'generic'],
            ['di', 42]
          ])}`
        );
      }
      const im = /^\/img\/(\w)=w2048-h2048(-rj)?$/.exec(u.pathname);
      if (im) {
        // photo "b" answers WebP unless JPEG is asked for explicitly, like Google can
        res.setHeader('Content-Type', 'image/jpeg');
        return res.end(im[1] === 'b' && !im[2] ? WEBP : JPEG);
      }
      res.statusCode = 404;
      res.end();
    });
  });
  return new Promise(r => srv.listen(port, '127.0.0.1', () => r(srv)));
}
export { start, ID, KEY };
