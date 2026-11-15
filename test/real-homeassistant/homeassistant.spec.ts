/*
===============================================================================
 Family Chalk Planner | Tests | real-homeassistant | homeassistant.spec.ts
===============================================================================
 Version:   1.0.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-14
 Updated:   2026-11-14

 Purpose:
     The board as the Home Assistant app, against a real Home Assistant
     (not test/mock-homeassistant.ts): Home Assistant's admins are the
     board's admins, its Local Calendar and Local To-do list are read and
     changed from the board, and in the sidebar panel the board hides
     Home Assistant's sidebar, puts it back afterwards, and gets live
     updates. The Supervisor's part (the panel's proxy and its token) is
     played by test/real-homeassistant/ingress-proxy.ts and a long-lived
     token.

 Used by:
     playwright.homeassistant.config.ts (npm run test:homeassistant)
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.0.0     2026-11-14   joshua    New file.
                        claude
===============================================================================
*/

import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type http from 'node:http';
import { setUpHomeAssistant, ws } from './setup-homeassistant.ts';
import type { HaSetup } from './setup-homeassistant.ts';
import { INGRESS, startIngressProxy } from './ingress-proxy.ts';

const HA_URL = process.env.HA_URL || 'http://127.0.0.1:8123';
const HA_PORT = Number(new URL(HA_URL).port || 8123);
const BOARD = 3977,
  PROXY = 8124;
const base = `http://127.0.0.1:${BOARD}`;
const panel = `http://127.0.0.1:${PROXY}`; // Home Assistant's address, as the browser sees it
let ha: HaSetup,
  board: ChildProcess,
  proxy: http.Server,
  log = '';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(400_000);
  ha = await setUpHomeAssistant(HA_URL, panel + '/');
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fcp-realha-'));
  board = spawn(process.execPath, [path.join(import.meta.dirname, '..', '..', 'server', 'chalkboard.js')], {
    env: {
      ...process.env,
      PORT: String(BOARD),
      BIND: '127.0.0.1',
      DATA_DIR: data,
      TIMEZONE: 'America/New_York',
      HOLIDAYS: 'none',
      UPDATER: 'homeassistant',
      SUPERVISOR_TOKEN: ha.token, // in the app, the Supervisor's token
      HA_API_URL: `${HA_URL}/api`,
      HA_WS_URL: `${HA_URL.replace(/^http/, 'ws')}/api/websocket`,
      HA_INGRESS_FROM: '127.0.0.1',
      HA_CALENDARS: JSON.stringify([{ id: 'calendar.family', name: 'Family', color: '#9CC9E6', main: true }]),
      HA_TODO_LISTS: JSON.stringify([{ id: 'todo.chores', name: 'Chores' }])
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  board.stdout!.on('data', d => (log += d));
  board.stderr!.on('data', d => (log += d));
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + '/api/whoami')).ok) break;
    } catch {
      /* starting */
    }
    await new Promise(r => setTimeout(r, 200));
  }
  proxy = await startIngressProxy(PROXY, { ha: HA_PORT, board: BOARD, user: () => ({ id: ha.alex, name: 'Alex' }) });
});
test.afterAll(() => {
  board?.kill();
  proxy?.close();
});
// eslint-disable-next-line no-empty-pattern -- Playwright wants its fixtures destructured
test.afterEach(({}, info) => {
  if (info.status !== info.expectedStatus) console.log('--- the board’s log ---\n' + log);
});

// a request as the panel sends it, for one of Home Assistant's people
const as = (id: () => string, name: string) => (p: string, body?: unknown) =>
  fetch(base + p, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'X-Ingress-Path': INGRESS,
      'X-Remote-User-Id': id(),
      'X-Remote-User-Display-Name': name,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'X-Chalk': '1' })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
const alex = as(() => ha.alex, 'Alex');
const sam = as(() => ha.sam, 'Sam');
const haGet = async <T>(p: string): Promise<T> =>
  (await (await fetch(HA_URL + '/api' + p, { headers: { Authorization: `Bearer ${ha.token}` } })).json()) as T;
type HaEv = { summary: string; uid: string; start: { dateTime?: string; date?: string } };
const haEvents = () => haGet<HaEv[]>('/calendars/calendar.family?start=2026-10-01T00:00:00Z&end=2026-11-01T00:00:00Z');

test('Home Assistant’s admins are the board’s admins; everyone else gets the default', async () => {
  const a = await (await alex('/api/whoami')).json();
  expect(a.admin).toBe(true);
  expect(a.ha).toEqual({ inside: true, person: { name: 'Alex', role: 'admin' } });
  const s = await (await sam('/api/whoami')).json();
  expect([s.admin, s.rank]).toEqual([false, 2]);
  expect((await sam('/api/board-settings')).status).toBe(403);
  const ppl = await (await alex('/api/ha/people')).json();
  expect(ppl.people.map((p: { name: string }) => p.name).sort()).toEqual(['Alex', 'Sam']);
});

