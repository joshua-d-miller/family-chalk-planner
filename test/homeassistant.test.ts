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
     ingress path and may be framed by Home Assistant only. Its calendars
     are the board's: read, added to, changed and deleted as each allows;
     its to-do lists are on the Chores page.
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
      HA_INGRESS_FROM: '127.0.0.1',
      HA_CALENDARS: JSON.stringify([
        { id: 'calendar.family', name: 'Family', color: '#9CC9E6', main: true },
        { id: 'calendar.work', name: 'Work', color: '#E8A35C' },
        { id: 'calendar.holidays', name: 'Holidays', color: '#F26B6B' }
      ]),
      HA_TODO_LISTS: JSON.stringify([{ id: 'todo.chores', name: 'Chores' }])
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

// ------------------------------- //
// | Home Assistant's calendars | //
// ------------------------------- //
type Ev = { title: string; start: string; time: string | null; cal?: string; readOnly?: boolean; ref?: unknown };
const month = async () =>
  (await (await admin('/api/month?ym=2026-10')).json()) as {
    events: Ev[];
    calendars: { id: string; main: boolean }[];
  };
const find = (m: { events: Ev[] }, t: string) => m.events.find(e => e.title === t);

test('Home Assistant’s calendars are the board’s', async () => {
  const pick = await (await admin('/api/board-settings/ha-calendars')).json();
  assert.deepEqual(
    pick.calendars.map((c: { id: string; canCreate: boolean }) => [c.id, c.canCreate]),
    [
      ['calendar.family', true],
      ['calendar.holidays', false],
      ['calendar.work', true]
    ],
    'by name'
  );
  const m = await month();
  assert.match(String(find(m, 'Soccer')?.time), /^9(:00)?\s?(am|AM)?/, 'at 9 in the board’s time zone');
  assert.equal(find(m, 'Soccer')?.start, '2026-10-10');
  assert.equal(find(m, 'Soccer')?.cal, undefined, 'the main calendar has no label');
  assert.equal(find(m, 'Field trip')?.start, '2026-10-16');
  assert.equal(find(m, 'Team offsite')?.cal, 'Work');
  assert.equal(find(m, 'Halloween')?.readOnly, true, 'a calendar Home Assistant can’t change');
  assert.deepEqual(
    m.calendars.map(c => [c.id, c.main]),
    [
      ['calendar.family', true],
      ['calendar.work', false]
    ],
    'new events can go to the calendars that take them, the main one first'
  );
});

test('adding, changing and deleting go to Home Assistant', async () => {
  let r = await post(admin, '/api/events', {
    title: 'Piano',
    date: '2026-10-21',
    allDay: false,
    time: '16:30',
    minutes: 45
  });
  assert.equal(r.status, 200, await r.clone().text());
  r = await post(admin, '/api/events', {
    title: 'Book fair',
    date: '2026-10-22',
    allDay: true,
    calendarId: 'calendar.work'
  });
  assert.equal(r.status, 200);
  r = await post(admin, '/api/events', {
    title: 'Nope',
    date: '2026-10-22',
    allDay: true,
    calendarId: 'calendar.holidays'
  });
  assert.equal(r.status, 502, 'a calendar Home Assistant can’t add to');
  assert.equal(find(await month(), 'Nope'), undefined);
  const piano = ha.state().calendars['calendar.family'].events.find(e => e.summary === 'Piano')!;
  assert.equal(new Date(piano.start.dateTime!).toISOString(), '2026-10-21T20:30:00.000Z', 'in the board’s time zone');
  assert.equal(new Date(piano.end.dateTime!).getTime() - new Date(piano.start.dateTime!).getTime(), 45 * 60000);
  const fair = ha.state().calendars['calendar.work'].events.find(e => e.summary === 'Book fair')!;
  assert.deepEqual([fair.start.date, fair.end.date], ['2026-10-22', '2026-10-23'], 'all day: ends the next day');

  let m = await month();
  // a calendar that can change events
  r = await post(admin, '/api/events/update', {
    ref: find(m, 'Soccer')!.ref,
    title: 'Soccer (away)',
    date: '2026-10-10',
    allDay: false,
    time: '10:00',
    minutes: 90
  });
  assert.equal(r.status, 200, await r.clone().text());
  assert.ok(ha.state().calls.includes('update calendar.family ev-soccer Soccer (away)'));
  // one that can only add and delete (Home Assistant's Google calendars): deleted and added again
  r = await post(admin, '/api/events/update', {
    ref: find(m, 'Team offsite')!.ref,
    title: 'Team offsite',
    date: '2026-10-15',
    allDay: false,
    time: '13:00',
    minutes: 120
  });
  assert.equal(r.status, 200, await r.clone().text());
  assert.ok(ha.state().calls.includes('delete calendar.work ev-standup'));
  m = await month();
  assert.equal(find(m, 'Team offsite')?.start, '2026-10-15');
  // and deleting
  r = await post(admin, '/api/events/delete', { ref: find(m, 'Field trip')!.ref, origDate: '2026-10-16' });
  assert.equal(r.status, 200);
  assert.equal(find(await month(), 'Field trip'), undefined);
  // someone who may only look can't
  await post(admin, '/api/ha/people', { id: 'u-kid', role: 'view' });
  assert.equal((await post(kid, '/api/events/delete', { ref: find(m, 'Piano')!.ref })).status, 403);
  await post(admin, '/api/ha/people', { id: 'u-kid', role: null });
  // nor can a made-up calendar be reached
  r = await post(admin, '/api/events/delete', { ref: { href: 'ha:calendar.secret', etag: 'x' } });
  assert.equal(r.status, 502);
});

// ------------------------------- //
// | Home Assistant's to-do lists | //
// ------------------------------- //
test('Home Assistant’s to-do lists are on the Chores page', async () => {
  const pick = await (await admin('/api/board-settings/ha-todos')).json();
  assert.deepEqual(pick.lists, [{ id: 'todo.chores', name: 'Chores' }]);
  assert.equal((await kid('/api/board-settings/ha-todos')).status, 403, 'the console’s');
  const v = await (await kid('/api/chores/ha')).json();
  assert.deepEqual(v.lists[0].items, [
    { uid: 't-trash', title: 'Take out the trash', done: false },
    { uid: 't-dog', title: 'Feed the dog', done: true }
  ]);
  const r = await post(kid, '/api/chores/ha-check', { list: 'todo.chores', uid: 't-trash', done: true });
  assert.equal(r.status, 200, await r.clone().text());
  assert.equal((await r.json()).lists[0].items[0].done, true);
  assert.ok(ha.state().calls.includes('todo todo.chores t-trash completed'));
  assert.equal((await post(kid, '/api/chores/ha-check', { list: 'todo.other', uid: 'x', done: true })).status, 404);
  await post(admin, '/api/ha/people', { id: 'u-kid', role: 'view' });
  assert.equal(
    (await post(kid, '/api/chores/ha-check', { list: 'todo.chores', uid: 't-dog', done: false })).status,
    403
  );
  await post(admin, '/api/ha/people', { id: 'u-kid', role: null });
});
