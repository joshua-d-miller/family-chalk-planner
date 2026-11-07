// The lists (chores, meals, jars) in their own tables: copied over from older versions, changed one item at
// a time so two screens saving together both count, and a database from a newer version is refused.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { client, makeAdmin, startServer } from './helpers.ts';

const PORT = 3988;
const base = `http://127.0.0.1:${PORT}`;
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fcp-lists-'));
let board: Awaited<ReturnType<typeof startServer>>;
let ed: ReturnType<typeof client>;

// a database as 0.12 left it: the lists as single values in kv
function oldDatabase() {
  const db = new DatabaseSync(path.join(data, 'chalkboard.db'));
  db.exec('CREATE TABLE kv (key TEXT PRIMARY KEY, data TEXT NOT NULL)');
  const put = (k: string, v: unknown) =>
    db.prepare('INSERT INTO kv (key, data) VALUES (?, ?)').run(k, JSON.stringify(v));
  put('chores', {
    people: [
      { id: 'dad', name: 'Dad' },
      { id: 'k1', name: 'Theo', kid: true }
    ],
    chores: [
      { id: 'c1', title: 'Dishes', who: ['dad'], every: 'day', times: 1 },
      { id: 'c2', title: 'Make bed', who: ['dad', 'k1'], every: 'day', times: 1, each: true }
    ]
  });
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  put('chore_done', { c1: { p: today, n: 1, by: 'Dad', at: 1 } });
  put('meals', {
    items: [
      { t: 'Tacos', done: false },
      { t: 'Soup', done: true }
    ]
  });
  put('jars', [
    { id: 'theo', name: 'Theo', pieces: ['star', 'heart'], count: 3, items: ['star', 'heart', 'star'], goal: 10 }
  ]);
  db.close();
}

test.before(async () => {
  oldDatabase();
  board = await startServer(PORT, {}, data);
  assert.ok(board.up, board.output());
  const adm = await makeAdmin(base, data);
  ed = client(base, adm.cookie);
});
test.after(async () => {
  await board.stop();
  fs.rmSync(data, { recursive: true, force: true });
});

test('an older database is brought up to date: the lists are copied into their tables', async () => {
  assert.match(board.output(), /database updated \(1: lists in their own tables\)/);
  const ch = await (await ed.api('/api/chores')).json();
  assert.deepEqual(
    ch.people.map(p => p.name),
    ['Dad', 'Theo']
  );
  assert.equal(ch.chores.find(c => c.id === 'c1').done, 1, 'today’s tick came along');
  assert.deepEqual(ch.chores.find(c => c.id === 'c2').doneEach, { dad: 0, k1: 0 });
  const m = await (await ed.api('/api/meals')).json();
  assert.deepEqual(
    m.items.map(x => [x.t, x.day, x.done]),
    [
      ['Tacos', '', false],
      ['Soup', '', true]
    ]
  );
  assert.ok(m.items.every(x => /^[a-z0-9]+$/.test(x.id)));
  const j = await (await ed.api('/api/jars')).json();
  assert.equal(j[0].count, 3);
  assert.deepEqual(j[0].items, ['star', 'heart', 'star']);
});

test('meals: one at a time, with a day; two screens adding at once both count', async () => {
  await Promise.all([
    ed.post('/api/meals/item', { meal: { t: 'Pizza', day: 'fri' } }),
    ed.post('/api/meals/item', { meal: { t: 'Pasta', day: 'mon' } }),
    ed.post('/api/meals/item', { meal: { t: '[tue] Stir fry' } })
  ]);
  let m = await (await ed.api('/api/meals')).json();
  const day = (t: string) => m.items.find(x => x.t === t)?.day;
  assert.equal(day('Pizza'), 'fri');
  assert.equal(day('Pasta'), 'mon');
  assert.equal(day('Stir fry'), 'tue', 'Colby’s "[tue] ..." form still reads');
  // the old board sends the whole list without days: the days stay
  const r = await ed.post('/api/meals', { items: m.items.map(x => ({ t: x.t, done: x.t === 'Pizza' })) });
  assert.equal(r.status, 200);
  m = await r.json();
  assert.equal(day('Pizza'), 'fri');
  assert.equal(m.items.find(x => x.t === 'Pizza').done, true);
  const id = m.items.find(x => x.t === 'Pasta').id;
  m = await (await ed.post('/api/meals/item/delete', { id })).json();
  assert.ok(!m.items.some(x => x.t === 'Pasta'));
  assert.equal((await ed.post('/api/meals/item', { meal: { t: '  ' } })).status, 400);
});

test('jars: pieces dropped in from several screens at once all land', async () => {
  await Promise.all(Array.from({ length: 6 }, () => ed.post('/api/jars/piece', { id: 'theo' })));
  let j = (await (await ed.api('/api/jars')).json())[0];
  assert.equal(j.count, 9);
  assert.deepEqual(j.items.slice(3, 5), ['heart', 'star'], 'the jar’s own rotation');
  j = (await (await ed.post('/api/jars/piece', { id: 'theo', piece: 'rainbow' })).json())[0];
  assert.equal(j.items.at(-1), 'rainbow');
  j = (await (await ed.post('/api/jars/piece', { id: 'theo', out: true })).json())[0];
  assert.equal(j.count, 9);
  assert.equal((await ed.post('/api/jars/piece', { id: 'nope' })).status, 404);
});

test('chores: one chore at a time; removing a person takes them off their chores', async () => {
  let v = await (
    await ed.post('/api/chores/item', { chore: { id: 'c3', title: 'Feed cats', who: ['k1'], every: 'day', times: 2 } })
  ).json();
  assert.equal(v.chores.find(c => c.id === 'c3').times, 2);
  v = await (
    await ed.post('/api/chores/item', { chore: { id: 'c3', title: 'Feed the cats', who: ['k1'], every: 'day' } })
  ).json();
  assert.equal(v.chores.filter(c => c.id === 'c3').length, 1);
  assert.equal(v.chores.find(c => c.id === 'c3').title, 'Feed the cats');
  assert.equal(
    (await ed.post('/api/chores/item', { chore: { id: 'c4', title: 'X', who: ['ghost'], every: 'day' } })).status,
    400
  );
  v = await (await ed.post('/api/chores/people', { people: [{ id: 'dad', name: 'Dad' }] })).json();
  assert.deepEqual(
    v.chores.map(c => c.id),
    ['c1', 'c2'],
    'Theo’s only chore went with him'
  );
  assert.deepEqual(v.chores.find(c => c.id === 'c2').who, ['dad']);
  v = await (await ed.post('/api/chores/item/delete', { id: 'c2' })).json();
  assert.deepEqual(
    v.chores.map(c => c.id),
    ['c1']
  );
});

test('a database from a newer version is refused, with what to do', async () => {
  await board.stop();
  const db = new DatabaseSync(path.join(data, 'chalkboard.db'));
  db.exec('PRAGMA user_version = 99');
  db.close();
  const again = await startServer(PORT, {}, data);
  assert.equal(again.up, false);
  assert.equal(await again.exited, 1);
  assert.match(again.output(), /newer version of the board.*Restore the backup/s);
});
