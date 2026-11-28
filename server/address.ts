/*
===============================================================================
 Family Chalk Planner | Server | address.ts
===============================================================================
 Version:   1.2.8
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-24
 Updated:   2026-11-24

 Purpose:
     The one check every address the board fetches from goes through: an
     Immich or CalDAV server an admin typed, the calendar addresses that
     server answers with, and "Add from link" pictures. Only plain http(s)
     web addresses pass, never one with a password in it or one pointing at
     an address no real server has (this computer's "any address", link-
     local and cloud-metadata addresses, multicast). Pictures from a link
     must also be public: the board itself checks again after the name is
     looked up and after every redirect (server/media.ts).

 How it fits:
     .github/codeql/extensions/chalk-models/ tells GitHub's code scanning
     (CodeQL) that what checkedAddress() returns has been checked, so the
     fetches below it aren't reported as "server-side request forgery".
     That only holds while every fetch of a typed address uses the value
     this returns, so keep it that way.

 Used by:
     server/calendar/source.ts
     server/media.ts
     server/photos/immich.ts
     test/address.test.ts
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.2.8     2026-11-24   joshua    New: one check for the addresses the board
                        claude    fetches from.

                                  safeFetch() and checkedLookup(): Immich,
                                  calendar and album servers are checked
                                  where their name leads and on every
                                  redirect; the sign-in stays with its own
                                  server.

                                  The sign-in only goes on to the same
                                  server: never to another port or down to
                                  http (sameServer()).
===============================================================================
*/

import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { Readable } from 'node:stream';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------------------------------- //
// | An IPv4 address written as IPv6 | //
// ----------------------------------- //
// The IPv4 address inside an IPv6 one that stands for it, or null:          //
// "::ffff:127.0.0.1", which the URL parser writes as "::ffff:7f00:1", and   //
// the other ways of writing an IPv4 address as IPv6 ("::127.0.0.1",         //
// "::ffff:0:127.0.0.1", "64:ff9b::127.0.0.1"). Each of these reaches the    //
// IPv4 address, so it's checked as that address.                            //
export function ipv4Inside(ip: string): string | null {
  const v = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (!net.isIPv6(v)) return null;
  // the eight groups, written out in full (a trailing dotted IPv4 becomes the last two)
  let s = v;
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (dotted) {
    const [a, b, c, d] = dotted[1].split('.').map(Number);
    s = s.slice(0, -dotted[1].length) + ((a << 8) | b).toString(16) + ':' + ((c << 8) | d).toString(16);
  }
  const [head, tail] = s.includes('::') ? s.split('::') : [s, null];
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const g = tail === null ? h : [...h, ...Array(8 - h.length - t.length).fill('0'), ...t];
  if (g.length !== 8) return null;
  const n = g.map(x => parseInt(x || '0', 16));
  const v4 = () => [n[6] >> 8, n[6] & 255, n[7] >> 8, n[7] & 255].join('.');
  const zero = (from: number, to: number) => n.slice(from, to).every(x => x === 0);
  if (zero(0, 5) && n[5] === 0xffff) return v4(); // ::ffff:a.b.c.d (IPv4-mapped)
  if (zero(0, 4) && n[4] === 0xffff && n[5] === 0) return v4(); // ::ffff:0:a.b.c.d
  if (zero(0, 6) && (n[6] || n[7] > 1)) return v4(); // ::a.b.c.d (old IPv4-compatible; not :: or ::1)
  if (n[0] === 0x64 && n[1] === 0xff9b && zero(2, 6)) return v4(); // 64:ff9b::a.b.c.d (NAT64)
  return null;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------------------------- //
// | Addresses no server has | //
// --------------------------- //
// Never a real Immich, calendar or picture server: "any address" (0.0.0.0, //
// ::), link-local (169.254.x.x, where cloud servers keep their secrets,    //
// and fe80::) and multicast. Your own network (192.168.x.x and the like)  //
// is fine for Immich and CalDAV.                                           //
export function unusableIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || (a === 169 && b === 254) || a >= 224;
  }
  const v4 = ipv4Inside(ip);
  if (v4) return unusableIp(v4);
  const v = ip.toLowerCase();
  return v === '::' || /^(fe[89ab]|ff)/.test(v);
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------------------- //
// | Checking an address | //
// ----------------------- //
// The address to fetch (tidied by the URL parser), or null when it isn't   //
// one the board fetches from. publicOnly: also no addresses on your own    //
// network, no other ports than 80 and 443 (for "Add from link").           //
export function checkedAddress(
  raw: string,
  opts: { publicOnly?: boolean; isPrivate?: (ip: string) => boolean } = {}
): string | null {
  let u: URL;
  try {
    u = new URL(String(raw || ''));
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password || !u.hostname) return null;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) && unusableIp(host)) return null;
  if (opts.publicOnly) {
    if (u.port && !['80', '443'].includes(u.port)) return null;
    if (net.isIP(host) && opts.isPrivate?.(host)) return null;
  }
  return u.href;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------------------------- //
