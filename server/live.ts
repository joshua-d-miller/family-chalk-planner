/*
===============================================================================
 Family Chalk Planner | Server | live.ts
===============================================================================
 Version:   0.13.0
 Author:    Joshua D. Miller, Claude
 Updated:   2026-11-06

 Purpose:
     Live updates: every open screen keeps one Server-Sent Events
     connection (/api/stream), and any change is pushed to all of them at
     once ("calendar", "stroke", "chores"...). Screens reconnect by
     themselves.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-06   joshua    Live updates, nightly backup and the Notes
                        claude    extras in their own TypeScript modules.
===============================================================================
*/

import type { ReqLike } from './access/http.ts';
import type { Express, Response } from 'express';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------------------------- //
// | Every open screen, and telling them all | //
// ------------------------------------------- //
// Broadcast sends one event to every connected screen. serve adds           //
// /api/stream: the version is sent first, so a page can tell a new version  //
// was installed and reload; every 25 seconds each connection is checked     //
// again, so a removed screen or an ended sign-in stops getting updates.     //
export function createLive() {
  const clients = new Set<Response>();

  function broadcast(event: string, data: unknown) {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) res.write(msg);
  }

  // version: sent on connect, so pages can tell a new version was installed and reload
  // stillAllowed: checked every 25 s; a removed screen or an ended sign-in stops getting updates
  function serve(
    app: Express,
    { version, stillAllowed }: { version: () => string; stillAllowed: (req: ReqLike) => boolean }
  ) {
    app.get('/api/stream', (req, res) => {
      res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
      });
      res.flushHeaders();
      res.write('retry: 3000\n\n');
      res.write(`event: hello\ndata: ${JSON.stringify({ v: version() })}\n\n`);
      clients.add(res);
      const ping = setInterval(() => {
        if (!stillAllowed(req)) {
          clients.delete(res);
          res.end();
          return;
        }
        res.write('event: ping\ndata: {}\n\n'); // lets pages see they're still connected
      }, 25000);
      req.on('close', () => {
        clearInterval(ping);
        clients.delete(res);
      });
    });
  }

  return { broadcast, serve };
}
export type Broadcast = ReturnType<typeof createLive>['broadcast'];

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
