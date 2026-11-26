/*
===============================================================================
 Family Chalk Planner | Server | Access | access.ts
===============================================================================
 Version:   1.3.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-06
 Updated:   2026-11-26

 Purpose:
     Who may do what.

     SCREENS are paired once and have a role (no sign-in, they just keep
     working):
       view    - shows the board (a wall display)
       family  - view + change events, meals, jars and countdowns, and
           decorate with stamps / clipart / words
                 (no freehand drawing)
       kid:<person> - a child's own tablet: see the board, check off their
           own chores

     PEOPLE sign in, on a tablet or phone, with a passkey (Face ID / Touch
     ID / fingerprint, needs HTTPS and PUBLIC_URL) or with username +
     password + a code from an authenticator app:
       editor  - everything on the board: events, drawing, board style,
           photos (signs in again every 60 days,
                 adjustable)
       admin   - editor + the admin console at /admin: screens, people,
           calendar and board settings.
                 The console asks for a fresh sign-in (it lasts 30 idle
                     minutes, 12 hours at most).

     First run: the one-time setup code from the server log /
     data/setup-code.txt creates the first admin. deploy/reset-admin.sh
     wipes every person, sign-in and screen and makes a new code. Every
     key (screen, sign-in) is random, kept in an HttpOnly cookie, and
     stored only as a hash.

     This file: who is asking, the rules every /api request passes, and
     the setup code. The routes are in screens.ts (pairing), accounts.ts
     (signing in, my account), passkeys.ts, people.ts and security.ts.

 Routes:
     USE    /api
     GET    /api/whoami

 Used by:
     server/access/accounts.ts
     server/access/passkeys.ts
     server/access/people.ts
     server/access/screens.ts
     server/access/security.ts
     server/main.ts
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    Move access (screens, people, sign-in,
                        claude    passkeys, security) to TypeScript.
                        colby
                                  Database migrations; chores, meals and jars
                                  in their own tables.

                                  Reminders, timers, the pantry and the right-
                                  hand column's pages (server).

                                  Immich photos, slideshow extras, a filled-in
                                  today, and the frame's thickness.

                                  ... and 3 more (the board rebuilt in React
                                  and TypeScript)

 0.13.1    2026-11-07   joshua    CSP_BOARD shared with pages.ts for that
                        claude    fallback.

 0.14.0    2026-11-07   joshua    Screens report a crash (shown in Activity).
                        claude

 0.15.0    2026-11-08   joshua    A screen sets the bottom of its own Notes
                        claude    column.

                                  /week is one of the screens' pages.

 0.17.0    2026-11-12   joshua    A family screen saves its own menu (the cork
                        colby     or the ☰ button), and pins pictures to
                        claude    Favorites, and keeps a picture from the
                                  web it places.

 1.0.0     2026-11-14   joshua    As the Home Assistant app: people are
                        claude    Home Assistant's own, through its Ingress
                                  (its admins are the board's; everyone
                                  else has the role set in the console), and
                                  the board's own sign-ins are off.

 1.1.0    2026-11-17   joshua    Family screens may change the look of their
                        claude    own cards and ☰ menu.
                                  Family screens may choose sleeps or days for
                                  their countdowns.

 1.2.0    2026-11-21   joshua    Family screens may start their 🗓️ Week on
                        colby     today and pick Split View; a screen may
                        claude    hide its − / + / Fit buttons (from Colby
                                  Way's board). Fill the screen, and the
                                  wooden frame, per screen. Birthdays for
                                  family screens too. Its language (anyone
                                  may ask which; a screen may pick its own).

 1.2.1    2026-11-22   joshua    /notescol: a screen's own Notes column.
                        claude

 1.3.0    2026-11-26   joshua    /arrows: a screen's month arrows, always or
                        claude    fading. /offhours: what a screen does
                                  overnight.
===============================================================================
*/

