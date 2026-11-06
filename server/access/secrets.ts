// Keys, codes, passwords and authenticator-app codes.
import crypto from 'node:crypto';

const CODE_ABC = 'ACDEFGHJKLMNPQRTUVWXY34679'; // no look-alikes (0/O, 1/I/L, 2/Z, 5/S, 8/B)
export const sha = (s: unknown) => crypto.createHash('sha256').update(String(s)).digest('hex');
export const rid = (n = 9) => crypto.randomBytes(n).toString('base64url');
export const randomKey = () => crypto.randomBytes(32).toString('base64url');
export const randCode = (n: number) => Array.from(crypto.randomBytes(n), b => CODE_ABC[b % CODE_ABC.length]).join('');
export const fmtCode = (c: string) => c.slice(0, 4) + '-' + c.slice(4);
export const normCode = (s: unknown) =>
  String(s || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
export function safeEq(a: unknown, b: unknown) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// ---- passwords (scrypt) ----
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export function hashPassword(pw: unknown) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(pw), salt, 64, SCRYPT);
  return `scrypt$32768$${salt.toString('base64')}$${h.toString('base64')}`;
}
export function checkPassword(pw: unknown, stored: string | null | undefined) {
  const [kind, n, salt, h] = String(stored || '').split('$');
  if (kind !== 'scrypt') {
    crypto.scryptSync('x', 'y', 64, SCRYPT); // same time either way
    return false;
  }
  const got = crypto.scryptSync(String(pw), Buffer.from(salt, 'base64'), 64, { ...SCRYPT, N: +n });
  return crypto.timingSafeEqual(got, Buffer.from(h, 'base64'));
}

// ---- authenticator-app codes (TOTP, RFC 6238: 30 s, 6 digits, SHA-1 - what every app supports) ----
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function b32enc(buf: Buffer) {
  let bits = '';
  let out = '';
  for (const b of buf) bits += b.toString(2).padStart(8, '0');
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}
export function b32dec(s: string) {
  let bits = '';
  for (const ch of String(s).replace(/=+$/, '')) {
    const v = B32.indexOf(ch);
    if (v >= 0) bits += v.toString(2).padStart(5, '0');
  }
  const out: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
}
export function totpAt(secret: string, counter: number) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', b32dec(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
}
// the matching time step (to block reuse), or -1
export function totpCheck(secret: string, code: unknown, lastStep: number) {
  const c = String(code || '').replace(/\D/g, '');
  if (c.length !== 6) return -1;
  const now = Math.floor(Date.now() / 30000);
  for (const step of [now, now - 1, now + 1])
    if (step > (lastStep || 0) && safeEq(totpAt(secret, step), c)) return step;
  return -1;
}

// Authenticator secrets are locked with each person's own password: AES-256-GCM with a key derived from the
// password (scrypt). Nothing extra to keep safe - no key file - and a copied database or backup can't produce
// sign-in codes without cracking that person's password first. (Passwords themselves are separate scrypt hashes.)
export const pwKey = (pw: unknown, salt: Buffer) => crypto.scryptSync('totp-key:' + String(pw), salt, 32, SCRYPT);
export function sealWith(key: Buffer, salt: Buffer, plain: string) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return 'pw1:' + Buffer.concat([salt, iv, c.getAuthTag(), ct]).toString('base64');
}
export function sealPw(pw: unknown, plain: string) {
  const salt = crypto.randomBytes(16);
  return sealWith(pwKey(pw, salt), salt, plain);
}
export function unsealPw(pw: unknown, v: string | null) {
  if (!v) return null;
  if (!String(v).startsWith('pw1:')) return v; // (not used, but tolerate a plain secret)
  try {
    const b = Buffer.from(String(v).slice(4), 'base64');
    const salt = b.subarray(0, 16);
    const d = crypto.createDecipheriv('aes-256-gcm', pwKey(pw, salt), b.subarray(16, 28));
    d.setAuthTag(b.subarray(28, 44));
    return Buffer.concat([d.update(b.subarray(44)), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}
