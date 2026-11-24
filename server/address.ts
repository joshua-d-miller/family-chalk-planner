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
===============================================================================
*/

import net from 'node:net';

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
