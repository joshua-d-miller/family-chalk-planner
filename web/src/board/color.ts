// Colors that stay readable on the board's surface: a color too close to the background is made lighter
// (on dark boards) or darker (on light ones) until it reads. Ported from the board.
export function lum(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function hsl2hex(h: number, s: number, l: number) {
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return (
    '#' +
    [f(0), f(8), f(4)]
      .map(v => ('0' + v.toString(16)).slice(-2))
      .join('')
      .toUpperCase()
  );
}
const cache = new Map<string, string>();
export function readable(hex: string, bg: number, min = 4.5) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex || '')) return hex;
  const key = hex + bg + min;
  const hit = cache.get(key);
  if (hit) return hit;
  const dark = bg > 0.18;
  const ratio = (h: string) => {
    const l = lum(h);
    return dark ? (bg + 0.05) / (l + 0.05) : (l + 0.05) / (bg + 0.05);
  };
  const done = (v: string) => (cache.set(key, v), v);
  if (ratio(hex) >= min) return done(hex);
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  let l = (mx + mn) / 2;
  let s = 0;
  let h = 0;
  const d = mx - mn;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
    if (h < 0) h += 360;
  }
  for (let step = 0; step < 50; step++) {
    l = dark ? Math.max(0, l - 0.02) : Math.min(1, l + 0.02);
    const out = hsl2hex(h, s, l);
    if (ratio(out) >= min) return done(out);
  }
  return done(dark ? '#111111' : '#FFFFFF');
}
