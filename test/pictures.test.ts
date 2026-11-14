/*
===============================================================================
 Family Chalk Planner | Tests | pictures.test.ts
===============================================================================
 Version:   0.17.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-14
 Updated:   2026-11-14

 Purpose:
     Pictures: one search through every picture (a turkey is the bird, not
     a flag), every name in every pack is a picture the board has, packs
     in season come first, Favorites pinned from a family screen (not the
     wall), and no weapons among the chalk drawings.
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
import { loadPacks, packOrder } from '../server/packs.ts';

const PORT = 3991;
const base = `http://127.0.0.1:${PORT}`;
let board: Awaited<ReturnType<typeof startServer>>;
let ed: ReturnType<typeof client>, fam: ReturnType<typeof client>, wall: ReturnType<typeof client>;

async function screen(admin: ReturnType<typeof client>, role: string) {
  const r = await fetch(base + '/api/pair/start', { method: 'POST', headers: { 'X-Chalk': '1' } });
  const pairCookie = (r.headers.get('set-cookie') || '').split(';')[0];
  const { code } = await r.json();
  assert.equal((await admin.post('/api/devices/approve', { code, name: role, role })).status, 200);
  const s = await fetch(base + '/api/pair/status', { headers: { cookie: pairCookie } });
  return client(base, s.headers.getSetCookie()[0].split(';')[0]);
}
type Found = { subject: string; id: string; looks: string[] };
const find = async (q: string) =>
  ((await (await ed.api('/api/clip/search?q=' + encodeURIComponent(q))).json()) as { found: Found[] }).found;

test.before(async () => {
  board = await startServer(PORT);
  assert.ok(board.up, board.output());
  const adm = await makeAdmin(base, board.data);
  ed = client(base, adm.cookie);
  fam = await screen(ed, 'family');
  wall = await screen(ed, 'view');
  // the other styles unpack in the background: wait for them (a minute at most)
  for (let i = 0; i < 120; i++) {
    const st = (await (await ed.api('/api/clip/styles')).json()) as { count: number }[];
    if (st.length && st.every(s => s.count)) break;
    await new Promise(r => setTimeout(r, 500));
  }
});
test.after(async () => {
  await board.stop();
  fs.rmSync(board.data, { recursive: true, force: true });
});

test('search: every picture at once, the bird before the flag, each subject once', async () => {
  const turkey = await find('turkey');
  assert.equal(turkey[0].subject, 'turkey', 'the bird first');
  assert.ok(turkey[0].looks.length >= 3, 'with its other looks');
  assert.ok(!turkey[0].looks.includes('se-turkey'), 'not Streamline’s flag, which it names "turkey"');
  const flag = turkey.findIndex(f => f.subject.includes('flag'));
  assert.ok(flag === -1 || flag > 1, 'a flag only after the pictures of a turkey');
  assert.equal(new Set(turkey.map(f => f.subject)).size, turkey.length, 'each subject once');
  // words from the emoji's tags: a jack-o'-lantern is a pumpkin
  assert.ok((await find('pumpkin')).some(f => f.subject === 'jack-o-lantern'));
  // chalk drawings, weather and food are in the same search
  assert.ok((await find('acorn')).some(f => f.id === 'gi-acorn'));
  assert.ok((await find('rain')).some(f => f.id.startsWith('mc-')));
  assert.ok((await find('waffle')).some(f => f.id === 'ic-waffle'));
  // asked for: flags
  assert.ok((await find('flag united states')).some(f => f.subject.includes('flag')));
  assert.deepEqual(await find(''), []);
});

test('Openclipart: real clipart, found by its own words, one answer for its drawings of one thing', async () => {
  const muffin = (await find('muffin')).find(f => f.subject === 'oc-muffin');
  assert.ok(muffin, 'Openclipart’s muffin');
  // found by the words its author gave it, not just its name
  assert.ok((await find('dessert')).some(f => f.subject.startsWith('oc-')));
  // "apple", "apple-2", "apple-3": one answer, the others as its looks
  const apple = (await find('apple')).filter(f => f.subject.startsWith('oc-apple'));
  assert.equal(apple.filter(f => f.subject === 'oc-apple').length, 1);
  assert.ok(apple.find(f => f.subject === 'oc-apple')!.looks.length >= 2);
  // an Italian title, in English
  assert.ok((await find('ladybug')).some(f => f.subject.startsWith('oc-')));
  const r = await ed.api('/api/clip/oc-muffin.svg');
  assert.equal(r.status, 200);
  assert.match(await r.text(), /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="[-0-9. ]+"/);
  for (const q of ['gun', 'beer', 'cigarette', 'skull', 'nude'])
    assert.ok(!(await find(q)).some(f => f.looks.some(l => l.startsWith('oc-'))), `no Openclipart for "${q}"`);
});

test('chalk drawings: no weapons, the family-friendly ones in', async () => {
  for (const q of ['sword', 'gun', 'skull', 'bomb', 'dagger'])
    assert.ok(!(await find(q)).some(f => f.looks.some(l => l.startsWith('gi-'))), `no chalk drawing for "${q}"`);
  assert.ok(
    (await find('farm')).some(f => f.id === 'gi-farm-tractor'),
    'whole words only: the farm stays'
  );
});

test('packs: every picture in every pack is on the board; this month’s first', async () => {
  const all = loadPacks();
  for (const p of all) {
    const r = (await (await ed.api('/api/clip/pack/' + p.id)).json()) as { pictures: string[] };
    const missing = p.pictures.filter(n => !r.pictures.includes(n));
    assert.deepEqual(missing, [], `${p.name}: pictures the board doesn't have`);
    for (const c of p.cover) assert.ok(r.pictures.includes(c) || missing.length === 0, `${p.name} cover ${c}`);
  }
  const nov = packOrder(all, 11).map(([p]) => p.id);
  assert.equal(nov[0], 'thanksgiving', 'November: Thanksgiving first');
  assert.ok(nov.indexOf('birthday') < nov.indexOf('christmas'), 'all-year packs before other seasons');
  const list = (await (await fam.api('/api/clip/packs')).json()) as { packs: { cover: string[]; count: number }[] };
  assert.equal(list.packs.length, all.length);
  assert.ok(list.packs.every(p => p.cover.length === 4 && p.count > 8));
  assert.equal((await ed.api('/api/clip/pack/nope')).status, 404);
});

test('favorites: pinned from a family screen for every screen; the wall can’t', async () => {
  let r = await fam.post('/api/clip/favorites', { id: 'turkey', on: true });
  assert.deepEqual((await r.json()).items, ['turkey']);
  await fam.post('/api/clip/favorites', { id: 'gi-acorn', on: true });
  assert.deepEqual((await (await ed.api('/api/clip/favorites')).json()).items, ['gi-acorn', 'turkey'], 'newest first');
  r = await fam.post('/api/clip/favorites', { id: 'turkey', on: false });
  assert.deepEqual((await r.json()).items, ['gi-acorn']);
  assert.equal((await fam.post('/api/clip/favorites', { id: 'not-a-picture-at-all', on: true })).status, 400);
  assert.equal((await wall.post('/api/clip/favorites', { id: 'turkey', on: true })).status, 403);
  await fam.post('/api/clip/favorites', { id: 'gi-acorn', on: false });
});
