/*
===============================================================================
 Family Chalk Planner | Tests | homeassistant.test.ts
===============================================================================
 Version:   1.0.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-14
 Updated:   2026-11-14

 Purpose:
     The board as the Home Assistant app, against a pretend Home Assistant
     (test/mock-homeassistant.ts): people come from Home Assistant's
     Ingress (its admins are the board's admins; everyone else has the
     role set in the console, or the default), nobody else can claim to be
     them, the board's own sign-ins are off, and pages are served from the
     ingress path and may be framed by Home Assistant only.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.0.0     2026-11-14   joshua    New file.
                        claude
===============================================================================
*/

import test from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as mockHa from './mock-homeassistant.ts';

const PORT = 3976,
  HA = 5976;
const base = `http://127.0.0.1:${PORT}`;
const INGRESS = '/api/hassio_ingress/abcdefghijklmnop';
let board: ChildProcess, ha: Awaited<ReturnType<typeof mockHa.start>>, data: string;

test.before(async () => {
  ha = await mockHa.start(HA);
  data = fs.mkdtempSync(path.join(os.tmpdir(), 'fcp-ha-'));
  board = spawn(process.execPath, [path.join(import.meta.dirname, '..', 'server', 'chalkboard.js')], {
    env: {
      ...process.env,
      PORT: String(PORT),
      BIND: '127.0.0.1',
      DATA_DIR: data,
      TIMEZONE: 'America/New_York',
      HOLIDAYS: 'none',
      SUPERVISOR_TOKEN: 'test',
      UPDATER: 'homeassistant',
      HA_API_URL: `http://127.0.0.1:${HA}/api`,
      HA_WS_URL: `ws://127.0.0.1:${HA}/api/websocket`,
      HA_INGRESS_FROM: '127.0.0.1'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let log = '';
  board.stdout!.on('data', d => (log += d));
  board.stderr!.on('data', d => (log += d));
  board.on('exit', c => c && c !== 143 && console.error(log));
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + '/api/whoami')).ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error('the board did not start:\n' + log);
});
test.after(() => {
  board?.kill();
  ha?.server.close();
});

// a request as Home Assistant's Ingress sends it, for one of its people
const as =
  (id: string | null, name = 'Someone') =>
  (p: string, init: RequestInit = {}) =>
    fetch(base + p, {
      ...init,
      headers: {
        ...(id ? { 'X-Ingress-Path': INGRESS, 'X-Remote-User-Id': id, 'X-Remote-User-Display-Name': name } : {}),
        ...(init.body ? { 'Content-Type': 'application/json', 'X-Chalk': '1' } : {}),
        ...(init.headers || {})
      }
    });
const admin = as('u-admin', 'Alex');
const kid = as('u-kid', 'Sam');
const post = (who: ReturnType<typeof as>, p: string, body: unknown) =>
  who(p, { method: 'POST', body: JSON.stringify(body) });

test('Home Assistant admins are the board’s admins; others get the default (family)', async () => {
  const a = await (await admin('/api/whoami')).json();
  assert.equal(a.admin, true);
  assert.deepEqual(a.ha, { inside: true, person: { name: 'Alex', role: 'admin' } });
  assert.equal(a.firstRun, false, 'no setup code: Home Assistant already has an admin');
  const k = await (await kid('/api/whoami')).json();
  assert.equal(k.rank, 2, 'family');
  assert.equal(k.admin, false);
  assert.equal((await kid('/api/board-settings')).status, 403, 'not the console');
  assert.equal((await admin('/api/board-settings')).status, 200);
});

test('roles are set in the console; the default too', async () => {
  const ppl = await (await admin('/api/ha/people')).json();
  assert.deepEqual(
    ppl.people.map((p: { name: string; role: string | null }) => [p.name, p.role]),
    [
      ['Alex', 'admin'],
      ['Sam', null]
    ],
    'Home Assistant’s own system users are left out'
  );
  assert.equal(ppl.default, 'family');
  assert.equal((await post(admin, '/api/ha/people', { id: 'u-kid', role: 'view' })).status, 200);
  assert.equal((await (await kid('/api/whoami')).json()).rank, 1);
  assert.equal((await post(kid, '/api/events', { title: 'x', date: '2026-10-20', allDay: true })).status, 403);
  await post(admin, '/api/ha/people', { id: 'u-kid', role: null });
  assert.equal((await post(admin, '/api/ha/people', { default: 'editor' })).status, 200);
  assert.equal((await (await kid('/api/whoami')).json()).rank, 3, 'the new default');
  assert.equal((await post(admin, '/api/ha/people', { default: 'admin' })).status, 400, 'admins are Home Assistant’s');
  assert.equal((await post(kid, '/api/ha/people', { id: 'u-kid', role: 'admin' })).status, 403, 'only admins');
  await post(admin, '/api/ha/people', { default: 'family' });
});

test('nobody else can claim to be someone from Home Assistant', async () => {
  // the same headers, but not through Home Assistant's proxy address: a visitor on port 3002
  const r = await fetch(`http://localhost:${PORT}/api/whoami`, {
    headers: { 'X-Ingress-Path': INGRESS, 'X-Remote-User-Id': 'u-admin' }
  });
  // (localhost is ::1 or 127.0.0.1; only the latter is "Home Assistant" here)
  const w = await r.json();
  if (w.ha?.inside) assert.ok(true, 'localhost resolved to 127.0.0.1');
  else assert.equal(w.admin, false);
  const bad = await (
    await fetch(base + '/api/whoami', {
      headers: { 'X-Ingress-Path': '/somewhere/else', 'X-Remote-User-Id': 'u-admin' }
    })
  ).json();
  assert.equal(bad.admin, false, 'not an ingress path');
  assert.equal(bad.ha.inside, false);
  const nobody = await (await as(null)('/api/whoami')).json();
  assert.equal(nobody.rank, 0);
});

test('the board’s own sign-ins are off in the app', async () => {
  const r = await post(as(null), '/api/account/login', { username: 'x', password: 'y', code: '123456' });
  assert.equal(r.status, 403);
  assert.match((await r.json()).error, /Home Assistant/);
  assert.equal((await post(admin, '/api/users/invite', { username: 'z', name: 'Z', role: 'editor' })).status, 403);
});

test('pages inside Home Assistant: its ingress path as the base, framed by Home Assistant only', async () => {
  const page = await admin('/admin');
  assert.match(await page.text(), new RegExp(`<base href="${INGRESS}/">`));
  assert.equal(page.headers.get('x-frame-options'), null);
  assert.match(String(page.headers.get('content-security-policy')), /frame-ancestors 'self'/);
  const outside = await fetch(base + '/admin');
  assert.match(await outside.text(), /<base href="\/">/);
  assert.equal(outside.headers.get('x-frame-options'), 'DENY');
});
