/*
===============================================================================
 Family Chalk Planner | Server | Access | people.ts
===============================================================================
 Version:   0.13.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-06
 Updated:   2026-11-06

 Purpose:
     People (admin console): invite, start over, change name or role, sign
     out everywhere, remove; and each person's sign-ins and passkeys, to
     end or remove one at a time (also "My account" → sign-ins).

 Routes:
     GET    /api/users
     POST   /api/users/invite
     POST   /api/users/reinvite
     POST   /api/users/update
     POST   /api/users/signout
     POST   /api/users/remove
     GET    /api/account/sessions
     POST   /api/account/sessions/remove
     GET    /api/users/:id
     POST   /api/users/sessions/remove
     POST   /api/users/passkeys/remove

 Used by:
     server/access/access.ts
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-06   joshua    Move access (screens, people, sign-in,
                        claude    passkeys, security) to TypeScript.
===============================================================================
*/

import type { Request } from 'express';
import type { Ctx } from './access.ts';
import { ADMIN_IDLE, ADMIN_MAX, C, DAY, INVITE_TTL } from './access.ts';
import { USERNAME } from './accounts.ts';
import { rid, sha } from './secrets.ts';
import type { SessionRow, User } from './store.ts';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------- //
// | People | //
// ---------- //
const USER_ROLES = ['editor', 'admin'];

