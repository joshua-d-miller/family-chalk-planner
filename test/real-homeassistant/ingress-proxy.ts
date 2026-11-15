/*
===============================================================================
 Family Chalk Planner | Tests | real-homeassistant | ingress-proxy.ts
===============================================================================
 Version:   1.0.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-14
 Updated:   2026-11-14

 Purpose:
     What Home Assistant's Supervisor does for the app's sidebar panel
     (Ingress), for the tests: one address for both, Home Assistant at /
     and the board under /api/hassio_ingress/<token>/, with the person's
     X-Remote-User-* headers and the X-Ingress-Path header added, and
     websockets (Home Assistant's own) and streams (the board's live
     updates) passed through. Same address, so the board can reach Home
     Assistant's page around it, as it does in the real panel.

 Used by:
     test/real-homeassistant/homeassistant.spec.ts
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.0.0     2026-11-14   joshua    New file.
                        claude
===============================================================================
*/

import http from 'node:http';
import net from 'node:net';

export const INGRESS = '/api/hassio_ingress/Qx3vR8kZt2mWp9LcA7nYbE';

export function startIngressProxy(
  port: number,
  { ha, board, user }: { ha: number; board: number; user: () => { id: string; name: string } }
): Promise<http.Server> {
  // where a request goes, and the headers it goes with
  const route = (url: string, headers: http.IncomingHttpHeaders) => {
    const h: http.OutgoingHttpHeaders = { ...headers };
    if (url === INGRESS || url.startsWith(INGRESS + '/')) {
      const u = user();
      Object.assign(h, {
        host: `127.0.0.1:${board}`,
        'x-ingress-path': INGRESS,
        'x-remote-user-id': u.id,
        'x-remote-user-name': u.name.toLowerCase(),
        'x-remote-user-display-name': u.name
      });
      return { port: board, path: url.slice(INGRESS.length) || '/', headers: h };
    }
    h.host = `127.0.0.1:${ha}`;
    return { port: ha, path: url, headers: h };
  };
  const server = http.createServer((req, res) => {
    const to = route(req.url || '/', req.headers);
    const out = http.request(
      { host: '127.0.0.1', port: to.port, path: to.path, method: req.method, headers: to.headers },
      r => {
        res.writeHead(r.statusCode || 502, r.headers);
        r.pipe(res); // streamed as it comes (the board's live updates)
      }
    );
    out.on('error', () => res.writeHead(502).end());
    req.pipe(out);
  });
  // websockets: the request line and headers again, then the two sockets joined
  server.on('upgrade', (req, sock, head) => {
    const to = route(req.url || '/', req.headers);
    const up = net.connect(to.port, '127.0.0.1', () => {
      const lines = [`${req.method} ${to.path} HTTP/1.1`];
      for (const [k, v] of Object.entries(to.headers))
        for (const x of [v].flat()) if (x !== undefined) lines.push(`${k}: ${x}`);
      up.write(lines.join('\r\n') + '\r\n\r\n');
      if (head.length) up.write(head);
      up.pipe(sock).pipe(up);
    });
    up.on('error', () => sock.destroy());
    sock.on('error', () => up.destroy());
  });
  return new Promise(done => server.listen(port, '127.0.0.1', () => done(server)));
}
