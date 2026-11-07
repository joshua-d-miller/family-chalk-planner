// Who may do what.
//
// SCREENS are paired once and have a role (no sign-in, they just keep working):
//   view    - shows the board (a wall display)
//   family  - view + change events, meals, jars and countdowns, and decorate with stamps / clipart / words
//             (no freehand drawing)
//   kid:<person> - a child's own tablet: see the board, check off their own chores
//
// PEOPLE sign in, on a tablet or phone, with a passkey (Face ID / Touch ID / fingerprint, needs HTTPS and
// PUBLIC_URL) or with username + password + a code from an authenticator app:
//   editor  - everything on the board: events, drawing, board style, photos (signs in again every 60 days,
//             adjustable)
//   admin   - editor + the admin console at /admin: screens, people, calendar and board settings.
//             The console asks for a fresh sign-in (it lasts 30 idle minutes, 12 hours at most).
//
// First run: the one-time setup code from the server log / data/setup-code.txt creates the first admin.
// deploy/reset-admin.sh wipes every person, sign-in and screen and makes a new code.
// Every key (screen, sign-in) is random, kept in an HttpOnly cookie, and stored only as a hash.
//
// This file: who is asking, the rules every /api request passes, and the setup code. The routes are in
// screens.ts (pairing), accounts.ts (signing in, my account), passkeys.ts, people.ts and security.ts.
import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { Express, Request, Response } from 'express';
import type { Kv } from '../kv.ts';
import { describe, openedByIp, parseCookies, privateAddress } from './http.ts';
import type { ReqLike } from './http.ts';
import { fmtCode, normCode, randCode, randomKey, safeEq, sha } from './secrets.ts';
import { makeStore } from './store.ts';
import type { Device, Session, User } from './store.ts';
import { registerScreens } from './screens.ts';
import { registerAccounts } from './accounts.ts';
import { registerPasskeys } from './passkeys.ts';
import { registerPeople } from './people.ts';
import { registerSecurity } from './security.ts';

export const DAY = 24 * 3600e3;
export const PAIR_TTL = 15 * 60e3;
export const INVITE_TTL = 3 * DAY;
export const ADMIN_IDLE = 30 * 60e3;
export const ADMIN_MAX = 12 * 3600e3;
export const KEEP = 400 * DAY; // cookie lifetime (browsers cap it near 400 days); renewed every day the device is used
export const C = { device: 'fcp_device', pair: 'fcp_pair', user: 'fcp_user', admin: 'fcp_admin' };
export const RANK = { view: 1, family: 2, editor: 3, admin: 4 };
const roleRank = (r: string) => (/^kid:/.test(r || '') ? 1 : 0) || { view: 1, family: 2 }[r] || 0;

// Board sign-ins ask again every signinMaxDays after signing in, or sooner after signinIdleDays unused.
// Screens stay paired for good: quiet ones are only flagged (screenRemoveDays 0 = never remove
// automatically); an admin removes them.
export const SEC_DEFAULT = {
  signinIdleDays: 60,
  signinMaxDays: 60,
  screenFlagDays: 90,
  screenRemoveDays: 0,
  passkeyFlagDays: 365,
  personFlagDays: 180,
  logDays: 90
};
export type SecCfg = typeof SEC_DEFAULT;

export interface AuditInfo {
  actor?: string | null;
  target?: string | null;
  detail?: string | null;
  refType?: string | null;
  refId?: string | number | bigint | null;
}
type Kind = 'edit' | 'admin';
type SignedIn = Session & { user: User };

