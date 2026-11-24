/*
===============================================================================
 Family Chalk Planner | Server | Access | accounts.ts
===============================================================================
 Version:   1.2.8
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-06
 Updated:   2026-11-24

 Purpose:
     People signing in: the first admin (with the setup code), invite
     links, setting up the authenticator app, signing in and out, and "My
     account" (password, authenticator, passkeys).

 Routes:
     POST   /api/account/setup
     POST   /api/account/join
     POST   /api/account/enroll
     POST   /api/account/login
     POST   /api/account/logout
     GET    /api/account/me
     POST   /api/account/password
     POST   /api/account/totp
     POST   /api/account/passkeys/remove

 Used by:
     server/access/access.ts
     server/access/people.ts
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

                                  Updates: database backup and restore, a real
                                  health check, Update now and nightly
                                  updates.

 1.2.8    2026-11-24   joshua    A failed sign-in's username goes into the
                        claude    log in quotes, so it can't start a fake log
                                  line.
===============================================================================
*/

import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import QRCode from 'qrcode';
import type { Ctx } from './access.ts';
import { C, INVITE_TTL } from './access.ts';
import { parseCookies } from './http.ts';
import {
  b32enc,
  checkPassword,
  hashPassword,
  pwKey,
  rid,
  sealPw,
  sealWith,
  sha,
  totpCheck,
  unsealPw
} from './secrets.ts';
import type { User } from './store.ts';

export const USERNAME = /^[a-z0-9][a-z0-9._-]{1,31}$/;
const ENROLL_TTL = 20 * 60e3;
const RECENT = 10 * 60e3;

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------- //
// | Passwords | //
// ------------- //
const pwProblem = (pw: unknown) =>
  typeof pw !== 'string' || pw.length < 10
    ? 'Use a password of at least 10 characters'
    : pw.length > 200
      ? 'That password is too long'
      : null;

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------------------------------- //
// | Setting up an authenticator app | //
// ----------------------------------- //
// A new account (or a new app) gets a QR code; the first code it shows      //
// proves it's set up. Until then nothing is saved for good.                 //
interface Enrolling {
  userId: string;
  secret: string;
  at: number;
  then: string; // 'setup', 'join:<invite hash>' or 'reset'
  salt: Buffer;
  key: Buffer; // derived from the password (never the password itself), to lock the secret
}