// | Where a name really leads to | //
// -------------------------------- //
// Looks a server's name up the way the system does, and refuses when any    //
// address it leads to is one no server has (a name pointing at              //
// 169.254.169.254, say). Used as the connection's own lookup, so what's     //
// checked is what's connected to: a name can't change its answer between    //
// the check and the connection. resolve: for the tests.                     //
type LookupCb = (err: Error | null, address?: string | dns.LookupAddress[], family?: number) => void;
export function checkedLookup(resolve: typeof dns.lookup = dns.lookup) {
  return (host: string, opts: dns.LookupOptions, cb: LookupCb) => {
    resolve(host, { ...opts, all: true }, (err, addrs: dns.LookupAddress[]) => {
      if (err) return cb(err);
      if (!addrs.length || addrs.some(a => unusableIp(a.address)))
        return cb(Object.assign(new Error(`${host} leads to an address no server has`), { code: 'EUNUSABLE' }));
      if (opts.all) cb(null, addrs);
      else cb(null, addrs[0].address, addrs[0].family);
    });
  };
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------------------------- //
// | Fetching from a checked server | //
// ---------------------------------- //
// fetch() for an Immich or calendar server an admin chose (your own network //
// is fine): every address passes checkedAddress(), the name is checked      //
// where it leads (checkedLookup()), and redirects are followed here, at     //
// most 5, each checked the same way. The sign-in (Authorization, Cookie,    //
// the Immich key) only goes on to the same server: the same name, port and  //
// kind of connection, or the same name moving up from http to https on the  //
// matching port (80 to 443, or the same port number; never another port,    //
// never down to http, where anyone on the network could read it). Answers   //
// like fetch() does (a Response), so callers read it the same way.          //
const SIGN_IN = ['authorization', 'cookie', 'x-api-key'];
// may the sign-in for `from` go on to `to`? The same origin, or the same name moving up to https on the
// matching port: the usual ports (80 to 443) or the same port number (http://nas:5232 to https://nas:5232).
// Never to another port, which may be another service on the same computer.
export function sameServer(from: URL, to: URL) {
  if (from.origin === to.origin) return true;
  if (from.hostname !== to.hostname || from.protocol !== 'http:' || to.protocol !== 'https:') return false;
  return (from.port === '' && to.port === '') || (from.port !== '' && from.port === to.port);
}
export async function safeFetch(
  address: string,
  init: { method?: string; headers?: Record<string, string>; body?: string | Buffer; signal?: AbortSignal } = {},
  opts: { resolve?: typeof dns.lookup } = {}
): Promise<Response> {
  let method = (init.method || 'GET').toUpperCase();
  let body = init.body;
  let headers: Record<string, string> = { ...(init.headers || {}) };
  let next = address;
  let last: URL | null = null;
  for (let hop = 0; hop <= 5; hop++) {
    const url = checkedAddress(next);
    if (!url) throw new Error('That isn’t an address the board fetches from');
    const u = new URL(url);
    if (last && !sameServer(last, u))
      headers = Object.fromEntries(Object.entries(headers).filter(([k]) => !SIGN_IN.includes(k.toLowerCase())));
    last = u;
    const res = await new Promise<http.IncomingMessage>((resolve, reject) => {
      const req = (u.protocol === 'https:' ? https : http).request(url, {
        method,
        headers,
        lookup: checkedLookup(opts.resolve) as unknown as typeof dns.lookup,
        signal: init.signal
      });
      req.on('response', resolve);
      // a timeout reads as fetch()'s own (TimeoutError), so "didn't answer" messages still show
      req.on('error', e => reject(init.signal?.aborted ? init.signal.reason : e));
      req.end(body);
    });
    const status = res.statusCode || 0;
    const location = res.headers.location;
    if ([301, 302, 303, 307, 308].includes(status) && location) {
      res.resume();
      next = new URL(location, url).href;
      // as fetch() does: 303 (and 301/302 after a POST) become a GET without a body
      if (status === 303 ? method !== 'HEAD' : (status === 301 || status === 302) && method === 'POST') {
        method = 'GET';
        body = undefined;
        headers = Object.fromEntries(
          Object.entries(headers).filter(([k]) => !['content-type', 'content-length'].includes(k.toLowerCase()))
        );
      }
      continue;
    }
    const out = new Headers();
    for (const [k, v] of Object.entries(res.headers))
      if (v !== undefined) for (const one of Array.isArray(v) ? v : [v]) out.append(k, one);
    const empty = method === 'HEAD' || status === 204 || status === 304;
    if (empty) res.resume();
    return new Response(empty ? null : (Readable.toWeb(res) as ReadableStream), {
      status,
      statusText: res.statusMessage,
      headers: out
    });
  }
  throw new Error('Too many redirects');
}
