/*
===============================================================================
 Family Chalk Planner | Server | Access | security.ts
===============================================================================
 Version:   0.13.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-06
 Updated:   2026-11-06

 Purpose:
     🛡 Security (admin console): things that need a look, each with what
     to do about it; the settings; and the activity log.

 Routes:
     GET    /api/security
     POST   /api/security/settings

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

import type { Ctx, SecCfg } from './access.ts';
import { DAY, SEC_DEFAULT } from './access.ts';
import type { AuditRow } from './store.ts';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------------------------------- //
// | Actions offered with an alert | //
// --------------------------------- //
interface Action {
  label: string;
  call: string;
  body: Record<string, unknown>;
  confirm?: string;
}
const A = (label: string, call: string, body: Record<string, unknown>, confirm?: string): Action => ({
  label,
  call,
  body,
  confirm
});
const days = (t: number) => Math.round((Date.now() - t) / DAY);

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------- //
// | The routes | //
// -------------- //
export function registerSecurity({ app, q, kv, rp, secCfg, audit, cleanup, proxySeen }: Ctx) {
  // --------------------------- //
  // | Things that need a look | //
  // --------------------------- //
  // Each with what it means and the fix: no passkeys, HTTPS missing, an     //
  // admin without a recent sign-in, quiet screens, many wrong passwords.    //
  function alerts() {
    const now = Date.now();
    const cfg = secCfg();
    const out: { level: string; kind: string; text: string; actions: Action[] }[] = [];
    if (!rp || !rp.origin.startsWith('https:'))
      out.push({
        level: 'warn',
        kind: 'setup',
        text: 'The board isn’t set up for HTTPS: no https:// public address in ⚙️ Board → On your network. Passwords and codes travel unencrypted on your network, and passkeys are off. Put the board behind a reverse proxy with HTTPS and enter its address there — see docs/install.md.',
        actions: []
      });
    const proxy = proxySeen();
    if (!process.env.TRUST_PROXY && proxy)
      out.push({
        level: 'info',
        kind: 'setup',
        text: `Requests reach the board through a proxy at ${proxy}. For tighter security, trust only that address (right now the board trusts forwarding information from any device on your local network). The board restarts for a few seconds.`,
        actions: [
          A(
            `Trust only ${proxy}`,
            '/api/board-settings',
            { values: { TRUST_PROXY: proxy } },
            `Trust only ${proxy} as the reverse proxy? The board restarts.`
          )
        ]
      });
    for (const d of q.dList())
      if (cfg.screenFlagDays > 0 && now - d.last_seen > cfg.screenFlagDays * DAY)
        out.push({
          level: 'warn',
          kind: 'screen',
          text:
            `Screen “${d.name}” (${d.agent}) hasn’t been seen for ${days(d.last_seen)} days.` +
            (cfg.screenRemoveDays > 0 ? ` It’s removed automatically after ${cfg.screenRemoveDays}.` : ''),
          actions: [A('Remove screen', '/api/devices/remove', { id: d.id }, `Remove “${d.name}”?`)]
        });
    for (const p of q.pkAll()) {
      const t = p.last_used || p.created;
      if (cfg.passkeyFlagDays > 0 && now - t > cfg.passkeyFlagDays * DAY)
        out.push({
          level: 'warn',
          kind: 'passkey',
          text: `Passkey “${p.name}” of ${p.uname} (@${p.username}) hasn’t been used for ${days(t)} days.`,
          actions: [A('Remove passkey', '/api/users/passkeys/remove', { id: p.id }, 'Remove this passkey?')]
        });
    }
    for (const u of q.uList()) {
      if (!u.totp_ok) {
        out.push({
          level: 'info',
          kind: 'person',
          text: `${u.name} (@${u.username}) hasn’t finished setting up${q.iForUser(u.id) ? ' (invite link still open)' : ''}.`,
          actions: [A('Remove', '/api/users/remove', { id: u.id }, `Remove ${u.name}?`)]
        });
        continue;
      }
      const last = u.last_login || u.created;
      if (cfg.personFlagDays > 0 && now - last > cfg.personFlagDays * DAY)
        out.push({
          level: 'warn',
          kind: 'person',
          text: `${u.name} (@${u.username}, ${u.role}) hasn’t signed in for ${days(last)} days.`,
          actions: [
            A('Sign out everywhere', '/api/users/signout', { id: u.id }),
            A('Remove', '/api/users/remove', { id: u.id }, `Remove ${u.name}?`)
          ]
        });
    }
    for (const f of q.aFails(now - DAY)) {
      if (f.n < 3) continue;
      const u = q.uByName(f.target);
      out.push({
        level: f.n >= 8 ? 'alert' : 'warn',
        kind: 'signin',
        text:
          `${f.n} failed sign-ins for “${f.target}” from ${f.ip} in the last 24 hours (last ${new Date(f.last).toLocaleString()}).` +
          (u ? '' : ' There’s no such account.'),
        actions: u
          ? [
              A('Sign out everywhere', '/api/users/signout', { id: u.id }),
              A(
                'Start over (new invite link)',
                '/api/users/reinvite',
                { id: u.id },
                `Clear ${u.name}’s password, authenticator and passkeys?`
              )
            ]
          : []
      });
    }
    return out;
  }

  // ------------------------------------------- //
  // | The activity log, with what can be done | //
  // ------------------------------------------- //
  // Log lines point at things that may still exist: offer what can be done  //
  function withActions(e: AuditRow) {
    const acts: Action[] = [];
    const ref = e.ref_id || '';
    if (e.ref_type === 'screen' && q.dById(ref))
      acts.push(A('Remove screen', '/api/devices/remove', { id: ref }, 'Remove this screen?'));
    if (e.ref_type === 'session' && q.sById(+ref))
      acts.push(A('End this sign-in', '/api/users/sessions/remove', { id: +ref }));
    if (e.ref_type === 'passkey' && q.pkById(ref))
      acts.push(A('Remove passkey', '/api/users/passkeys/remove', { id: ref }, 'Remove this passkey?'));
    if (
      e.ref_type === 'person' &&
      /^(signin\.failed|person\.role|password\.changed|authenticator\.changed)$/.test(e.event) &&
      q.uById(ref) &&
      q.sByUser(ref)
    )
      acts.push(A('Sign out everywhere', '/api/users/signout', { id: ref }));
    const { id, at, event, actor, target, detail, ip, agent } = e;
    return { id, at, event, actor, target, detail, ip, agent, actions: acts };
  }

  app.get('/api/security', (req, res) => {
    const limit = Math.min(1000, Math.max(20, +(req.query.limit || 0) || 200));
    res.json({ settings: secCfg(), defaults: SEC_DEFAULT, alerts: alerts(), log: q.aList(limit).map(withActions) });
  });

  app.post('/api/security/settings', (req, res) => {
    const b = req.body || {};
    const cur = secCfg();
    const out = {} as SecCfg;
    for (const k of Object.keys(SEC_DEFAULT) as (keyof SecCfg)[]) {
      const v = b[k] === undefined ? cur[k] : Math.round(+b[k]);
      out[k] = Number.isFinite(v) ? Math.min(3650, Math.max(0, v)) : cur[k];
    }
    if (out.signinIdleDays < 1) out.signinIdleDays = 1;
    if (out.signinMaxDays && out.signinMaxDays < out.signinIdleDays) out.signinMaxDays = out.signinIdleDays;
    if (out.logDays < 7) out.logDays = 7;
    if (out.screenRemoveDays && out.screenRemoveDays < out.screenFlagDays) out.screenRemoveDays = out.screenFlagDays;
    kv.set('security', out);
    const changed = (Object.keys(out) as (keyof SecCfg)[]).filter(k => out[k] !== cur[k]);
    audit(req, 'security.settings', {
      detail: changed.map(k => `${k} ${cur[k]} → ${out[k]}`).join(', ') || 'no change'
    });
    cleanup(); // the new rules apply right away
    res.json(out);
  });
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