export function registerAccounts(ctx: Ctx) {
  const { app, q, title, audit, clear, sessionOf, userOf, startSession, myKeys, tooMany, passkeysHere, broadcast } =
    ctx;

  // the authenticator app's QR code; finished by /api/account/enroll with its first code
  const enrolls = new Map<string, Enrolling>();
  async function enrollment(user: User, then: string, password: string) {
    const secret = b32enc(crypto.randomBytes(20));
    const token = rid(18);
    const salt = crypto.randomBytes(16);
    for (const [k, v] of enrolls) if (Date.now() - v.at > ENROLL_TTL) enrolls.delete(k);
    enrolls.set(token, { userId: user.id, secret, at: Date.now(), then, salt, key: pwKey(password, salt) });
    const label = encodeURIComponent(`${title}:${user.username}`);
    const uri = `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(title)}&algorithm=SHA1&digits=6&period=30`;
    return {
      enroll: token,
      secret: secret.replace(/(.{4})/g, '$1 ').trim(),
      qr: await QRCode.toString(uri, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }),
      uri
    };
  }

  // ------------------- //
  // | The first admin | //
  // ------------------- //
  // Step 1 of the first run: setup code + the new admin's name and password //
  // -> authenticator QR                                                     //
  app.post('/api/account/setup', async (req, res) => {
    const b = req.body || {};
    if (!ctx.setupOpen()) return res.status(400).json({ error: 'Setup is already done - sign in instead' });
    if (tooMany('setup:' + req.ip, 8, 15 * 60e3) || tooMany('setup:*', 30, 15 * 60e3))
      return res.status(429).json({ error: 'Too many tries - wait 15 minutes' });
    if (!ctx.checkSetupCode(b.code)) {
      console.warn(`Chalk Planner: wrong setup code from ${req.ip}`);
      audit(req, 'setup.failed', { detail: 'wrong setup code' });
      return res.status(401).json({ error: 'That setup code didn’t work' });
    }
    const username = String(b.username || '')
      .trim()
      .toLowerCase();
    if (!USERNAME.test(username))
      return res.status(400).json({ error: 'Username: 2-32 letters, numbers, dots, dashes or underscores' });
    const pwErr = pwProblem(b.password);
    if (pwErr) return res.status(400).json({ error: pwErr });
    let u = q.uByName(username);
    if (u && u.totp_ok) return res.status(400).json({ error: 'That username is taken' });
    if (!u) {
      q.uAdd(
        rid(6),
        username,
        String(b.name || username)
          .trim()
          .slice(0, 40) || username,
        'admin',
        Date.now()
      );
      u = q.uByName(username)!;
    }
    q.uUpd(
      String(b.name || u.name)
        .trim()
        .slice(0, 40) || username,
      'admin',
      u.id
    );
    q.uSetPw(hashPassword(b.password), u.id);
    res.json(await enrollment(u, 'setup', b.password));
  });

  // ------------------ //
  // | An invite link | //
  // ------------------ //
  // Invite link: the person sets their password -> authenticator QR         //
  app.post('/api/account/join', async (req, res) => {
    const b = req.body || {};
    if (tooMany('join:' + req.ip, 10, 15 * 60e3, false))
      return res.status(429).json({ error: 'Too many tries - wait 15 minutes' });
    const inv = q.iGet(sha('invite:' + String(b.invite || '')));
    const u = inv && Date.now() - inv.created < INVITE_TTL ? q.uById(inv.user_id) : undefined;
    if (!inv || !u) {
      tooMany('join:' + req.ip, 10, 15 * 60e3); // only bad links count
      return res.status(404).json({ error: 'That invite link has expired or was already used - ask for a new one' });
    }
    if (b.check) return res.json({ username: u.username, name: u.name, role: u.role });
    const pwErr = pwProblem(b.password);
    if (pwErr) return res.status(400).json({ error: pwErr });
    q.uSetPw(hashPassword(b.password), u.id);
    res.json({ ...(await enrollment(u, 'join:' + inv.code_hash, b.password)), username: u.username });
  });

  // ------------------------------- //
  // | The first code from the app | //
  // ------------------------------- //
  // Step 2: the first code from the authenticator app proves it's set up -> //
  // signed in                                                               //
  app.post('/api/account/enroll', (req, res) => {
    const b = req.body || {};
    const e = enrolls.get(String(b.enroll || ''));
    if (!e || Date.now() - e.at > ENROLL_TTL)
      return res.status(400).json({ error: 'This took too long - start again' });
    const u = q.uById(e.userId);
    if (!u) return res.status(400).json({ error: 'Start again' });
    if (tooMany('enroll:' + b.enroll, 8, ENROLL_TTL)) {
      enrolls.delete(b.enroll);
      return res.status(429).json({ error: 'Too many wrong codes - start again' });
    }
    const step = totpCheck(e.secret, b.code, 0);
    if (step < 0)
      return res
        .status(401)
        .json({ error: 'That code didn’t match - check the time on your phone and try the newest code' });
    enrolls.delete(b.enroll);
    if (e.then === 'setup') {
      if (!ctx.setupOpen()) return res.status(400).json({ error: 'Setup was already finished' });
      ctx.useSetupCode();
    }
    if (e.then.startsWith('join:')) q.iDelUser(u.id);
    audit(req, e.then === 'setup' ? 'person.created' : e.then === 'reset' ? 'authenticator.changed' : 'person.joined', {
      actor: u.username,
      target: `${u.name} (@${u.username})`,
      detail:
        e.then === 'setup'
          ? 'first admin, with the setup code'
          : e.then === 'reset'
            ? 'moved to a new authenticator app; other sign-ins ended'
            : `finished the invite as ${u.role}`,
      refType: 'person',
      refId: u.id
    });
    const wasOk = u.totp_ok;
    q.uSetTotp(sealWith(e.key, e.salt, e.secret), 1, u.id);
    q.uTotpLast(step, u.id);
    if (wasOk && e.then === 'reset') q.sDelUser(u.id); // a new authenticator: other sign-ins end
    const fresh = q.uById(u.id)!;
    startSession(req, res, fresh, 'edit', e.then === 'reset' ? 'new authenticator app' : 'new account');
    if (fresh.role === 'admin' && e.then !== 'reset') startSession(req, res, fresh, 'admin');
    broadcast('devices', {});
    res.json({ ok: true, role: fresh.role });
  });

  // -------------- //
  // | Signing in | //
  // -------------- //
  // Sign in with password + authenticator code; kind 'edit' (the board,     //
  // long-lived) or 'admin' (the console)                                    //
  app.post('/api/account/login', (req, res) => {
    const b = req.body || {};
    const kind = b.kind === 'admin' ? 'admin' : 'edit';
    const username = String(b.username || '')
      .trim()
      .toLowerCase()
      .slice(0, 40);
    if (tooMany('login:' + req.ip, 20, 15 * 60e3, false) || tooMany('user:' + username, 8, 15 * 60e3, false))
      return res.status(429).json({ error: 'Too many tries - wait 15 minutes' });
    const u = q.uByName(username);
    const pwOk = checkPassword(b.password, u && u.pw_hash);
    // at home, with home sign-in on: the board (not the console) without a code, unless one is typed
    const noCode = kind === 'edit' && ctx.homeSignin(req) && !String(b.code || '').trim();
    const secret = u && u.totp_ok && pwOk && !noCode ? unsealPw(b.password, u.totp_secret) : null;
    const step = noCode ? 0 : u && secret ? totpCheck(secret, b.code, u.totp_last) : -1;
    if (!u || !u.totp_ok || !pwOk || step < 0) {
      tooMany('login:' + req.ip, 20, 15 * 60e3);
      tooMany('user:' + username, 8, 15 * 60e3);
      // the name as typed, in quotes with anything odd escaped (a name can't start a fake log line)
      console.warn(`Chalk Planner: failed sign-in for ${JSON.stringify(username)} from ${req.ip}`);
      audit(req, 'signin.failed', {
        actor: null,
        target: username || '(blank)',
        detail: !u ? 'unknown username' : !pwOk ? 'wrong password' : noCode ? 'not set up yet' : 'wrong or reused code',
        refType: u ? 'person' : null,
        refId: u ? u.id : null
      });
      return res.status(401).json({
        error: noCode ? 'That username or password didn’t work' : 'That username, password or code didn’t work'
      });
    }
    if (kind === 'admin' && u.role !== 'admin') return res.status(403).json({ error: 'This account isn’t an admin' });
    if (!noCode) q.uTotpLast(step, u.id);
    startSession(req, res, u, kind, noCode ? 'password (home network)' : 'password + code');
    if (kind === 'admin' && !sessionOf(req, 'edit')) startSession(req, res, u, 'edit'); // the board works too after an admin sign-in
    res.json({ ok: true, role: u.role });
  });

  // --------------- //
  // | Signing out | //
  // --------------- //
  app.post('/api/account/logout', (req, res) => {
    const ck = parseCookies(req.get('cookie'));
    const u = userOf(req);
    for (const name of [C.user, C.admin]) if (ck[name]) q.sDel(sha(ck[name]));
    if (u)
      audit(req, 'signout', {
        actor: u.username,
        target: `${u.name} (@${u.username})`,
        detail: 'signed out on this device'
      });
    clear(req, res, C.user);
    clear(req, res, C.admin);
    res.json({ ok: true });
  });

  // -------------- //
  // | My account | //
  // -------------- //
  app.get('/api/account/me', (req, res) => {
    const u = userOf(req);
    if (!u) return res.status(401).json({ error: 'Sign in first', signin: true });
    res.json({
      username: u.username,
      name: u.name,
      role: u.role,
      passkeys: q.pkByUser(u.id),
      passkeysHere: passkeysHere(req)
    });
  });

  app.post('/api/account/password', (req, res) => {
    const u = userOf(req);
    const b = req.body || {};
    if (!u) return res.status(401).json({ error: 'Sign in first' });
    if (tooMany('pw:' + u.id, 8, 15 * 60e3)) return res.status(429).json({ error: 'Too many tries - wait 15 minutes' });
    if (!checkPassword(b.current, u.pw_hash))
      return res.status(401).json({ error: 'Your current password didn’t match' });
    const pwErr = pwProblem(b.next);
    if (pwErr) return res.status(400).json({ error: pwErr });
    const totp = u.totp_secret ? unsealPw(b.current, u.totp_secret) : null; // re-lock the authenticator secret with the new password
    q.uSetPw(hashPassword(b.next), u.id);
    if (totp) q.uSetSealed(sealPw(b.next, totp), u.id);
    const keep = myKeys(req); // sign out everywhere else, stay signed in here
    for (const s of q.sList(u.id)) if (!keep.includes(s.key_hash)) q.sDelId(s.id);
    audit(req, 'password.changed', {
      target: `${u.name} (@${u.username})`,
      detail: 'other sign-ins ended',
      refType: 'person',
      refId: u.id
    });
    res.json({ ok: true });
  });

  // --------------------------- //
  // | A new authenticator app | //
  // --------------------------- //
  // Move to a new authenticator app (needs the password)                    //
  app.post('/api/account/totp', async (req, res) => {
    const u = userOf(req);
    const b = req.body || {};
    if (!u) return res.status(401).json({ error: 'Sign in first' });
    if (tooMany('pw:' + u.id, 8, 15 * 60e3)) return res.status(429).json({ error: 'Too many tries - wait 15 minutes' });
    if (!checkPassword(b.password, u.pw_hash)) return res.status(401).json({ error: 'Your password didn’t match' });
    res.json(await enrollment(u, 'reset', b.password));
  });

  // ---------------------------------- //
  // | Passkeys need a recent sign-in | //
  // ---------------------------------- //
  // Adding or removing a passkey needs a sign-in from the last 10 minutes   //
  // on this device, so someone who picks up a tablet that's already signed  //
  // in can't add their own passkey (and keep access) or remove yours.       //
  function needRecent(req: Request, res: Response) {
    const now = Date.now();
    if ([sessionOf(req, 'admin'), sessionOf(req, 'edit')].some(s => s && now - s.created < RECENT)) return false;
    res.status(401).json({ error: 'For safety, sign in again to change passkeys', reauth: true });
    return true;
  }

  app.post('/api/account/passkeys/remove', (req, res) => {
    const u = userOf(req);
    if (!u) return res.status(401).json({ error: 'Sign in first' });
    if (needRecent(req, res)) return;
    const pk = q.pkById(String((req.body || {}).id || ''));
    if (pk && pk.user_id === u.id) {
      q.pkDel(pk.id, u.id);
      audit(req, 'passkey.removed', { target: `“${pk.name}” of ${u.name} (@${u.username})` });
    }
    res.json({ ok: true });
  });

  return { needRecent };
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
