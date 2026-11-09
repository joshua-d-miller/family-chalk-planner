/*
===============================================================================
 Family Chalk Planner | Tests | household.test.ts
===============================================================================
 Version:   0.15.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Updated:   2026-11-08

 Purpose:
     Reminders, timers, the pantry and the right-hand column's pages (from
     Colby Way's board): each item saved on its own, what a family screen
     and a wall may do, and the values the server won't take.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    Reminders, timers, the pantry and the right-
                        colby     hand column's pages (server).
                        claude
                                  The new screens (React + TypeScript): meal
                                  plan, reminders, timers, pantry, jars and
                                  chores.

 0.14.0    2026-11-07   joshua    Up to 3 pinned pages.
                        claude

 0.15.0    2026-11-08   joshua    Month or week, per screen.
                        claude

                                  A week's own art; the bottom of Notes per
                                  screen.
===============================================================================
*/

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { client, makeAdmin, startServer } from './helpers.ts';

const PORT = 3987;
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

test.before(async () => {
  board = await startServer(PORT);
  assert.ok(board.up, board.output());
  const adm = await makeAdmin(base, board.data);
  ed = client(base, adm.cookie);
  fam = await screen(ed, 'family');
  wall = await screen(ed, 'view');
});
test.after(async () => {
  await board.stop();
  fs.rmSync(board.data, { recursive: true, force: true });
});

test('reminders: added one at a time; ticked off; a timed one-off is done once seen', async () => {
  let v = await (
    await fam.post('/api/reminders/item', { reminder: { title: 'Library books due', mode: 'always' } })
  ).json();
  const always = v.items[0];
  assert.equal(always.important, true);
  v = await (
    await fam.post('/api/reminders/item', {
      reminder: { title: 'Pick up <b>Theo</b>', mode: 'time', time: '15:10', repeat: 'once' }
    })
  ).json();
  const once = v.items.find(r => r.mode === 'time');
  assert.equal(once.title, 'Pick up  b Theo /b', 'no markup kept');
  assert.equal(once.time, '15:10');
  v = await (await fam.post('/api/reminders/check', { id: always.id })).json();
  assert.equal(v.items.find(r => r.id === always.id).done, true);
  assert.equal(v.items.find(r => r.id === always.id).ackDate, v.today);
  v = await (await fam.post('/api/reminders/check', { id: once.id, ack: true })).json();
  assert.equal(v.items.find(r => r.id === once.id).done, true);
  assert.match(v.nowHm, /^\d\d:\d\d$/);
  v = await (
    await ed.post('/api/reminders/item', {
      reminder: { id: once.id, title: 'Pick up Nora', mode: 'time', time: '25:99' }
    })
  ).json();
  assert.equal(v.items.find(r => r.id === once.id).time, '09:00', 'a bad time falls back');
  assert.equal(v.items.length, 2);
  v = await (await ed.post('/api/reminders/item/delete', { id: once.id })).json();
  assert.equal(v.items.length, 1);
  assert.equal(
    (await wall.post('/api/reminders/item', { reminder: { title: 'x' } })).status,
    403,
    'the wall only shows'
  );
});

test('timers: shared by every screen, one changed at a time', async () => {
  const now = Date.now();
  let v = await (
    await fam.post('/api/timers/item', {
      timer: { name: 'Pasta', duration: 9 * 60e3, state: 'running', endsAt: now + 9 * 60e3 }
    })
  ).json();
  const pasta = v.items[0];
  assert.equal(pasta.state, 'running');
  assert.ok(Math.abs(v.now - Date.now()) < 5000);
  await Promise.all([
    fam.post('/api/timers/item', { timer: { name: 'Bath', duration: 20 * 60e3, state: 'paused', left: 5 * 60e3 } }),
    ed.post('/api/timers/item', { timer: { ...pasta, state: 'done', doneAt: now } })
  ]);
  v = await (await ed.api('/api/timers')).json();
  assert.equal(v.items.length, 2);
  assert.equal(v.items.find(t => t.id === pasta.id).state, 'done');
  assert.equal(v.items.find(t => t.name === 'Bath').left, 5 * 60e3);
  v = await (await fam.post('/api/timers/item', { timer: { name: 'Forever', duration: 9e9 } })).json();
  assert.equal(v.items.find(t => t.name === 'Forever').duration, 24 * 3600e3, 'a day at most');
  v = await (await fam.post('/api/timers/item/delete', { id: pasta.id })).json();
  assert.ok(!v.items.some(t => t.id === pasta.id));
});