import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { Express, Request, Response } from 'express';
import type { Kv } from '../kv.ts';
import { describe, openedByIp, parseCookies, privateAddress } from './http.ts';
import type { ReqLike } from './http.ts';
import { fmtCode, normCode, randCode, randomKey, safeEq, sha } from './secrets.ts';
import { haApp, ingressPath, ingressUser } from './ingress.ts';
import type { HomeAssistant } from '../homeassistant.ts';
import { makeStore } from './store.ts';
import type { Device, Session, User } from './store.ts';
import { registerScreens } from './screens.ts';
import { registerAccounts } from './accounts.ts';
import { registerPasskeys } from './passkeys.ts';
import { registerPeople } from './people.ts';
import { registerSecurity } from './security.ts';

// the board as it was (/classic): everything comes from the board itself; its scripts are inline.
// Also used by pages.ts when the new screens aren't built and the board falls back to it.
export const CSP_BOARD =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; media-src 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; base-uri 'self'";

export const DAY = 24 * 3600e3;
export const PAIR_TTL = 15 * 60e3;
export const INVITE_TTL = 3 * DAY;
export const ADMIN_IDLE = 30 * 60e3;
export const ADMIN_MAX = 12 * 3600e3;
export const KEEP = 400 * DAY; // cookie lifetime (browsers cap it near 400 days); renewed every day the device is used

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------------------- //
// | Cookie names and ranks | //
// -------------------------- //
export const C = { device: 'fcp_device', pair: 'fcp_pair', user: 'fcp_user', admin: 'fcp_admin' };
export const RANK = { view: 1, family: 2, editor: 3, admin: 4 };
const roleRank = (r: string) => (/^kid:/.test(r || '') ? 1 : 0) || { view: 1, family: 2 }[r] || 0;

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------------------------------- //
// | How long sign-ins and screens last | //
// -------------------------------------- //
// Board sign-ins ask again every signinMaxDays after signing in, or sooner  //
// after signinIdleDays unused. Screens stay paired for good: quiet ones are //
// only flagged (screenRemoveDays 0 = never remove automatically); an admin  //
// removes them.                                                             //
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

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------- //
// | Types | //
// --------- //
export interface AuditInfo {
  actor?: string | null;
  target?: string | null;
  detail?: string | null;
  refType?: string | null;
  refId?: string | number | bigint | null;
}
type Kind = 'edit' | 'admin';
type HaRole = keyof typeof RANK;
interface HaWho {
  id: string;
  name: string;
  role: HaRole;
}
type SignedIn = Session & { user: User };

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------------------------- //
// | The rules, and who is asking | //
// -------------------------------- //
export function setup(
  app: Express,
  {
    db,
    kv,
    dataDir,
    env,
    title,
    broadcast,
    ha = null
  }: {
    db: DatabaseSync;
    kv: Kv;
    dataDir: string;
    env: NodeJS.ProcessEnv;
    title: string;
    broadcast: (event: string, data: unknown) => void;
    ha?: HomeAssistant | null;
  }
) {
  const q = makeStore(db);
  const openView = /^(1|true|yes|lan)$/i.test(String(env.ALLOW_UNPAIRED_VIEW || ''));

  // -------------------------------------------- //
  // | Passkeys need the board's public address | //
  // -------------------------------------------- //
  // Passkeys are tied to one web address (they need HTTPS and a name, not   //
  // an IP): PUBLIC_URL                                                      //
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
  // ---------------- //
  // | Home sign-in | //
  // ---------------- //
  // Board sign-in with just a password, at home (admin console → Board      //
  // settings → On your network; off unless turned on). Never for the admin  //
  // console, and new accounts still set up an authenticator app.            //
  const homeSigninOn = env.HOME_SIGNIN === 'on';
  const homeSignin = (req: Request) => homeSigninOn && privateAddress(req.ip) && openedByIp(req.get('host'));

  const secCfg = (): SecCfg => ({ ...SEC_DEFAULT, ...(kv.get<Partial<SecCfg>>('security') || {}) });

  // ---- who is this? (a paired screen, a signed-in person, or both); remembered for the request ----
  const seen = new WeakMap<
    object,
    { dev?: Device | null; edit?: SignedIn | null; admin?: SignedIn | null; ha?: HaWho | null }
  >();
  // ---------------- //
  // | Who is this? | //
  // ---------------- //
  // A paired screen, a signed-in person, or both. Worked out once per       //
  // request and remembered for it.                                          //
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
  // ------------------------------------------ //
  // | A Home Assistant person (the app only) | //
  // ------------------------------------------ //
  // Opened inside Home Assistant: Home Assistant already signed them in and //
  // says who they are. Its admins are the board's admins; everyone else    //
  // has the role an admin set for them in the console (or the default).    //
  // Worked out before the rules (it asks Home Assistant who its admins     //
  // are), then remembered for the request.                                 //
  const haRoles = () => kv.get<Record<string, HaRole>>('haRoles') || {};
  const haDefault = (): HaRole => kv.get<HaRole>('haDefaultRole') || 'family';
  const haKnown = new Map<string, HaWho>(); // id -> who, as last seen (for live streams' re-checks)
  async function resolveHa(req: ReqLike) {
    const m = memo(req);
    if (m.ha !== undefined) return m.ha;
    const u = ingressUser(req);
    if (!u || !ha) return (m.ha = null);
    let admin: boolean;
    try {
      admin = !!(await ha.person(u.id))?.admin;
    } catch (e) {
      console.error(`Chalk Planner: couldn't ask Home Assistant who its admins are: ${(e as Error).message}`);
      admin = haKnown.get(u.id)?.role === 'admin'; // the last answer, if there was one
    }
    const role: HaRole = admin ? 'admin' : haRoles()[u.id] || haDefault();
    const who = { id: u.id, name: u.name, role };
    haKnown.set(u.id, who);
    return (m.ha = who);
  }
  const haOf = (req: ReqLike) => memo(req).ha || null;
  // a Home Assistant person who may change things, as the board's other code expects a person
  const haUser = (w: HaWho): User => ({
    id: 'ha:' + w.id,
    username: w.name,
    name: w.name,
    role: w.role === 'admin' ? 'admin' : 'editor',
    pw_hash: null,
    totp_secret: null,
    totp_ok: 1,
    totp_last: 0,
    created: 0,
    last_login: null
  });
  if (haApp())
    app.use(async (req, _res, next) => {
      await resolveHa(req);
      next();
    });

  const userOf = (req: ReqLike) => {
    const w = haOf(req);
    if (w) return w.role === 'admin' || w.role === 'editor' ? haUser(w) : null;
    return (sessionOf(req, 'admin') || sessionOf(req, 'edit'))?.user || null;
  };
  // ------------------ //
  // | A kid's tablet | //
  // ------------------ //
  // A kid's tablet (when no grown-up is signed in on it): the person id it  //
  // belongs to                                                              //
  const kidOf = (req: ReqLike) => {
    if (userOf(req)) return null;
    const m = /^kid:([a-z0-9]{1,16})$/.exec(deviceOf(req)?.role || '');
    return m ? m[1] : null;
  };
  const whoOf = (req: ReqLike) => haOf(req)?.name || userOf(req)?.name || deviceOf(req)?.name || 'someone';
  function rankOf(req: ReqLike) {
    const w = haOf(req);
    if (w) return RANK[w.role];
    let r = openView ? 1 : 0;
    const d = deviceOf(req);
    if (d) r = Math.max(r, roleRank(d.role));
    if (sessionOf(req, 'edit')) r = Math.max(r, RANK.editor);
    if (sessionOf(req, 'admin')) r = RANK.admin;
    return r;
  }

  // -------------------- //
  // | The activity log | //
  // -------------------- //
  // Every security event: who did it, to what, from which device and        //
  // address.                                                                //
  function audit(req: Request | null, event: string, o: AuditInfo = {}) {
    let actor = o.actor;
    if (actor === undefined && req) {
      const m = memo(req);
      const u = m.admin?.user || m.edit?.user;
      const d = m.dev;
      actor = m.ha ? 'Home Assistant: ' + m.ha.name : u ? u.username : d ? 'screen: ' + d.name : null;
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

  // ------------------------ //
  // | Cookies and sign-ins | //
  // ------------------------ //
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
  // ------------------------------ //
  // | This device's own sign-ins | //
  // ------------------------------ //
  // This device's own sign-ins (to keep them when ending the others)        //
  function myKeys(req: Request) {
    const ck = parseCookies(req.get('cookie'));
    return [ck[C.user], ck[C.admin]].filter(Boolean).map(k => sha(k));
  }

  // ---- rate limits ----
  const tries = new Map<string, number[]>();
  // --------------- //
  // | Rate limits | //
  // --------------- //
  // Wrong passwords, codes and pairing requests are counted per address;    //
  // too many in a while and it waits. count = false only checks.            //
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
  // --------------------------- //
  // | The one-time setup code | //
  // --------------------------- //
  // Shown in the server log and data/setup-code.txt on a new board; it      //
  // creates the first admin and then stops working.                         //
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
  // ----------------------------------------- //
  // | Starting over (deploy/reset-admin.sh) | //
  // ----------------------------------------- //
  // Deploy/reset-admin.sh                                                   //
  function resetAll() {
    q.wipe();
    audit(null, 'reset', {
      actor: 'server (reset-admin.sh)',
      detail: 'every person, sign-in, passkey and screen removed'
    });
    return newSetupCode();
  }
  if (haApp()) console.log('Family Chalk Planner: open it from Home Assistant (its sidebar, or the app’s Open web UI)');
  else if (q.uAdmins() === 0) {
    const code = setupOpen() && fs.existsSync(setupFile) ? fs.readFileSync(setupFile, 'utf8').trim() : newSetupCode();
    console.log(`Family Chalk Planner: no admin yet. Open /admin and enter the setup code ${code}`);
  }

  // ---------------- //
  // | Housekeeping | //
  // ---------------- //
  // Expired sign-ins and invites, unfinished accounts, long-gone screens    //
  // and old log lines; soon after start-up, then every hour.                //
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

  // -------------------------------------- //
  // | The reverse proxy, if there is one | //
  // -------------------------------------- //
  // Which address forwards requests to the board (the reverse proxy), so    //
  // the console can name it                                                 //
  let proxySeen: string | null = null;
  app.use((req, _res, next) => {
    if (!env.TRUST_PROXY && req.get('x-forwarded-for'))
      proxySeen = String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
    next();
  });

  // ----------------------------------------- //
  // | Browser protections on every response | //
  // ----------------------------------------- //
  // The board pages load everything from the board itself (fonts, pictures, //
  // live updates) and nothing else; the new screens allow no inline scripts //
  // at all. No framing, no referrer, no camera or microphone, and nothing   //
  // private is cached.                                                      //
  const CSP_CONSOLE =
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'self'";
  // the new screens (React): no inline scripts at all
  const CSP_APP =
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; media-src 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; base-uri 'self'";
  const APP_PATHS = /^\/(|edit|week|chores|settings|meals|reminders|timers|pantry|jars|next\/[a-z-]+)$/;
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
        : /^\/classic(\/(edit|chores))?$/.test(p)
          ? CSP_BOARD
          : APP_PATHS.test(p)
            ? CSP_APP
            : CSP_OTHER
    );
    if (/^\/api\/(whoami|account|users|devices|security|pair|passkey|ha\/)/.test(p))
      res.set('Cache-Control', 'no-store');
    // inside Home Assistant the board is shown in its frame (same address as Home Assistant)
    if (ingressPath(req)) {
      res.removeHeader('X-Frame-Options');
      const csp = String(res.get('Content-Security-Policy') || '');
      res.set('Content-Security-Policy', csp.replace("frame-ancestors 'none'", "frame-ancestors 'self'"));
    }
    next();
  });

  // ------------------------------------------- //
  // | Keeping cookies in use from running out | //
  // ------------------------------------------- //
  // A screen or board sign-in that's being used has its cookie sent again   //
  // (at most once a day), so it doesn't run out while it's in use.          //
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

  // ------------- //
  // | The rules | //
  // ------------- //
  // Public: pairing, signing in or setting up, whoami, today's date (the    //
  // install and update health checks). SELF: needs a signed-in person,      //
  // checked in the route. Family screens: events, meals, jars, countdowns,  //
  // event colors, placing, moving and erasing art (stamps, clipart, words), //
  // the board style, the month title and photos: everything but drawing.    //
  // Not wiping a month, the stamp and GIF libraries, uploads or settings.   //
  // Admins: everything in the admin console.                                //
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
  // clipart, words), board style, month title, photos, holidays, birthdays and the Notes column:
  // everything but drawing. Not: wiping a month, changing the stamp/GIF libraries, uploads, the
  // calendar and trash day (the admin's).
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
    '/birthdays', // (a cake on birthdays, and counting down to every one)
    '/art',
    '/art/update',
    '/art/bulk',
    '/art/restore',
    '/art/delete',
    '/art/undo',
    '/theme',
    '/styles', // the styles saved by name
    '/meta',
    '/photos/settings',
    '/photos/sync',
    '/border',
    '/frame',
    '/chores/check',
    '/chores/ha-check', // a Home Assistant to-do list
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
    '/favorites', // a view-only screen (the wall) has no strip, so it never sends any
    '/notesbottom', // (the wall's is set in the admin console)
    '/notescol', // its own Notes column on the month and the week (the wall's: the admin console)
    '/menustyle', // the cork or the ☰ button (the wall has neither)
    '/uilook', // the look of its cards and ☰ menu
    '/sleeps', // its countdowns in sleeps or days
    '/weekfrom', // its 🗓️ Week from today or from the board's first day
    '/nozoom', // whether it shows the − / + / Fit buttons
    '/arrows', // its month arrows: always, or fading when nobody's touching it
    '/offhours', // what it does overnight: the slideshow, dimmed, black or nothing
    '/weekview', // its 🗓️ Week: Split View, and what's under the week
    '/boardfit', // fill the screen, and the wooden frame
    '/lang', // its language
    '/clip/favorites', // ★ a picture into Favorites
    '/clip/web/keep' // a public-domain picture from the web, onto the board
  ]);
  const ADMIN = [
    /^\/ha\//,
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
  // ---------------------------------- //
  // | Every /api request passes here | //
  // ---------------------------------- //
  // A change must carry the X-Chalk header (no other site can post to the   //
  // board), then it needs the rank its address asks for. The answer tells   //
  // the screen what to do: sign in, pair, or sign in to the console again.  //
  app.use('/api', (req, res, next) => {
    const write = !(req.method === 'GET' || req.method === 'HEAD');
    if (write && req.get('X-Chalk') !== '1') return res.status(403).json({ error: 'Missing request header' }); // no cross-site form posts
    // the app: people sign in to Home Assistant, not to the board
    if (haApp() && (/^\/(account|passkey)\//.test(req.path) || /^\/users\/(invite|reinvite)/.test(req.path)))
      return res.status(403).json({ error: 'Sign-in is Home Assistant’s: open the board from Home Assistant' });
    if (PUBLIC.some(r => r.test(req.path)) || SELF.some(r => r.test(req.path))) return next();
    // which language (a screen not paired yet shows its pairing code in the board's language)
    if (!write && req.path === '/lang') return next();
    const need = ADMIN.some(r => r.test(req.path))
      ? RANK.admin
      : !write
        ? RANK.view
        : FAMILY_POSTS.has(req.path)
          ? RANK.family
          : req.path === '/screen-error'
            ? RANK.view
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

  // ------------------------- //
  // | A screen that crashed | //
  // ------------------------- //
  // A screen hit an error it couldn't recover from: it shows a message, and //
  // the error is kept in Activity (and the server log) so it can be fixed.  //
  app.post('/api/screen-error', (req, res) => {
    if (tooMany('screenerr:' + req.ip, 10, 15 * 60e3)) return res.status(429).json({ error: 'Too many reports' });
    const b = req.body || {};
    // what the screen sent, without control characters
    const clip = (v: unknown, n: number) =>
      String(v || '')
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001f]/g, ' ')
        .slice(0, n);
    const where = clip(b.where, 80) || '?';
    audit(req, 'screen.error', { target: where, detail: clip(b.message, 300) || 'no details' });
    console.warn(
      `Chalk Planner: a screen crashed on ${where}: ${clip(b.message, 300)}\n${String(b.stack || '').slice(0, 2000)}`
    );
    res.json({ ok: true });
  });

  // ------------- //
  // | Who am I? | //
  // ------------- //
  app.get('/api/whoami', (req, res) => {
    const d = deviceOf(req);
    const e = sessionOf(req, 'edit');
    const a = sessionOf(req, 'admin');
    const w = haOf(req);
    const u = w ? userOf(req) : (a || e)?.user;
    res.json({
      device: d ? { id: d.id, name: d.name, role: d.role } : null,
      user: u ? { username: u.username, name: u.name, role: u.role } : null,
      editor: w ? RANK[w.role] >= RANK.editor : !!e || !!a,
      admin: w ? w.role === 'admin' : !!a,
      rank: rankOf(req),
      // the Home Assistant app: who Home Assistant says this is, and whether it's opened inside it
      ha: haApp() ? { inside: !!ingressPath(req), person: w ? { name: w.name, role: w.role } : null } : null,
      setup: haApp() ? false : setupOpen(),
      firstRun: haApp() ? false : q.uAdmins() === 0,
      passkeys: passkeysHere(req),
      publicUrl: rp ? rp.origin : null,
      openView,
      homeSignin: homeSignin(req) // the board's sign-in needs no authenticator code here
    });
  });

  // ------------------------------------------- //
  // | Home Assistant's people, and their roles | //
  // ------------------------------------------- //
  // The admin console's People, as the app: everyone with a Home Assistant  //
  // login, the role each has on the board (its admins are always admins),  //
  // and the role for anyone not set yet.                                    //
  app.get('/api/ha/people', async (_req, res) => {
    if (!ha) return res.status(404).json({ error: 'Only as the Home Assistant app' });
    try {
      const roles = haRoles();
      res.json({
        default: haDefault(),
        people: (await ha.listPeople(true)).map(p => ({
          id: p.id,
          name: p.name,
          admin: p.admin,
          role: p.admin ? 'admin' : roles[p.id] || null
        }))
      });
    } catch (e) {
      res.status(502).json({ error: (e as Error).message });
    }
  });
  app.post('/api/ha/people', (req, res) => {
    if (!ha) return res.status(404).json({ error: 'Only as the Home Assistant app' });
    const b = req.body || {};
    const ok = (r: unknown): r is HaRole => typeof r === 'string' && r in RANK;
    if (b.default !== undefined) {
      if (!ok(b.default) || b.default === 'admin')
        return res.status(400).json({ error: 'Pick view, family or editor' });
      kv.set('haDefaultRole', b.default);
      audit(req, 'ha.role', { target: 'anyone not set', detail: b.default });
    }
    if (b.id !== undefined) {
      if (typeof b.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(b.id) || !(b.role === null || ok(b.role)))
        return res.status(400).json({ error: 'Bad person or role' });
      const roles = haRoles();
      if (b.role === null) delete roles[b.id];
      else roles[b.id] = b.role;
      kv.set('haRoles', roles);
      haKnown.delete(b.id);
      audit(req, 'ha.role', { target: String(b.name || b.id).slice(0, 60), detail: b.role || 'the default' });
    }
    res.json({ ok: true });
  });

  // ------------------------------ //
  // | What the route files share | //
  // ------------------------------ //
  // What the route files share                                              //
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

  // ------------------ //
  // | Still allowed? | //
  // ------------------ //
  // Still allowed? (for open live-update streams: re-checked so a removed   //
  // screen or ended sign-in stops getting updates)                          //
  function stillAllowed(req: ReqLike) {
    // inside Home Assistant: Home Assistant ends the session when they sign out of it
    const u = ingressUser(req);
    if (u) return RANK[haKnown.get(u.id)?.role || haDefault()] > 0;
    const fake: ReqLike = { get: h => (String(h).toLowerCase() === 'cookie' ? req.get('cookie') : ''), ip: '' };
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

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------------------------------- //
// | The shared context, as a type | //
// --------------------------------- //
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

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
