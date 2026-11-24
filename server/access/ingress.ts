/*
===============================================================================
 Family Chalk Planner | Server | Access | ingress.ts
===============================================================================
 Version:   1.2.8
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-14
 Updated:   2026-11-24

 Purpose:
     Whether a request came through Home Assistant's Ingress (the board
     opened inside Home Assistant), and from where it's served there. Only
     when the board runs as the Home Assistant app (SUPERVISOR_TOKEN is
     set), and only from Home Assistant's own proxy (172.30.32.2): anyone
     else sending the same headers is just a visitor on port 3002.
 How it fits:
     Home Assistant signs the person in, then proxies the request with
     X-Ingress-Path (/api/hassio_ingress/<token>) and X-Remote-User-Id,
     -Name and -Display-Name. server/access/access.ts turns those into the
     person; server/pages.ts sets the pages' <base> to the ingress path.
 Used by:
     server/access/access.ts, server/pages.ts
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.0.0     2026-11-14   joshua    New file.
                        claude

 1.2.8    2026-11-24   joshua    An X-Ingress-Path longer than any real one
                        claude    is turned away before it's read.
===============================================================================
*/

type ReqLike = { get(name: string): string | undefined; socket?: { remoteAddress?: string } };

// the app runs inside Home Assistant (the Supervisor gives it this token)
export const haApp = () => !!process.env.SUPERVISOR_TOKEN;
// Home Assistant's proxy (the tests point it at 127.0.0.1)
const proxyAddress = () => process.env.HA_INGRESS_FROM || '172.30.32.2';
const PATH = /^\/api\/hassio_ingress\/[A-Za-z0-9_-]{8,200}$/;

// ------------------------------------ //
// | Through Home Assistant's Ingress | //
// ------------------------------------ //
// The ingress path (/api/hassio_ingress/<token>) when the request came     //
// through Home Assistant's proxy, else null                                 //
export function ingressPath(req: ReqLike): string | null {
  if (!haApp()) return null;
  const from = String(req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
  if (from !== proxyAddress()) return null;
  const raw = String(req.get('x-ingress-path') || '');
  if (raw.length > 300) return null; // a real one is at most about 225 characters
  const p = raw.replace(/\/+$/, '');
  return PATH.test(p) ? p : null;
}

// -------------------------------------- //
// | The Home Assistant person it's for | //
// -------------------------------------- //
export function ingressUser(req: ReqLike): { id: string; name: string } | null {
  if (!ingressPath(req)) return null;
  const id = String(req.get('x-remote-user-id') || '');
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  const name =
    String(req.get('x-remote-user-display-name') || req.get('x-remote-user-name') || '')
      .replace(/[\r\n<>]/g, '')
      .trim()
      .slice(0, 60) || 'Someone';
  return { id, name };
}

// the <base> for a page: the ingress path inside Home Assistant, else the root
export const baseFor = (req: ReqLike) => (ingressPath(req) || '') + '/';
