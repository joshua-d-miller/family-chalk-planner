/*
===============================================================================
 Family Chalk Planner | Tests | immich.test.ts
===============================================================================
 Version:   0.13.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Updated:   2026-11-07

 Purpose:
     Photos from Immich (from Colby Way's board): picked by an admin in
     the console, synced in the background, faces from Immich kept for
     framing, WebP previews taken from Immich only, and an Immich share
     link.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    Immich photos, slideshow extras, a filled-in
                        colby     today, and the frame's thickness.
                        claude
===============================================================================
*/

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { client, makeAdmin, startServer } from './helpers.ts';
import * as mockImmich from './mock-immich.ts';

const PORT = 3986,
  IM = 5986;
const base = `http://127.0.0.1:${PORT}`;
const imUrl = `http://127.0.0.1:${IM}`;
let board: Awaited<ReturnType<typeof startServer>>;
let im: Awaited<ReturnType<typeof mockImmich.start>>;
let ed: ReturnType<typeof client>;

async function synced(c = ed) {
  await c.post('/api/photos/sync', {});
  return (await c.api('/api/photos')).json();
}

test.before(async () => {
  im = await mockImmich.start(IM);
  board = await startServer(PORT);
  assert.ok(board.up, board.output());
  ed = client(base, (await makeAdmin(base, board.data)).cookie);
});
test.after(async () => {
  await board.stop();
  im.close();
  fs.rmSync(board.data, { recursive: true, force: true });
});

test('the console lists the albums, owned and shared, and says what’s wrong with a bad key', async () => {
  let r = await ed.post('/api/board-settings/immich-albums', { url: imUrl + '/photos', apiKey: 'KEY' });
  assert.equal(r.status, 200);
  assert.deepEqual(
    (await r.json()).albums.map(a => [a.name, a.shared]),
    [
      ['Kids', false],
      ['Trip', false],
      ['Grandma', true]
    ]
  );
  r = await ed.post('/api/board-settings/immich-albums', { url: imUrl, apiKey: 'nope' });
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /didn’t accept the API key/);
  r = await fetch(base + '/api/board-settings/immich-albums', { method: 'POST', headers: { 'X-Chalk': '1' } });
  assert.equal(r.status, 401, 'admins only');
});

test('an album by name: photos (no videos), Immich’s faces, WebP previews', async () => {
  const s = await ed.post('/api/board-settings', {
    values: { IMMICH_URL: imUrl, IMMICH_API_KEY: 'KEY', IMMICH_ALBUM: 'kids' }
  });
  assert.equal(s.status, 200);
  await board.exited; // saving restarts the board (the service manager starts it again; here, the test)
  board = await startServer(PORT, {}, board.data);
  assert.ok(board.up, board.output());
  const p = await synced();
  assert.equal(p.kind, 'immich');
  assert.deepEqual(
    p.photos.map(x => x.w + 'x' + x.h),
    ['4000x3000', '4000x3000']
  );
  const withFace = p.photos.find(x => x.faces);
  assert.deepEqual(withFace.faces, [[0.25, 0.2, 0.1, 0.1667]]);
  const img = await ed.api('/api/photos/img/' + p.photos[0].id);
  assert.equal(img.headers.get('content-type'), 'image/webp');
  assert.ok(im.calls.some(c => c.startsWith('GET /api/assets/') && !c.endsWith('?key')));
});

test('Favorites by default; an Immich share link needs no key', async () => {
  await ed.post('/api/board-settings', { values: { IMMICH_ALBUM: '' } });
  await board.exited;
  board = await startServer(PORT, {}, board.data);
  let p = await synced();
  assert.equal(p.photos.length, 1, 'Favorites');
  await ed.post('/api/board-settings', {
    values: { IMMICH_URL: '', IMMICH_API_KEY: '', PHOTO_ALBUM_URL: `${imUrl}/share/${mockImmich.SHARE}` }
  });
  await board.exited;
  board = await startServer(PORT, {}, board.data);
  p = await synced();
  assert.equal(p.kind, 'immich-share');
  assert.equal(p.photos.length, 1, 'the trashed one is left out');
  assert.ok(im.calls.includes('GET /api/shared-links/me?key'));
  assert.ok(fs.readdirSync(path.join(board.data, 'photo-cache')).length >= 1);
});

test('the frame’s thickness and the "filled in" today style', async () => {
  const f = await (await ed.post('/api/frame', { pad: 300 })).json();
  assert.equal(f.boardPad, 80);
  assert.equal((await (await ed.api('/api/meta?ym=2026-11')).json()).boardPad, 80);
  assert.equal((await ed.post('/api/theme', { p: 'classic', o: { todayS: 'bg' } })).status, 200);
  assert.equal((await (await ed.api('/api/theme')).json()).o.todayS, 'bg');
});

test('the slideshow extras are saved with the photo settings', async () => {
  const r = await (await ed.post('/api/photos/settings', { showEvents: true, showTemp: true, sidePanel: true })).json();
  assert.deepEqual([r.showEvents, r.showTemp, r.showReminders, r.sidePanel, r.night], [true, true, false, true, true]);
});
