/*
===============================================================================
 Family Chalk Planner | Tests | home-signin.test.ts
===============================================================================
 Version:   0.13.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Updated:   2026-11-07

 Purpose:
     Home-network sign-in (from Colby Way's board): off unless an admin
     turns it on; then the board (not the admin console) takes just a
     password, only from a home address with the board opened by IP.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    Home-network sign-in: just a password for
                        colby     the board at home, off unless turned on.
                        claude
===============================================================================
*/

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import http from 'node:http';
import { client, makeAdmin, startServer } from './helpers.ts';

const PORT = 3985;
const base = `http://127.0.0.1:${PORT}`;
let board: Awaited<ReturnType<typeof startServer>>;
let adm: Awaited<ReturnType<typeof makeAdmin>>;

// sign in, as a browser that opened the board at `host`
function login(body: Record<string, unknown>, host = `127.0.0.1:${PORT}`): Promise<{ status: number; json: any }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const r = http.request(
      {
        host: '127.0.0.1',
        port: PORT,
        path: '/api/account/login',
        method: 'POST',
        headers: {
          Host: host,
          'Content-Type': 'application/json',
          'X-Chalk': '1',
          'Content-Length': Buffer.byteLength(data)
        }
      },
      res => {
        let t = '';
        res.on('data', d => (t += d));
        res.on('end', () => resolve({ status: res.statusCode || 0, json: JSON.parse(t || '{}') }));
      }
    );
    r.on('error', reject);
    r.end(data);
  });
}
const who = async () => (await fetch(base + '/api/whoami')).json();

test.before(async () => {
  board = await startServer(PORT);
  adm = await makeAdmin(base, board.data);
});
test.after(async () => {
  await board.stop();
  fs.rmSync(board.data, { recursive: true, force: true });
});

test('off by default: the code is still needed', async () => {
  assert.equal((await who()).homeSignin, false);
  const r = await login({ username: 'admin', password: adm.password, kind: 'edit' });
  assert.equal(r.status, 401);
  assert.match(r.json.error, /code/);
});

test('turned on: a password is enough for the board at home, by IP; never for the console or by name', async () => {
  const ed = client(base, adm.cookie);
  assert.equal((await ed.post('/api/board-settings', { values: { HOME_SIGNIN: 'on' } })).status, 200);
  await board.exited;
  board = await startServer(PORT, {}, board.data);
  assert.equal((await who()).homeSignin, true);
  let r = await login({ username: 'admin', password: adm.password, kind: 'edit' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  r = await login({ username: 'admin', password: 'wrong password!', kind: 'edit' });
  assert.equal(r.status, 401);
  assert.equal(r.json.error, 'That username or password didn’t work');
  r = await login({ username: 'admin', password: adm.password, kind: 'admin' });
  assert.equal(r.status, 401, 'the admin console always asks for the code');
  r = await login({ username: 'admin', password: adm.password, kind: 'edit' }, 'board.example.com');
  assert.equal(r.status, 401, 'opened by name (a reverse proxy): the code is needed');
  r = await login({ username: 'admin', password: adm.password, kind: 'edit' }, `localhost:${PORT}`);
  assert.equal(r.status, 200);
  const log = await (await ed.api('/api/security')).json();
  assert.ok(log.log.some(e => e.event === 'signin' && /password \(home network\)/.test(e.detail)));
});