test('the Local Calendar: read, added to, changed and deleted from the board', async () => {
  const cals = (await (await alex('/api/board-settings/ha-calendars')).json()).calendars;
  expect(cals).toContainEqual({
    id: 'calendar.family',
    name: 'Family',
    canCreate: true,
    canUpdate: true,
    canDelete: true
  });
  type Ev = { title: string; start: string; hm: string | null; ref?: unknown };
  const month = async () => (await (await alex('/api/month?ym=2026-10')).json()).events as Ev[];
  let m = await month();
  expect(m.find(e => e.title === 'Soccer')).toMatchObject({ start: '2026-10-10', hm: '09:00' });
  expect(m.find(e => e.title === 'Field trip')).toMatchObject({ start: '2026-10-16' });

  let r = await alex('/api/events', { title: 'Piano', date: '2026-10-21', allDay: false, time: '16:30', minutes: 45 });
  expect(r.status, await r.clone().text()).toBe(200);
  const piano = (await haEvents()).find(e => e.summary === 'Piano')!;
  expect(new Date(piano.start.dateTime!).toISOString()).toBe('2026-10-21T20:30:00.000Z');

  r = await alex('/api/events/update', {
    ref: m.find(e => e.title === 'Soccer')!.ref,
    title: 'Soccer (away)',
    date: '2026-10-11',
    allDay: false,
    time: '10:00',
    minutes: 90
  });
  expect(r.status, await r.clone().text()).toBe(200);
  r = await alex('/api/events/delete', { ref: m.find(e => e.title === 'Field trip')!.ref, origDate: '2026-10-16' });
  expect(r.status, await r.clone().text()).toBe(200);
  const now = await haEvents();
  expect(now.map(e => e.summary).sort()).toEqual(['Piano', 'Soccer (away)']);
  expect(new Date(now.find(e => e.summary === 'Soccer (away)')!.start.dateTime!).toISOString()).toBe(
    '2026-10-11T14:00:00.000Z'
  );
  m = await month();
  expect(m.find(e => e.title === 'Soccer (away)')).toMatchObject({ start: '2026-10-11', hm: '10:00' });
  // someone who may only look can't change it
  await alex('/api/ha/people', { id: ha.sam, role: 'view' });
  expect((await sam('/api/events/delete', { ref: m.find(e => e.title === 'Piano')!.ref })).status).toBe(403);
  await alex('/api/ha/people', { id: ha.sam, role: null });
});

test('the Local To-do list: on the Chores page, ticked off into Home Assistant', async () => {
  const v = await (await sam('/api/chores/ha')).json();
  const items = v.lists[0].items as { uid: string; title: string; done: boolean }[];
  expect(items.map(i => [i.title, i.done]).sort()).toEqual([
    ['Feed the dog', false],
    ['Take out the trash', false]
  ]);
  const trash = items.find(i => i.title === 'Take out the trash')!;
  const r = await sam('/api/chores/ha-check', { list: 'todo.chores', uid: trash.uid, done: true });
  expect(r.status, await r.clone().text()).toBe(200);
  const inHa = await ws<{ items: { summary: string; status: string }[] }>(HA_URL, ha.token, {
    type: 'todo/item/list',
    entity_id: 'todo.chores'
  });
  expect(inHa.items.find(i => i.summary === 'Take out the trash')?.status).toBe('completed');
});

test('live updates reach the board through the panel', async () => {
  const ctl = new AbortController();
  const r = await fetch(panel + INGRESS + '/api/stream', { signal: ctl.signal });
  expect(r.headers.get('content-type')).toContain('text/event-stream');
  const reader = r.body!.getReader();
  let got = '';
  const until = async (s: string) => {
    for (let i = 0; i < 50 && !got.includes(s); i++) got += new TextDecoder().decode((await reader.read()).value);
    expect(got).toContain(s);
  };
  await until('event: hello');
  const items = (await (await alex('/api/chores/ha')).json()).lists[0].items as { uid: string; title: string }[];
  await alex('/api/chores/ha-check', {
    list: 'todo.chores',
    uid: items.find(i => i.title === 'Feed the dog')!.uid,
    done: true
  });
  await until('event: chores');
  ctl.abort();
});

test('in Home Assistant’s page the sidebar hides while the board is open, and comes back', async ({ page }) => {
  // signed in to Home Assistant as Alex (what its login page leaves behind)
  await page.addInitScript(
    ([tokens]) => {
      if (window === window.top && !localStorage.getItem('hassTokens')) localStorage.setItem('hassTokens', tokens);
    },
    [
      JSON.stringify({
        access_token: ha.access.access_token,
        refresh_token: ha.access.refresh_token,
        token_type: 'Bearer',
        expires_in: ha.access.expires_in,
        expires: Date.now() + ha.access.expires_in * 1000,
        hassUrl: panel,
        clientId: panel + '/'
      })
    ]
  );
  await page.goto(panel + '/lovelace/0');
  const dock = () =>
    page.evaluate(
      () =>
        (document.querySelector('home-assistant') as unknown as { hass?: { dockedSidebar?: string } })?.hass
          ?.dockedSidebar
    );
  await expect.poll(dock, { timeout: 60_000 }).toBe('docked');
  await expect(page.locator('ha-sidebar')).toBeVisible();

  // the board opens in the panel (an iframe on Home Assistant's own address, as Ingress gives it)
  await page.evaluate(src => {
    const f = document.createElement('iframe');
    f.id = 'chalkboard';
    f.src = src;
    f.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;border:0;z-index:9';
    document.body.appendChild(f);
  }, INGRESS + '/edit');
  const frame = page.frameLocator('#chalkboard');
  await expect(frame.locator('body')).not.toBeEmpty();
  await expect.poll(dock).toBe('always_hidden');
  expect(await page.evaluate(() => localStorage.getItem('dockedSidebar'))).toBe('"always_hidden"');

  // closed: put back as it was
  await page.evaluate(() => document.getElementById('chalkboard')!.remove());
  await expect.poll(dock).toBe('docked');
  expect(await page.evaluate(() => localStorage.getItem('chalkHaSidebarWas'))).toBeNull();
});
