// Reading requests: cookies, and what kind of device sent it.

// What the access checks need from a request (a live-update stream is checked with just its cookie)
export interface ReqLike {
  get(name: string): string | undefined;
  ip?: string;
}

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

// "Safari on iPad", "Chrome on Android" ... so people can tell devices apart in the console.
// Only for that: every browser works the same.
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
