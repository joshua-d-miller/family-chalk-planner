// Passkeys (WebAuthn): Face ID / Touch ID / fingerprint sign-in. They need HTTPS and the board's public
// address (PUBLIC_URL), because a passkey belongs to one web address.
import type { Request, Response } from 'express';
import * as webauthn from '@simplewebauthn/server';
import type { Ctx } from './access.ts';
import { describe } from './http.ts';
import { rid } from './secrets.ts';

const TTL = 5 * 60e3;
interface Challenge {
  challenge: string;
  userId?: string;
  kind?: 'edit' | 'admin';
  at: number;
}
const transportsOf = (t: string | null) => (t ? (JSON.parse(t) as webauthn.AuthenticatorTransport[]) : undefined);

export function registerPasskeys(
  { app, q, title, rp, audit, userOf, sessionOf, startSession, tooMany, passkeysHere }: Ctx,
  needRecent: (req: Request, res: Response) => boolean
) {
  const challenges = new Map<string, Challenge>();
  function keepChallenge(v: Omit<Challenge, 'at'>) {
    const id = rid(12);
    for (const [k, c] of challenges) if (Date.now() - c.at > TTL) challenges.delete(k);
    challenges.set(id, { ...v, at: Date.now() });
    return id;
  }
  function takeChallenge(id: unknown) {
    const c = challenges.get(String(id || ''));
    challenges.delete(String(id || ''));
    return c && Date.now() - c.at < TTL ? c : null;
  }
  function noPasskeys(req: Request, res: Response) {
    if (passkeysHere(req)) return false;
    res.status(400).json({
      error: rp
        ? `Passkeys work at ${rp.origin} only`
        : 'Passkeys need PUBLIC_URL (an https:// address) in the board’s settings'
    });
    return true;
  }

  // ---- adding one (My account) ----
  app.post('/api/passkey/register/options', async (req, res) => {
    const u = userOf(req);
    if (!u) return res.status(401).json({ error: 'Sign in first' });
    if (noPasskeys(req, res) || needRecent(req, res) || !rp) return;
    const opts = await webauthn.generateRegistrationOptions({
      rpName: title,
      rpID: rp.id,
      userName: u.username,
      userDisplayName: u.name,
      userID: Buffer.from(u.id),
      attestationType: 'none',
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      excludeCredentials: q.pkByUser(u.id).map(p => ({ id: p.id, transports: transportsOf(p.transports) }))
    });
    res.json({ options: opts, id: keepChallenge({ challenge: opts.challenge, userId: u.id }) });
  });

  app.post('/api/passkey/register/verify', async (req, res) => {
    const u = userOf(req);
    const b = req.body || {};
    if (!u) return res.status(401).json({ error: 'Sign in first' });
    if (noPasskeys(req, res) || !rp) return;
    const c = takeChallenge(b.id);
    if (!c || c.userId !== u.id) return res.status(400).json({ error: 'That took too long - try again' });
    try {
      const v = await webauthn.verifyRegistrationResponse({
        response: b.response,
        expectedChallenge: c.challenge,
        expectedOrigin: rp.origin,
        expectedRPID: rp.id,
        requireUserVerification: true
      });
      if (!v.verified) throw new Error('not verified');
      const cr = v.registrationInfo.credential;
      const pkName = String(b.name || describe(req.get('user-agent'))).slice(0, 60);
      q.pkAdd(
        cr.id,
        u.id,
        Buffer.from(cr.publicKey).toString('base64'),
        cr.counter || 0,
        JSON.stringify(cr.transports || []),
        pkName,
        Date.now()
      );
      audit(req, 'passkey.added', {
        target: `“${pkName}” of ${u.name} (@${u.username})`,
        refType: 'passkey',
        refId: cr.id
      });
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: 'The passkey couldn’t be saved (' + (e as Error).message + ')' });
    }
  });

  // ---- signing in with one ----
  app.post('/api/passkey/login/options', async (req, res) => {
    if (noPasskeys(req, res) || !rp) return;
    if (tooMany('pk:' + req.ip, 30, 15 * 60e3))
      return res.status(429).json({ error: 'Too many tries - wait 15 minutes' });
    const opts = await webauthn.generateAuthenticationOptions({
      rpID: rp.id,
      userVerification: 'required',
      allowCredentials: []
    });
    res.json({
      options: opts,
      id: keepChallenge({ challenge: opts.challenge, kind: (req.body || {}).kind === 'admin' ? 'admin' : 'edit' })
    });
  });

  app.post('/api/passkey/login/verify', async (req, res) => {
    if (noPasskeys(req, res) || !rp) return;
    const b = req.body || {};
    const c = takeChallenge(b.id);
    if (!c) {
      audit(req, 'signin.failed', { target: 'passkey', detail: 'took too long (over 5 minutes) - nothing checked' });
      return res.status(400).json({ error: 'That took too long - try again' });
    }
    const pk = b.response && b.response.id ? q.pkById(String(b.response.id)) : undefined;
    const u = pk ? q.uById(pk.user_id) : undefined;
    if (!pk || !u) {
      // usually a passkey that was removed from the board but is still in someone's password manager
      audit(req, 'signin.failed', {
        target: 'unknown passkey',
        detail: 'a passkey the board doesn’t have (removed earlier, or from an unfinished setup)'
      });
      return res.status(401).json({
        error:
          'This passkey isn’t on the board any more (it was removed). Delete the old passkey for this site in your password manager, sign in with your password and code, then add a new passkey.',
        unknownCredential: b.response && b.response.id ? String(b.response.id).slice(0, 400) : null,
        rpId: rp.id
      });
    }
    try {
      const v = await webauthn.verifyAuthenticationResponse({
        response: b.response,
        expectedChallenge: c.challenge,
        expectedOrigin: rp.origin,
        expectedRPID: rp.id,
        requireUserVerification: true,
        credential: {
          id: pk.id,
          publicKey: new Uint8Array(Buffer.from(pk.public_key, 'base64')),
          counter: pk.counter,
          transports: transportsOf(pk.transports)
        }
      });
      if (!v.verified) throw new Error('not verified');
      q.pkUse(v.authenticationInfo.newCounter, Date.now(), pk.id);
    } catch (e) {
      const msg = (e as Error).message;
      console.warn(`Chalk Planner: passkey sign-in failed from ${req.ip}: ${msg}`);
      audit(req, 'signin.failed', {
        target: u.username,
        detail: 'passkey check failed: ' + msg,
        refType: 'person',
        refId: u.id
      });
      return res.status(401).json({ error: 'That passkey didn’t work' });
    }
    const kind = c.kind || 'edit';
    if (kind === 'admin' && u.role !== 'admin') return res.status(403).json({ error: 'This account isn’t an admin' });
    startSession(req, res, u, kind, 'passkey “' + (pk.name || 'passkey') + '”');
    if (kind === 'admin' && !sessionOf(req, 'edit')) startSession(req, res, u, 'edit');
    res.json({ ok: true, role: u.role, name: u.name });
  });

  // The phone/tablet couldn't produce a passkey at all (the board never saw one): log what the browser said,
  // so "it just says it can't be used" shows up in Activity with the real reason.
  app.post('/api/passkey/client-error', (req, res) => {
    if (tooMany('pkerr:' + req.ip, 10, 15 * 60e3)) return res.status(429).json({ error: 'Too many reports' });
    const b = req.body || {};
    // what the browser sent, without control characters
    const clip = (v: unknown, n: number) =>
      String(v || '')
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001f]/g, ' ')
        .slice(0, n);
    const stage = b.stage === 'create' ? 'adding a passkey' : 'passkey sign-in';
    audit(req, b.stage === 'create' ? 'passkey.add_failed' : 'signin.failed', {
      target: stage + ' (on the device)',
      detail: `${clip(b.name, 40) || 'Error'}: ${clip(b.message, 200) || 'no details'}${b.app ? ' · home-screen app' : ''} · board never received a passkey`
    });
    res.json({ ok: true });
  });
}