export function setup(
  app: Express,
  {
    db,
    kv,
    dataDir,
    env,
    title,
    broadcast
  }: {
    db: DatabaseSync;
    kv: Kv;
    dataDir: string;
    env: NodeJS.ProcessEnv;
    title: string;
    broadcast: (event: string, data: unknown) => void;
  }
) {
  const q = makeStore(db);
  const openView = /^(1|true|yes|lan)$/i.test(String(env.ALLOW_UNPAIRED_VIEW || ''));

  // Passkeys are tied to one web address (they need HTTPS and a name, not an IP): PUBLIC_URL
  let rp: { origin: string; id: string } | null = null;
  try {
    if (env.PUBLIC_URL) {
      const u = new URL(env.PUBLIC_URL);
      rp = { origin: u.origin, id: u.hostname };
    }
  } catch {
    console.error('Chalk Planner: PUBLIC_URL is not a valid address - passkeys are off');
  }
  const passkeysHere = (req: Request) => !!rp && `${req.protocol}://${req.get('host')}` === rp.origin;
  // Board sign-in with just a password, at home (admin console → ⚙️ Board → On your network; off unless
  // turned on). Never for the admin console, and new accounts still set up an authenticator app.
  const homeSigninOn = env.HOME_SIGNIN === 'on';
  const homeSignin = (req: Request) => homeSigninOn && privateAddress(req.ip) && openedByIp(req.get('host'));

  const secCfg = (): SecCfg => ({ ...SEC_DEFAULT, ...(kv.get<Partial<SecCfg>>('security') || {}) });

  // ---- who is this? (a paired screen, a signed-in person, or both); remembered for the request ----
  const seen = new WeakMap<object, { dev?: Device | null; edit?: SignedIn | null; admin?: SignedIn | null }>();
  const memo = (req: ReqLike) => {
    let m = seen.get(req);
    if (!m) seen.set(req, (m = {}));
    return m;
  };
  function deviceOf(req: ReqLike) {
    const m = memo(req);
    if (m.dev !== undefined) return m.dev;
    const key = parseCookies(req.get('cookie'))[C.device];
    const d = key && key.length < 100 ? q.dByKey(sha(key)) : undefined;
    if (d && Date.now() - d.last_seen > 60e3) {
      q.dSeen(Date.now(), req.ip || '', d.id);
      d.last_seen = Date.now();
    }
    return (m.dev = d || null);
  }
  function sessionOf(req: ReqLike, kind: Kind) {
    const m = memo(req);
    if (m[kind] !== undefined) return m[kind];
    const key = parseCookies(req.get('cookie'))[kind === 'admin' ? C.admin : C.user];
    let s = key && key.length < 100 ? q.sGet(sha(key)) : undefined;
    if (s && s.kind !== kind) s = undefined;
    const now = Date.now();
    if (s) {
      const cfg = secCfg();
      const over =
        kind === 'edit'
          ? now - s.last_seen > cfg.signinIdleDays * DAY ||
            (cfg.signinMaxDays > 0 && now - s.created > cfg.signinMaxDays * DAY)
          : now - s.last_seen > ADMIN_IDLE || now - s.created > ADMIN_MAX;
      if (over) {
        q.sDel(s.key_hash);
        s = undefined;
      }
    }
    const u = s ? q.uById(s.user_id) : undefined;
    if (s && (!u || (kind === 'admin' && u.role !== 'admin'))) s = undefined;
    if (s && now - s.last_seen > (kind === 'admin' ? 15e3 : 60e3)) q.sSeen(now, req.ip || '', s.key_hash);
    return (m[kind] = s && u ? { ...s, user: u } : null);
  }
  const userOf = (req: ReqLike) => (sessionOf(req, 'admin') || sessionOf(req, 'edit'))?.user || null;
  // a kid's tablet (when no grown-up is signed in on it): the person id it belongs to
  const kidOf = (req: ReqLike) => {
    if (userOf(req)) return null;
    const m = /^kid:([a-z0-9]{1,16})$/.exec(deviceOf(req)?.role || '');
    return m ? m[1] : null;
  };
  const whoOf = (req: ReqLike) => userOf(req)?.name || deviceOf(req)?.name || 'someone';
  function rankOf(req: ReqLike) {
    let r = openView ? 1 : 0;
    const d = deviceOf(req);
    if (d) r = Math.max(r, roleRank(d.role));
    if (sessionOf(req, 'edit')) r = Math.max(r, RANK.editor);
    if (sessionOf(req, 'admin')) r = RANK.admin;
    return r;
  }

  // ---- the activity log: every security event, who did it, to what, from which device and address ----
  function audit(req: Request | null, event: string, o: AuditInfo = {}) {
    let actor = o.actor;
    if (actor === undefined && req) {
      const m = memo(req);
      const u = m.admin?.user || m.edit?.user;
      const d = m.dev;
      actor = u ? u.username : d ? 'screen: ' + d.name : null;
    }
    try {
      q.aAdd(
        Date.now(),
        event,
        actor || null,
        o.target || null,
        o.detail || null,
        req ? req.ip || '' : 'server',
        req ? describe(req.get('user-agent')) : 'server',
        o.refType || null,
        o.refId != null ? String(o.refId) : null
      );
    } catch (e) {
      console.error('Chalk Planner: activity log:', (e as Error).message);
    }
  }

  // ---- cookies ----
  function cookie(
    req: Request,
    res: Response,
    name: string,
    val: string,
    maxAgeMs: number,
    extra: { path?: string; same?: string } = {}
  ) {
    res.append(
      'Set-Cookie',
      `${name}=${val}; Path=${extra.path || '/'}; Max-Age=${Math.floor(maxAgeMs / 1000)}; HttpOnly; SameSite=${extra.same || 'Lax'}${req.secure ? '; Secure' : ''}`
    );
  }
  const clear = (req: Request, res: Response, name: string) =>
    cookie(req, res, name, '', 0, {
      path: name === C.pair ? '/api/pair' : '/',
      same: name === C.admin || name === C.pair ? 'Strict' : 'Lax'
    });

  function startSession(req: Request, res: Response, user: User, kind: Kind, how?: string) {
    const key = randomKey();
    const info = q.sAdd(sha(key), user.id, kind, Date.now(), Date.now(), describe(req.get('user-agent')), req.ip || '');
    if (how)
      audit(req, 'signin', {
        actor: user.username,
        target: `${user.name} (@${user.username})`,
        detail: `${how} · ${kind === 'admin' ? 'admin console' : 'board'}`,
        refType: 'session',
        refId: info.lastInsertRowid
      });
    q.uLogin(Date.now(), user.id);
    if (kind === 'admin') cookie(req, res, C.admin, key, ADMIN_MAX, { same: 'Strict' });
    else cookie(req, res, C.user, key, KEEP);
  }
  // this device's own sign-ins (to keep them when ending the others)
  function myKeys(req: Request) {
    const ck = parseCookies(req.get('cookie'));
    return [ck[C.user], ck[C.admin]].filter(Boolean).map(k => sha(k));
  }

  // ---- rate limits ----
  const tries = new Map<string, number[]>();
  // count = false: only check whether they're used up
  function tooMany(key: string, max: number, windowMs: number, count = true) {
    const now = Date.now();
    const t = (tries.get(key) || []).filter(x => now - x < windowMs);
    if (count) t.push(now);
    tries.set(key, t);
    return count ? t.length > max : t.length >= max;
  }
  setInterval(() => {
    const now = Date.now();
    for (const [k, t] of tries) if (!t.some(x => now - x < 3600e3)) tries.delete(k);
  }, 10 * 60e3).unref();

  // ---- the one-time setup code ----
  const setupFile = path.join(dataDir, 'setup-code.txt');
  function newSetupCode() {
    const code = randCode(8);
    kv.set('setupCode', { hash: sha('setup:' + code), at: Date.now() });
    try {
      fs.writeFileSync(setupFile, fmtCode(code) + '\n', { mode: 0o600 });
    } catch {
      /* the log still has it */
    }
    return fmtCode(code);
  }
  const setupOpen = () => !!kv.get('setupCode');
  function checkSetupCode(given: unknown) {
    const r = kv.get<{ hash: string }>('setupCode');
    return !!r && safeEq(r.hash, sha('setup:' + normCode(given)));
  }
  function useSetupCode() {
    db.prepare('DELETE FROM kv WHERE key = ?').run('setupCode');
    try {
      fs.rmSync(setupFile, { force: true });
    } catch {
      /* already gone */
    }
  }
  // deploy/reset-admin.sh
  function resetAll() {
    q.wipe();
    audit(null, 'reset', {
      actor: 'server (reset-admin.sh)',
      detail: 'every person, sign-in, passkey and screen removed'
    });
    return newSetupCode();
  }
  if (q.uAdmins() === 0) {
    const code = setupOpen() && fs.existsSync(setupFile) ? fs.readFileSync(setupFile, 'utf8').trim() : newSetupCode();
    console.log(`Family Chalk Planner: no admin yet. Open /admin and enter the setup code ${code}`);
  }

  // ---- housekeeping: expired sign-ins and invites, unfinished accounts, long-gone screens, old log lines ----
  function cleanup() {
    const now = Date.now();
    const cfg = secCfg();
    q.sPurge(now - cfg.signinIdleDays * DAY, now - ADMIN_IDLE, now - ADMIN_MAX);
    if (cfg.signinMaxDays > 0) q.sPurgeEditOlder(now - cfg.signinMaxDays * DAY);
    q.pPurge(now - PAIR_TTL);
    q.iPurge(now - INVITE_TTL);
    for (const u of q.uStale(now - INVITE_TTL)) {
      if (q.iForUser(u.id)) continue;
      q.sDelUser(u.id);
      q.pkDelUser(u.id);
      q.uDel(u.id);
      audit(null, 'person.auto_removed', {
        actor: 'automatic',
        target: `${u.name} (@${u.username})`,
        detail: 'never finished setting up'
      });
    }
    if (cfg.screenRemoveDays > 0)
      for (const d of q.dStale(now - cfg.screenRemoveDays * DAY)) {
        q.dDel(d.id);
        audit(null, 'screen.auto_removed', {
          actor: 'automatic',
          target: `${d.name} (${d.agent})`,
          detail: `not seen for ${Math.round((now - d.last_seen) / DAY)} days`
        });
      }
    q.aPurge(now - Math.max(7, cfg.logDays) * DAY);
  }
  setTimeout(cleanup, 2000).unref();
  setInterval(cleanup, 3600e3).unref();

  // which address forwards requests to the board (the reverse proxy), so the console can name it
  let proxySeen: string | null = null;
  app.use((req, _res, next) => {
    if (!env.TRUST_PROXY && req.get('x-forwarded-for'))
      proxySeen = String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
    next();
  });

  // ---- browser protections on every response ----
  const CSP_CONSOLE =
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'";
  // the board pages: everything comes from the board itself (fonts, pictures, live updates); nothing else may load
  const CSP_BOARD =
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; media-src 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; base-uri 'self'";
  // the new screens (React): no inline scripts at all
  const CSP_APP =
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; media-src 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; base-uri 'self'";
  const APP_PATHS = /^\/(meals|reminders|timers|pantry|jars|next\/[a-z-]+)$/;
  const CSP_OTHER = "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
      'Cross-Origin-Opener-Policy': 'same-origin'
    });
    if (req.secure) res.set('Strict-Transport-Security', 'max-age=15552000');
    const p = req.path;
    res.set(
      'Content-Security-Policy',
      p === '/admin' || p === '/join'
        ? CSP_CONSOLE
        : p === '/' || p === '/edit' || p === '/chores'
          ? CSP_BOARD
          : APP_PATHS.test(p)
            ? CSP_APP
            : CSP_OTHER
    );
    if (/^\/api\/(whoami|account|users|devices|security|pair|passkey)/.test(p)) res.set('Cache-Control', 'no-store');
    next();
  });

  // ---- keep the cookies of screens and board sign-ins that are in use from running out ----
  const renewed = new Map<string, number>(); // key hash -> last time its cookie was re-sent
  app.use((req, res, next) => {
    const ck = parseCookies(req.get('cookie'));
    const now = Date.now();
    const checks: [string, () => unknown][] = [
      [C.device, () => deviceOf(req)],
      [C.user, () => sessionOf(req, 'edit')]
    ];
    for (const [name, ok] of checks) {
      const v = ck[name];
      if (!v || v.length > 100) continue;
      const h = sha(v);
      if (now - (renewed.get(h) || 0) < DAY || !ok()) continue;
      renewed.set(h, now);
      cookie(req, res, name, v, KEEP);
    }
    if (renewed.size > 5000) renewed.clear();
    next();
  });

  // ---- the rules ----
  // public: pairing, sign-in/setup/join, whoami, today's date (install/update health checks)
  const PUBLIC = [
    /^\/pair\//,
    /^\/whoami$/,
    /^\/today$/,
    /^\/health$/,
    /^\/account\/(login|setup|join|enroll)/,
    /^\/passkey\/login\//
  ];
  const SELF = [/^\/account\//, /^\/passkey\//]; // need a signed-in person; checked in the route
  // family screens: events, meals, jars, countdowns, event colors, placing/moving/erasing art (stamps,
  // clipart, words), board style, month title and photos: everything but drawing.
  // Not: wiping a month, changing the stamp/GIF libraries, uploads, settings.
  const FAMILY_POSTS = new Set([
    '/events',
    '/events/update',
    '/events/delete',
    '/meals',
    '/meals/item',
    '/meals/item/delete',
    '/jars',
    '/jars/piece',
    '/countdowns',
    '/evcolor',
    '/evsize',
    '/art/relayout',
    '/holidays',
    '/art',
    '/art/update',
    '/art/bulk',
    '/art/restore',
    '/art/delete',
    '/art/undo',
    '/theme',
    '/meta',
    '/photos/settings',
    '/photos/sync',
    '/border',
    '/frame',
    '/chores/check',
    // reminders, timers, the pantry and the right-hand column's pages
    '/reminders',
    '/reminders/item',
    '/reminders/item/delete',
    '/reminders/check',
    '/timers',
    '/timers/item',
    '/timers/item/delete',
    '/pantry',
    '/pantry/item',
    '/pantry/item/delete',
    '/right-pages',
    '/favorites' // a view-only screen (the wall) has no strip, so it never sends any
  ]);
  const ADMIN = [
    /^\/board-settings/,
    /^\/devices/,
    /^\/users/,
    /^\/security/,
    /^\/google\//,
    /^\/calendar\/status$/,
    /^\/trash$/,
    /^\/notes$/,
    /^\/updates/
  ];
  app.use('/api', (req, res, next) => {
    const write = !(req.method === 'GET' || req.method === 'HEAD');
    if (write && req.get('X-Chalk') !== '1') return res.status(403).json({ error: 'Missing request header' }); // no cross-site form posts
    if (PUBLIC.some(r => r.test(req.path)) || SELF.some(r => r.test(req.path))) return next();
    const need = ADMIN.some(r => r.test(req.path))
      ? RANK.admin
      : !write
        ? RANK.view
        : FAMILY_POSTS.has(req.path)
          ? RANK.family
          : RANK.editor;
    const have = rankOf(req);
    if (have >= need) return next();
    if (write && req.path === '/chores/check' && kidOf(req)) return next(); // a kid's tablet: only their own (checked in the route)
    if (need === RANK.admin && userOf(req)?.role === 'admin')
      return res.status(401).json({ error: 'Sign in to the admin console again', admin: true });
    if (!have) return res.status(401).json({ error: 'Pair this screen or sign in first', pair: true });
    res.status(403).json({
      error:
        need === RANK.admin
          ? 'Only an admin can do that (admin console)'
          : need === RANK.editor
            ? 'Sign in to do that'
            : 'This screen can’t make changes',
      signin: need === RANK.editor
    });
  });

  app.get('/api/whoami', (req, res) => {
    const d = deviceOf(req);
    const e = sessionOf(req, 'edit');
    const a = sessionOf(req, 'admin');
    const u = (a || e)?.user;
    res.json({
      device: d ? { id: d.id, name: d.name, role: d.role } : null,
      user: u ? { username: u.username, name: u.name, role: u.role } : null,
      editor: !!e || !!a,
      admin: !!a,
      rank: rankOf(req),
      setup: setupOpen(),
      firstRun: q.uAdmins() === 0,
      passkeys: passkeysHere(req),
      publicUrl: rp ? rp.origin : null,
      openView,
      homeSignin: homeSignin(req) // the board's sign-in needs no authenticator code here
    });
  });

  // what the route files share
  const ctx = {
    app,
    q,
    kv,
    title,
    rp,
    broadcast,
    secCfg,
    audit,
    cookie,
    clear,
    deviceOf,
    sessionOf,
    userOf,
    startSession,
    myKeys,
    tooMany,
    passkeysHere,
    homeSignin,
    setupOpen,
    checkSetupCode,
    useSetupCode,
    cleanup,
    proxySeen: () => proxySeen
  };
  registerScreens(ctx);
  const { needRecent } = registerAccounts(ctx);
  registerPasskeys(ctx, needRecent);
  registerPeople(ctx);
  registerSecurity(ctx);

  // still allowed? (for open live-update streams: re-checked so a removed screen or ended sign-in stops getting updates)
  function stillAllowed(cookieHeader: string) {
    const fake: ReqLike = { get: h => (String(h).toLowerCase() === 'cookie' ? cookieHeader : ''), ip: '' };
    return rankOf(fake) > 0;
  }

  return {
    deviceOf,
    userOf,
    rankOf,
    kidOf,
    whoOf,
    resetAll,
    newSetupCode,
    cleanup,
    stillAllowed,
    audit,
    proxySeen: () => proxySeen
  };
}
export type Ctx = {
  app: Express;
  q: ReturnType<typeof makeStore>;
  kv: Kv;
  title: string;
  rp: { origin: string; id: string } | null;
  broadcast: (event: string, data: unknown) => void;
  secCfg: () => SecCfg;
  audit: (req: Request | null, event: string, o?: AuditInfo) => void;
  cookie: (
    req: Request,
    res: Response,
    name: string,
    val: string,
    maxAgeMs: number,
    extra?: { path?: string; same?: string }
  ) => void;
  clear: (req: Request, res: Response, name: string) => void;
  deviceOf: (req: ReqLike) => Device | null;
  sessionOf: (req: ReqLike, kind: Kind) => SignedIn | null;
  userOf: (req: ReqLike) => User | null;
  startSession: (req: Request, res: Response, user: User, kind: Kind, how?: string) => void;
  myKeys: (req: Request) => string[];
  tooMany: (key: string, max: number, windowMs: number, count?: boolean) => boolean;
  passkeysHere: (req: Request) => boolean;
  homeSignin: (req: Request) => boolean;
  setupOpen: () => boolean;
  checkSetupCode: (given: unknown) => boolean;
  useSetupCode: () => void;
  cleanup: () => void;
  proxySeen: () => string | null;
};
