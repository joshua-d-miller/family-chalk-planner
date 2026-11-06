// Screens: pairing (the screen shows a code, an admin enters it in the console), renaming, changing what a
// screen may do, removing one.
import type { Ctx } from './access.ts';
import { PAIR_TTL, KEEP, C } from './access.ts';
import { describe, parseCookies } from './http.ts';
import { fmtCode, normCode, randCode, randomKey, rid, sha } from './secrets.ts';

const DEVICE_ROLES = ['view', 'family']; // and 'kid:<person>'
const roleOk = (r: unknown): r is string =>
  typeof r === 'string' && (DEVICE_ROLES.includes(r) || /^kid:[a-z0-9]{1,16}$/.test(r));

export function registerScreens({ app, q, broadcast, audit, cookie, clear, deviceOf, tooMany }: Ctx) {
  app.post('/api/pair/start', (req, res) => {
    if (deviceOf(req)) return res.status(400).json({ error: 'This screen is already paired' });
    q.pPurge(Date.now() - PAIR_TTL);
    if (tooMany('start:' + req.ip, 10, 10 * 60e3) || q.pCount() > 30)
      return res.status(429).json({ error: 'Too many pairing requests - wait a few minutes' });
    const code = randCode(8);
    const secret = rid(24);
    q.pAdd(rid(6), sha('pair:' + code), sha(secret), Date.now(), describe(req.get('user-agent')), req.ip || '');
    cookie(req, res, C.pair, secret, PAIR_TTL, { path: '/api/pair', same: 'Strict' });
    broadcast('devices', {});
    audit(req, 'screen.waiting', { target: describe(req.get('user-agent')), detail: 'showing a pairing code' });
    res.json({ code: fmtCode(code), expires: Date.now() + PAIR_TTL });
  });

  app.get('/api/pair/status', (req, res) => {
    const secret = parseCookies(req.get('cookie'))[C.pair];
    const p = secret ? q.pBySecret(sha(secret)) : undefined;
    if (!p || Date.now() - p.created > PAIR_TTL) return res.json({ state: 'expired' });
    if (!p.device_key) return res.json({ state: 'waiting' });
    q.pDel(p.id); // the key is handed over exactly once
    cookie(req, res, C.device, p.device_key, KEEP);
    clear(req, res, C.pair);
    res.json({ state: 'paired', role: p.role });
  });

  app.get('/api/devices', (_req, res) => {
    q.pPurge(Date.now() - PAIR_TTL);
    res.json({ devices: q.dList(), waiting: q.pList().map(p => ({ agent: p.agent, created: p.created })) });
  });

  app.post('/api/devices/approve', (req, res) => {
    const b = req.body || {};
    const role = roleOk(b.role) ? b.role : null;
    if (!role) return res.status(400).json({ error: 'Pick what this screen may do' });
    if (tooMany('approve:' + req.ip, 20, 10 * 60e3))
      return res.status(429).json({ error: 'Too many tries - wait a few minutes' });
    const p = q.pByCode(sha('pair:' + normCode(b.code)));
    if (!p || p.device_key || Date.now() - p.created > PAIR_TTL)
      return res.status(404).json({
        error: 'No screen is waiting with that code. Check the code on its screen (it changes every 15 minutes).'
      });
    const key = randomKey();
    const id = rid(6);
    const name =
      String(b.name || p.agent)
        .trim()
        .slice(0, 60) || p.agent;
    q.dAdd(id, sha(key), name, role, Date.now(), Date.now(), p.agent, p.ip);
    q.pApprove(key, role, p.id);
    broadcast('devices', {});
    audit(req, 'screen.paired', {
      target: `${name} (${p.agent})`,
      detail: `as ${role} · from ${p.ip}`,
      refType: 'screen',
      refId: id
    });
    res.json({ ok: true, id });
  });

  app.post('/api/devices/update', (req, res) => {
    const b = req.body || {};
    const d = q.dById(String(b.id || ''));
    if (!d) return res.status(404).json({ error: 'Screen not found' });
    const role = b.role === undefined ? d.role : roleOk(b.role) ? b.role : null;
    if (!role) return res.status(400).json({ error: 'Unknown role' });
    q.dUpd(b.name === undefined ? d.name : String(b.name).trim().slice(0, 60) || d.name, role, d.id);
    broadcast('devices', {});
    if (role !== d.role)
      audit(req, 'screen.changed', {
        target: `${d.name} (${d.agent})`,
        detail: `${d.role} → ${role}`,
        refType: 'screen',
        refId: d.id
      });
    res.json({ ok: true });
  });

  app.post('/api/devices/remove', (req, res) => {
    const d = q.dById(String((req.body || {}).id || ''));
    if (!d) return res.status(404).json({ error: 'Screen not found' });
    q.dDel(d.id);
    broadcast('devices', {});
    audit(req, 'screen.removed', { target: `${d.name} (${d.agent})` });
    res.json({ ok: true });
  });
}