test('pantry: one item at a time, sorted by where it is', async () => {
  await Promise.all([
    fam.post('/api/pantry/item', { item: { name: 'Milk', loc: 'fridge', qty: '1 gal' } }),
    fam.post('/api/pantry/item', { item: { name: 'Rice', loc: 'pantry', date: '2026-10-01' } }),
    fam.post('/api/pantry/item', { item: { name: 'Peas', loc: 'garage' } })
  ]);
  let v = await (await ed.api('/api/pantry')).json();
  assert.deepEqual(
    v.items.map(i => [i.name, i.loc]),
    [
      ['Milk', 'fridge'],
      ['Peas', 'pantry'],
      ['Rice', 'pantry']
    ]
  );
  const milk = v.items[0];
  assert.match(milk.date, /^\d{4}-\d{2}-\d{2}$/, 'today, when no date is given');
  v = await (await fam.post('/api/pantry/item', { item: { ...milk, qty: 'half' } })).json();
  assert.equal(v.items.find(i => i.id === milk.id).qty, 'half');
  assert.equal(v.items.length, 3);
  assert.equal((await fam.post('/api/pantry/item', { item: { name: ' ' } })).status, 400);
  v = await (await fam.post('/api/pantry/item/delete', { id: milk.id })).json();
  assert.equal(v.items.length, 2);
});

test('the right-hand column: up to 3 pages; older boards keep what they showed', async () => {
  let x = await (await ed.api('/api/extras')).json();
  assert.deepEqual(x.notes.pages, ['info', 'meals', 'jars']);
  let r = await (
    await fam.post('/api/right-pages', { pages: ['reminders', 'timers', 'timers', 'bogus', 'pantry', 'jars'] })
  ).json();
  assert.deepEqual(r.pages, ['reminders', 'timers', 'pantry']);
  r = await (await ed.post('/api/notes', { bottom: 'upnext' })).json();
  assert.deepEqual(r.pages, ['info', 'meals', 'upnext'], 'the current board’s choice of the bottom');
  x = await (await wall.api('/api/extras')).json();
  assert.deepEqual(x.notes.pages, ['info', 'meals', 'upnext']);
});

test('pinned pages: kept per person and per screen, up to 3', async () => {
  let f = await (
    await fam.post('/api/favorites', { items: ['meals', 'timers', 'meals', 'x y', 'pantry', 'jars', 'chores'] })
  ).json();
  assert.deepEqual(f.items, ['meals', 'timers', 'pantry']);
  f = await (await ed.api('/api/favorites')).json();
  assert.deepEqual(f.items, [], 'the admin has their own');
  assert.deepEqual((await (await fam.api('/api/favorites')).json()).items, ['meals', 'timers', 'pantry']);
  assert.equal((await wall.post('/api/favorites', { items: ['meals'] })).status, 403, 'the wall has no bar');
});

test('month or week: kept per screen (the wall too)', async () => {
  assert.equal((await (await wall.api('/api/boardview')).json()).view, 'month');
  assert.equal((await wall.post('/api/boardview', { view: 'week' })).status, 200);
  assert.equal((await (await wall.api('/api/boardview')).json()).view, 'week');
  assert.equal((await (await fam.api('/api/boardview')).json()).view, 'month', 'each screen its own');
  assert.equal((await fam.post('/api/boardview', { view: 'year' })).status, 400);
  await wall.post('/api/boardview', { view: 'month' });
  assert.equal((await (await wall.api('/api/boardview')).json()).view, 'month');
});

test('a week drawn in the week view keeps its own art', async () => {
  const bulk = (ym: string, s: string) => fam.post('/api/art/bulk', { ym, items: [{ k: 't', s, x: 10, y: 10 }] });
  assert.equal((await bulk('2026-11-08', 'Week')).status, 200);
  assert.equal((await bulk('2026-11', 'Month')).status, 200);
  const week = await (await wall.api('/api/art?ym=2026-11-08')).json();
  const month = await (await wall.api('/api/art?ym=2026-11')).json();
  assert.deepEqual(
    week.map((x: { s: string }) => x.s),
    ['Week']
  );
  assert.ok(!month.some((x: { s: string }) => x.s === 'Week'));
  assert.equal((await fam.post('/api/art/bulk', { ym: '2026-1-8', items: [] })).status, 400);
});

test('the bottom of Notes: each screen its own, the wall’s from the admin console', async () => {
  assert.equal((await (await fam.api('/api/notesbottom')).json()).bottom, null);
  let r = await fam.post('/api/notesbottom', { bottom: { def: 'upnext', can: ['photos', 'bogus'] } });
  assert.deepEqual((await r.json()).bottom, { def: 'upnext', can: ['upnext', 'photos'] });
  assert.equal((await fam.post('/api/notesbottom', { bottom: { def: 'nope' } })).status, 400);
  assert.equal((await wall.post('/api/notesbottom', { bottom: { def: 'today' } })).status, 403, 'the wall can’t');
  // the admin console sets the wall's
  const devs = (await (await ed.api('/api/devices')).json()).devices as { id: string; role: string }[];
  const wallId = devs.find(d => d.role === 'view')!.id;
  r = await ed.post('/api/devices/notes-bottom', { id: wallId, bottom: { def: 'today', can: ['today'] } });
  assert.equal(r.status, 200);
  assert.deepEqual((await (await wall.api('/api/notesbottom')).json()).bottom, { def: 'today', can: ['today'] });
  assert.equal((await fam.post('/api/devices/notes-bottom', { id: wallId, bottom: null })).status, 403);
  await ed.post('/api/devices/notes-bottom', { id: wallId, bottom: null });
  assert.equal((await (await wall.api('/api/notesbottom')).json()).bottom, null);
  await fam.post('/api/notesbottom', { bottom: null });
});
