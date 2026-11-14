/*
===============================================================================
 Family Chalk Planner | Tests | mock-openverse.ts
===============================================================================
 Version:   0.17.0
 Author:    Joshua D. Miller, Claude
 Updated:   2026-11-14

 Purpose:
     Stand-in for Openverse (the calls Pictures' "From the web" makes), for
     tests. A search for "kite" finds three illustrations: two public
     domain and one that isn't (the board must leave that one out); "busy"
     answers 429 Too Many Requests. Thumbnails are a tiny PNG. Every call
     is listed in calls, so tests can see what reached Openverse.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.17.0    2026-11-14   joshua    New file.
                        claude
===============================================================================
*/

import http from 'node:http';

// a 1x1 PNG
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
export const KITE = 'aaaaaaaa-1111-4111-8111-000000000001';
export const KITE2 = 'aaaaaaaa-1111-4111-8111-000000000002';
export const NOT_PD = 'aaaaaaaa-1111-4111-8111-000000000003';
const pic = (id: string, license: string) => ({
  id,
  title: 'Red kite',
  creator: 'Someone',
  source: 'wikimedia',
  license,
  width: 400,
  height: 300,
  mature: false
});
const PICS: Record<string, ReturnType<typeof pic>> = {
  [KITE]: pic(KITE, 'cc0'),
  [KITE2]: pic(KITE2, 'pdm'),
  [NOT_PD]: pic(NOT_PD, 'by-sa')
};

export function start(port: number): Promise<http.Server & { calls: string[] }> {
  const calls: string[] = [];
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url || '/', 'http://x');
    calls.push(u.pathname + u.search);
    const json = (code: number, o: unknown) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(o));
    };
    if (u.pathname === '/images/') {
      const q = u.searchParams.get('q');
      if (q === 'busy') return json(429, { detail: 'Request was throttled.' });
      return json(200, { result_count: 3, results: q === 'kite' ? Object.values(PICS) : [] });
    }
    const m = /^\/images\/([0-9a-f-]{36})\/(thumb\/)?$/.exec(u.pathname);
    if (m && PICS[m[1]]) {
      if (!m[2]) return json(200, PICS[m[1]]);
      res.writeHead(200, { 'Content-Type': 'image/png' });
      return res.end(PNG);
    }
    json(404, { detail: 'Not found.' });
  }) as http.Server & { calls: string[] };
  srv.calls = calls;
  return new Promise(r => srv.listen(port, '127.0.0.1', () => r(srv)));
}
