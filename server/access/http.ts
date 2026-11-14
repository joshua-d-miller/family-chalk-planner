/*
===============================================================================
 Family Chalk Planner | Server | Access | http.ts
===============================================================================
 Version:   0.13.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-06
 Updated:   2026-11-07

 Purpose:
     Reading requests: cookies, and what kind of device sent it.

 Used by:
     server/access/access.ts
     server/access/accounts.ts
     server/access/passkeys.ts
     server/access/screens.ts
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    Move access (screens, people, sign-in,
                        claude    passkeys, security) to TypeScript.
                        colby
                                  Home-network sign-in: just a password for
                                  the board at home, off unless turned on.
===============================================================================
*/

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------------- //
// | What the access checks need | //
// ------------------------------- //
// What the access checks need from a request (a live-update stream is       //
// checked with just its cookie)                                             //
export interface ReqLike {
  get(name: string): string | undefined;
  ip?: string;
  socket?: { remoteAddress?: string }; // (where it came from: Home Assistant's Ingress proxy, or not)
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------------------------------------- //
// | Home sign-in: at home, opened by IP | //
// --------------------------------------- //
// Home-network sign-in (from Colby Way's board): a request from a private   //
// address to the board opened by its IP address (http://192.168.1.20:3002), //
// not by a name. Through a reverse proxy, or by name, it isn't.             //
export function privateAddress(ip: string | undefined) {
  const v = String(ip || '')
    .replace(/^::ffff:/i, '')
    .toLowerCase();
  if (v === '::1') return true;
  const m = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(v);
  if (m) {
    const [a, b] = [+m[1], +m[2]];
    return (
      a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254)
    );
  }
  return /^(fc|fd|fe80):/.test(v);
}
export function openedByIp(host: string | undefined) {
  const h = String(host || '')
    .toLowerCase()
    .replace(/:\d+$/, '')
    .replace(/^\[|\]$/g, '');
  return h === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(h) || (h.includes(':') && /^[0-9a-f:.]+$/.test(h));
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------- //
// | Cookies | //
// ----------- //
export function parseCookies(h: string | undefined) {
  const out: Record<string, string> = {};
  for (const part of String(h || '').split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    try {
      out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      /* ignore a bad cookie */
    }
  }
  return out;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------- //
// | Which device | //
// ---------------- //
// "Safari on iPad", "Chrome on Android" ... so people can tell devices      //
// apart in the console. Only for that: every browser works the same.        //
export function describe(agent: string | undefined) {
  const ua = String(agent || '');
  const os = /iPad/.test(ua)
    ? 'iPad'
    : /Kindle|Silk|KF[A-Z]{2,}/.test(ua)
      ? 'Fire tablet'
      : /iPhone/.test(ua)
        ? 'iPhone'
        : /Android/.test(ua)
          ? 'Android'
          : /Mac OS X|Macintosh/.test(ua)
            ? 'Mac'
            : /Windows/.test(ua)
              ? 'Windows'
              : /CrOS/.test(ua)
                ? 'Chromebook'
                : /Linux/.test(ua)
                  ? 'Linux'
                  : 'device';
  const browsers: [RegExp, string][] = [
    [/Fully/i, 'Fully Kiosk'],
    [/Edg(e|A|iOS)?\//, 'Edge'],
    [/Firefox\/|FxiOS\//, 'Firefox'],
    [/SamsungBrowser/, 'Samsung Internet'],
    [/OPR\/|Opera/, 'Opera'],
    [/Vivaldi/, 'Vivaldi'],
    [/DuckDuckGo/, 'DuckDuckGo'],
    [/Silk\//, 'Silk'],
    [/Chrome\/|CriOS\//, 'Chrome'],
    [/Safari\//, 'Safari'],
    [/node|curl|undici/i, 'Script']
  ];
  const br = browsers.find(([re]) => re.test(ua))?.[1] || 'Browser';
  return `${br} on ${os}`;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
