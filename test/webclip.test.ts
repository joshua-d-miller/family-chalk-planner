/*
===============================================================================
 Family Chalk Planner | Tests | webclip.test.ts
===============================================================================
 Version:   0.17.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-14
 Updated:   2026-11-14

 Purpose:
     Pictures' "From the web": public domain only, a search asked twice
     goes to Openverse once, a placed picture is kept on the board, and a
     busy Openverse gets a polite note (never an error on the screen).
     Runs against test/mock-openverse.ts.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.17.0    2026-11-14   joshua    New file.
                        claude
===============================================================================
*/

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { client, makeAdmin, startServer } from './helpers.ts';
import * as mock from './mock-openverse.ts';

const PORT = 3989;
const MOCK = 3990;
const base = `http://127.0.0.1:${PORT}`;
let board: Awaited<ReturnType<typeof startServer>>;
let ov: Awaited<ReturnType<typeof mock.start>>;
let ed: ReturnType<typeof client>, fam: ReturnType<typeof client>;

async function screen(admin: ReturnType<typeof client>, role: string) {
  const r = await fetch(base + '/api/pair/start', { method: 'POST', headers: { 'X-Chalk': '1' } });
  const pairCookie = (r.headers.get('set-cookie') || '').split(';')[0];
  const { code } = await r.json();
  assert.equal((await admin.post('/api/devices/approve', { code, name: role, role })).status, 200);
  const s = await fetch(base + '/api/pair/status', { headers: { cookie: pairCookie } });
  return client(base, s.headers.getSetCookie()[0].split(';')[0]);
}
type Web = { found: { id: string; title: string }[]; note?: string };

test.before(async () => {
  ov = await mock.start(MOCK);
  board = await startServer(PORT, { OPENVERSE_URL: `http://127.0.0.1:${MOCK}` });
  assert.ok(board.up, board.output());
  ed = client(base, (await makeAdmin(base, board.data)).cookie);
  fam = await screen(ed, 'family');
});
test.after(async () => {
  await board.stop();
  ov.close();
  fs.rmSync(board.data, { recursive: true, force: true });
});

test('from the web: public domain only, illustrations, asked once', async () => {
  const r = (await (await fam.api('/api/clip/web?q=Kite')).json()) as Web;
  assert.deepEqual(
    r.found.map(f => f.id),
    [mock.KITE, mock.KITE2],
    'the CC BY-SA one is left out'
  );
  const asked = ov.calls.filter(c => c.startsWith('/images/?'));
  assert.equal(asked.length, 1);
  const q = new URLSearchParams(asked[0].split('?')[1]);
  assert.equal(q.get('license'), 'cc0,pdm');
  assert.equal(q.get('category'), 'illustration');
  // the same search again: from the board, not Openverse
  await fam.api('/api/clip/web?q=kite');
  assert.equal(ov.calls.filter(c => c.startsWith('/images/?')).length, 1);
  assert.deepEqual(((await (await fam.api('/api/clip/web?q=')).json()) as Web).found, []);
});

test('thumbnails come through the board, and are kept', async () => {
  const t = await fam.api(`/api/clip/web/${mock.KITE}/thumb`);
  assert.equal(t.status, 200);
  assert.equal(t.headers.get('content-type'), 'image/png');
  await fam.api(`/api/clip/web/${mock.KITE}/thumb`);
  assert.equal(ov.calls.filter(c => c === `/images/${mock.KITE}/thumb/`).length, 1);
  assert.equal((await fam.api('/api/clip/web/not-an-id/thumb')).status, 404);
});

test('placing one: a family screen keeps a copy on the board; never one that isn’t public domain', async () => {
  const r = await fam.post('/api/clip/web/keep', { id: mock.KITE });
  assert.equal(r.status, 200);
  const { src } = (await r.json()) as { src: string };
  assert.match(src, /^\/api\/media\/[a-z0-9]{16}\.png$/);
  const img = await fam.api(src);
  assert.equal(img.status, 200);
  assert.deepEqual(Buffer.from(await img.arrayBuffer()), mock.PNG);
  assert.equal((await fam.post('/api/clip/web/keep', { id: mock.NOT_PD })).status, 400);
  assert.equal((await fam.post('/api/clip/web/keep', { id: '../etc' })).status, 400);
});

test('a busy Openverse: a note, and the board waits before asking again', async () => {
  const r = (await (await ed.api('/api/clip/web?q=busy')).json()) as Web;
  assert.deepEqual(r.found, []);
  assert.match(r.note || '', /busy/);
  const before = ov.calls.length;
  const again = (await (await ed.api('/api/clip/web?q=something-else')).json()) as Web;
  assert.match(again.note || '', /busy/);
  assert.equal(ov.calls.length, before, 'nothing sent while Openverse is busy');
});
