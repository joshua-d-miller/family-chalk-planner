/*
===============================================================================
 Family Chalk Planner | Tests | immich.test.ts
===============================================================================
 Version:   1.1.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Updated:   2026-11-17

 Purpose:
     Photos from Immich (from Colby Way's board): picked by an admin in
     the console, synced in the background, faces from Immich kept for
     framing, WebP previews taken from Immich only, and an Immich share
     link. Which photos (all, picked in the console, or a few at random
     each day), and a big album where only the last few shown are kept.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    Immich photos, slideshow extras, a filled-in
                        colby     today, and the frame's thickness.
                        claude

 1.1.0    2026-11-17   joshua    Which photos, a big album with a few copies,
                        claude    and the console's photo picker.
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
      ['Big', false],
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

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------------------------------------------- //
// | A big album: which photos, and a few copies | //
// ----------------------------------------------- //
async function restartWith(values: Record<string, string>) {
  assert.equal((await ed.post('/api/board-settings', { values })).status, 200);
  await board.exited;
  board = await startServer(PORT, {}, board.data);
  assert.ok(board.up, board.output());
}
const copies = () => fs.readdirSync(path.join(board.data, 'photo-cache')).filter(f => f.endsWith('.jpg')).length;

test('a big album keeps only the last few photos shown, and fetches the rest when asked', async () => {
  await restartWith({
    PHOTO_ALBUM_URL: '',
    IMMICH_URL: imUrl,
    IMMICH_API_KEY: 'KEY',
    IMMICH_ALBUM: 'big',
    PHOTO_KEEP: 'few',
    PHOTO_KEEP_COUNT: '3'
  });
  const p = await synced();
  assert.equal(p.photos.length, 20, 'every photo is listed');
  assert.equal(copies(), 0, 'none copied yet');
  for (const ph of p.photos.slice(0, 6)) {
    const img = await ed.api('/api/photos/img/' + ph.id);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('cache-control'), 'public, max-age=86400');
  }
  assert.equal(copies(), 3, 'only the last 3 shown are kept');
  assert.equal((await ed.api('/api/photos/img/im_notinthealbum')).status, 404);
});

test('a few at random each day: the same few all day', async () => {
  await restartWith({ PHOTO_PICK: 'random', PHOTO_RANDOM_COUNT: '5' });
  const a = await synced();
  assert.equal(a.photos.length, 5);
  const b = await synced();
  assert.deepEqual(
    b.photos.map(x => x.id),
    a.photos.map(x => x.id)
  );
});

test('photos picked in the console: all of them until some are picked', async () => {
  await restartWith({ PHOTO_PICK: 'picked', PHOTO_KEEP: 'all' });
  assert.equal((await synced()).photos.length, 20, 'nothing picked yet: all of them');
  const c = await (await ed.api('/api/board-settings/photo-choices')).json();
  assert.equal(c.photos.length, 20);
  assert.deepEqual(c.picked, []);
  const thumb = await ed.api('/api/board-settings/photo-thumb/' + c.photos[0].id);
  assert.equal(thumb.status, 200);
  assert.equal(thumb.headers.get('content-type'), 'image/jpeg', 'the small picture');
  const ids = [c.photos[0].id, c.photos[3].id];
  const r = await (await ed.post('/api/board-settings/photo-picked', { ids })).json();
  assert.equal(r.photos, 2);
  const p = await (await ed.api('/api/photos')).json();
  assert.deepEqual(p.photos.map(x => x.id).sort(), [...ids].sort());
  assert.equal(copies(), 2, 'copies of just the picked ones');
  assert.equal((await ed.post('/api/board-settings/photo-picked', { ids: ['../x'] })).status, 400);
  assert.equal((await fetch(base + '/api/board-settings/photo-choices')).status, 401, 'admins only');
});