export function registerPeople({ app, q, rp, secCfg, audit, clear, userOf, myKeys }: Ctx) {
  const me = (req: Request) => userOf(req)!; // the admin rank check already passed
  const publicOrigin = (req: Request) => (rp ? rp.origin : `${req.protocol}://${req.get('host')}`);
  function invite(req: Request, u: User) {
    q.iDelUser(u.id);
    const code = rid(18);
    q.iAdd(sha('invite:' + code), u.id, Date.now());
    return `${publicOrigin(req)}/join#${code}`;
  }
  const lastAdmin = (u: User) => u.role === 'admin' && u.totp_ok && q.uAdmins() <= 1;
  const who = (u: User) => `${u.name} (@${u.username})`;

  // ------------ //
  // | The list | //
  // ------------ //
  app.get('/api/users', (req, res) => {
    res.json({
      me: me(req).id,
      users: q.uList().map(u => ({
        ...u,
        passkeys: q.pkByUser(u.id).length,
        signedIn: q.sByUser(u.id),
        invited: !!q.iForUser(u.id)
      }))
    });
  });

  // -------------------- //
  // | Inviting someone | //
  // -------------------- //
  app.post('/api/users/invite', (req, res) => {
    const b = req.body || {};
    const username = String(b.username || '')
      .trim()
      .toLowerCase();
    if (!USERNAME.test(username))
      return res.status(400).json({ error: 'Username: 2-32 letters, numbers, dots, dashes or underscores' });
    if (q.uByName(username)) return res.status(400).json({ error: 'That username is taken' });
    const role = USER_ROLES.includes(b.role) ? b.role : 'editor';
    q.uAdd(
      rid(6),
      username,
      String(b.name || username)
        .trim()
        .slice(0, 40) || username,
      role,
      Date.now()
    );
    const nu = q.uByName(username)!;
    audit(req, 'person.invited', { target: who(nu), detail: `as ${role}`, refType: 'person', refId: nu.id });
    res.json({ link: invite(req, nu), expiresDays: INVITE_TTL / DAY });
  });

  // ----------------- //
  // | Starting over | //
  // ----------------- //
  // Forgot password / lost phone: start over with a new link                //
  app.post('/api/users/reinvite', (req, res) => {
    const u = q.uById(String((req.body || {}).id || ''));
    if (!u) return res.status(404).json({ error: 'Person not found' });
    if (u.id === me(req).id) return res.status(400).json({ error: 'Use “My account” to change your own sign-in' });
    if (lastAdmin(u)) return res.status(400).json({ error: 'Keep at least one admin' });
    q.uSetPw(null, u.id);
    q.uSetTotp(null, 0, u.id);
    q.pkDelUser(u.id);
    q.sDelUser(u.id);
    audit(req, 'person.reinvited', {
      target: who(u),
      detail: 'password, authenticator, passkeys and sign-ins cleared; new invite link',
      refType: 'person',
      refId: u.id
    });
    res.json({ link: invite(req, u), expiresDays: INVITE_TTL / DAY });
  });

  // ----------------- //
  // | Name and role | //
  // ----------------- //
  app.post('/api/users/update', (req, res) => {
    const b = req.body || {};
    const u = q.uById(String(b.id || ''));
    if (!u) return res.status(404).json({ error: 'Person not found' });
    const role = b.role === undefined ? u.role : USER_ROLES.includes(b.role) ? b.role : null;
    if (!role) return res.status(400).json({ error: 'Unknown role' });
    if (role !== 'admin' && lastAdmin(u)) return res.status(400).json({ error: 'Keep at least one admin' });
    q.uUpd(b.name === undefined ? u.name : String(b.name).trim().slice(0, 40) || u.name, role, u.id);
    if (role !== u.role) {
      audit(req, 'person.role', { target: who(u), detail: `${u.role} → ${role}`, refType: 'person', refId: u.id });
      if (role !== 'admin') q.sDelAdmin(u.id);
    }
    res.json({ ok: true });
  });

  // ----------------------- //
  // | Sign out everywhere | //
  // ----------------------- //
  // Lost tablet: end every sign-in for that person                          //
  app.post('/api/users/signout', (req, res) => {
    const u = q.uById(String((req.body || {}).id || ''));
    if (!u) return res.status(404).json({ error: 'Person not found' });
    q.sDelUser(u.id);
    audit(req, 'person.signed_out', { target: who(u), detail: 'every sign-in ended', refType: 'person', refId: u.id });
    if (u.id === me(req).id) {
      clear(req, res, C.user);
      clear(req, res, C.admin);
    }
    res.json({ ok: true });
  });

  // -------------------- //
  // | Removing someone | //
  // -------------------- //
  // The last admin can't be removed or made an editor.                      //
  app.post('/api/users/remove', (req, res) => {
    const u = q.uById(String((req.body || {}).id || ''));
    if (!u) return res.status(404).json({ error: 'Person not found' });
    if (lastAdmin(u)) return res.status(400).json({ error: 'Keep at least one admin' });
    q.sDelUser(u.id);
    q.pkDelUser(u.id);
    q.iDelUser(u.id);
    q.uDel(u.id);
    audit(req, 'person.removed', { target: who(u), detail: 'signed out everywhere, passkeys deleted' });
    res.json({ ok: true });
  });

  // ---------------------------------------- //
  // | Sign-ins and passkeys, one at a time | //
  // ---------------------------------------- //
  function expires(s: SessionRow) {
    if (s.kind !== 'edit') return Math.min(s.last_seen + ADMIN_IDLE, s.created + ADMIN_MAX);
    const c = secCfg();
    const idle = s.last_seen + c.signinIdleDays * DAY;
    return c.signinMaxDays > 0 ? Math.min(idle, s.created + c.signinMaxDays * DAY) : idle;
  }
  const sessView = (s: SessionRow, mine: string[]) => ({
    id: s.id,
    kind: s.kind,
    created: s.created,
    last_seen: s.last_seen,
    agent: s.agent,
    ip: s.ip,
    here: mine.includes(s.key_hash),
    expires: expires(s)
  });

  app.get('/api/account/sessions', (req, res) => {
    const u = userOf(req);
    if (!u) return res.status(401).json({ error: 'Sign in first' });
    const mine = myKeys(req);
    res.json({ sessions: q.sList(u.id).map(s => sessView(s, mine)) });
  });

  app.post('/api/account/sessions/remove', (req, res) => {
    const u = userOf(req);
    if (!u) return res.status(401).json({ error: 'Sign in first' });
    const s = q.sById(+(req.body || {}).id || 0);
    if (s && s.user_id === u.id) {
      q.sDelId(s.id);
      audit(req, 'session.ended', { target: `${who(u)} on ${s.agent} (${s.ip})` });
    }
    res.json({ ok: true });
  });

  app.get('/api/users/:id', (req, res) => {
    const u = q.uById(String(req.params.id));
    if (!u) return res.status(404).json({ error: 'Person not found' });
    const mine = myKeys(req);
    res.json({ sessions: q.sList(u.id).map(s => sessView(s, mine)), passkeys: q.pkByUser(u.id) });
  });

  app.post('/api/users/sessions/remove', (req, res) => {
    const s = q.sById(+(req.body || {}).id || 0);
    if (!s) return res.status(404).json({ error: 'That sign-in already ended' });
    const u = q.uById(s.user_id);
    q.sDelId(s.id);
    audit(req, 'session.ended', {
      target: `${u ? who(u) : 'someone'} on ${s.agent} (${s.ip})`,
      refType: 'person',
      refId: s.user_id
    });
    res.json({ ok: true });
  });

  app.post('/api/users/passkeys/remove', (req, res) => {
    const pk = q.pkById(String((req.body || {}).id || ''));
    if (!pk) return res.status(404).json({ error: 'That passkey is already gone' });
    const u = q.uById(pk.user_id);
    q.pkDelAny(pk.id);
    audit(req, 'passkey.removed', {
      target: `“${pk.name}” of ${u ? who(u) : 'someone'}`,
      refType: 'person',
      refId: pk.user_id
    });
    res.json({ ok: true });
  });
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
