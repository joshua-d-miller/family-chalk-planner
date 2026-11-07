// The health check update.sh and Docker use, and "Update now" in the admin console (which only asks the
// root update service to run; the board never updates itself).
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { client, makeAdmin, startServer } from './helpers.ts';
import pkg from '../package.json' with { type: 'json' };

const PORT = 3984;
const base = `http://127.0.0.1:${PORT}`;
let board: Awaited<ReturnType<typeof startServer>>;
let ed: ReturnType<typeof client>;

test.before(async () => {
  board = await startServer(PORT, { UPDATER: 'systemd' });
  ed = client(base, (await makeAdmin(base, board.data)).cookie);
});
test.after(async () => {
  await board.stop();
  fs.rmSync(board.data, { recursive: true, force: true });
});

test('the health check: no sign-in needed; says the version and that the database is up to date', async () => {
  const h = await (await fetch(base + '/api/health')).json();
  assert.deepEqual(h, { ok: true, version: 'v' + pkg.version, db: 1 });
});

test('Update now: admins only; it leaves a request for the update service and shows how it went', async () => {
  assert.equal((await fetch(base + '/api/updates')).status, 401);
  let u = await (await ed.api('/api/updates')).json();
  assert.deepEqual([u.can, u.requested, u.status], [true, false, null]);
  fs.writeFileSync(
    path.join(board.data, 'update-status.json'),
    JSON.stringify({ state: 'available', message: 'v9.9.9 is available', available: 'v9.9.9' })
  );
  assert.equal((await ed.post('/api/updates/run', {})).status, 200);
  assert.ok(fs.existsSync(path.join(board.data, 'update-request')));
  u = await (await ed.api('/api/updates')).json();
  assert.equal(u.requested, true);
  assert.equal(u.status.available, 'v9.9.9');
  const log = await (await ed.api('/api/security')).json();
  assert.ok(log.log.some(e => e.event === 'update.requested'));
});

test('without the update service (Docker): says how to update instead', async () => {
  await board.stop();
  board = await startServer(PORT, {}, board.data);
  const u = await (await ed.api('/api/updates')).json();
  assert.equal(u.can, false);
  const r = await ed.post('/api/updates/run', {});
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /Docker/);
});
