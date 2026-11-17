/*
===============================================================================
 Family Chalk Planner | Tests | Browser | fixtures.ts
===============================================================================
 Version:   1.1.0
 Author:    Joshua D. Miller, Claude
 Updated:   2026-11-17

 Purpose:
     A real board for the browser tests: the server with a fake calendar,
     photo album and weather, an admin who is signed in, and helpers to
     open the board as any kind of screen.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-06   joshua    Server and tests are all TypeScript (ES
                        claude    modules).

 0.14.1    2026-11-08   joshua    A pop-up left by another test is closed as a
                        claude    screen opens.

 0.14.2    2026-11-08   joshua    Waits for a screen to finish loading, not a
                        claude    fixed second.

 1.1.0    2026-11-17   joshua    Waits for the picture styles to unpack
                        claude    before the tests start (two Pictures tests
                                  failed when they ran before that).
===============================================================================
*/

import * as base from '@playwright/test';
import type { BrowserContext, BrowserContextOptions, Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { makeAdmin, client, totpNow, cookiesOf } from '../helpers.ts';
import * as mockAlbum from '../mock-album.ts';
import * as mockCaldav from '../mock-caldav.ts';

const ROOT = path.join(import.meta.dirname, '..', '..');
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

function fakeWeather(port: number): Promise<http.Server> {
  const body = JSON.stringify({
    current: { temperature_2m: 58, weather_code: 2 },
    daily: {
      temperature_2m_max: [63, 66],
      temperature_2m_min: [44, 47],
      precipitation_probability_max: [10, 40],
      weather_code: [2, 61]
    }
  });
  const srv = http.createServer((q, r) => {
    r.writeHead(200, { 'Content-Type': 'application/json' });
    r.end(body);
  });
  return new Promise(r => srv.listen(port, '127.0.0.1', () => r(srv)));
}
async function waitUp(url: string) {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error('the board did not start');
}
const toCookies = (cookie: string, url: string) =>
  cookie
    .split('; ')
    .filter(Boolean)
    .map(c => {
      const i = c.indexOf('=');
      return { name: c.slice(0, i), value: c.slice(i + 1), url };
    });

async function startBoard(workerIndex: number) {
  const port = 4100 + workerIndex * 10,
    dav = port + 1,
    album = port + 2,
    weather = port + 3;
  const url = `http://127.0.0.1:${port}`;
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fcp-e2e-'));
  const servers = [await mockCaldav.start(dav), await mockAlbum.start(album), await fakeWeather(weather)];
  const proc = spawn(process.execPath, [path.join(ROOT, 'server', 'chalkboard.js')], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      BIND: '127.0.0.1',
      DATA_DIR: data,
      TIMEZONE: 'America/New_York',
      TRASH_DAY: '2',
      BOARD_TITLE: 'Test Family',
      CALDAV_URL: `http://127.0.0.1:${dav}/`,
      CALDAV_USER: 'u',
      CALDAV_PASSWORD: 'p',
      CALDAV_CALENDAR: 'Family',
      PHOTO_ALBUM_URL: 'https://photos.icloud.com/shared/album/0d3TESTALBUMxyz',
      PHOTO_CK_HOST: `http://127.0.0.1:${album}`,
      LATITUDE: '40.79',
      LONGITUDE: '-77.86',
      WEATHER_URL: `http://127.0.0.1:${weather}`
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let log = '';
  proc.stdout.on('data', d => {
    log += d;
  });
  proc.stderr.on('data', d => {
    log += d;
  });
  await waitUp(url + '/api/today');
  const adm = await makeAdmin(url, data);
  const admin = client(url, adm.cookie);
  await admin.post('/api/photos/sync', {});
  // the picture styles unpack in the background after the board starts: wait for them, so the
  // Pictures tests never depend on how quickly the machine running them is
  for (let i = 0; i < 180; i++) {
    const st = await (await admin.api('/api/clip/styles')).json();
    if (Array.isArray(st) && st.length && st.every((x: { count: number }) => x.count)) break;
    await new Promise(r => setTimeout(r, 1000));
  }
  // no overnight slideshow over the tests (it has its own test, with a night-time clock)
  await admin.post('/api/photos/settings', { night: false });
  // an editor, like a parent's own tablet: invited, password + authenticator code
  const H = { 'Content-Type': 'application/json', 'X-Chalk': '1' };
  const inv = await (
    await admin.post('/api/users/invite', { username: 'parent', name: 'Parent', role: 'editor' })
  ).json();
  const join = await (
    await fetch(url + '/api/account/join', {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ invite: inv.link.split('#')[1], password: 'another long password' })
    })
  ).json();
  const enr = await fetch(url + '/api/account/enroll', {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ enroll: join.enroll, code: totpNow(join.secret) })
  });
  if (!enr.ok) throw new Error('editor sign-up failed: ' + (await enr.text()));
  const editorCookie = cookiesOf(enr);

  // a paired screen: 'view' (wall), 'family', or 'kid:<personId>'. One per kind, reused (the board
  // allows 10 new pairings per address every 10 minutes).
  const paired: Record<string, Promise<string>> = {};
  const pairScreen = (role: string) => paired[role] || (paired[role] = pairNew(role));
  async function pairNew(role: string, name = role) {
    const r = await fetch(url + '/api/pair/start', {
      method: 'POST',
      headers: { 'X-Chalk': '1', 'User-Agent': ANDROID_UA }
    });
    if (!r.ok) throw new Error('pairing failed: ' + (await r.text()));
    const pairCookie = (r.headers.get('set-cookie') || '').split(';')[0],
      { code } = await r.json();
    const ok = await admin.post('/api/devices/approve', { code, name, role });
    if (!ok.ok) throw new Error('approve failed: ' + (await ok.text()));
    const s = await fetch(url + '/api/pair/status', { headers: { cookie: pairCookie } });
    return s.headers.getSetCookie()[0].split(';')[0];
  }
  return {
    url,
    data,
    admin,
    adm,
    editorCookie,
    editor: client(url, editorCookie),
    log: () => log,
    pairScreen,
    stop() {
      proc.kill();
      servers.forEach(s => s.close());
      fs.rmSync(data, { recursive: true, force: true });
    }
  };
}

type Board = Awaited<ReturnType<typeof startBoard>>;
// a page that also collects the page's script errors
type BoardPage = Page & { errors: string[] };
type OpenAs = (
  kind: string,
  opts?: { context?: BrowserContextOptions; time?: number | string | Date; path?: string; settle?: boolean }
) => Promise<BoardPage>;

const test = base.test.extend<{ as: OpenAs }, { board: Board }>({
  // one board per worker, shared by its tests
  board: [
    // eslint-disable-next-line no-empty-pattern -- Playwright reads which fixtures are used from this pattern
    async ({}, use, info) => {
      const b = await startBoard(info.workerIndex);
      await use(b);
      b.stop();
    },
    { scope: 'worker' }
  ],
  // open the board as a kind of screen: 'tablet' (a signed-in editor), 'admin' (the admin's tablet), 'wall', 'family',
  // 'kid:<personId>', 'phone' (an editor's phone), 'phone-signed-out'
  as: async ({ browser, board }, use) => {
    const opened: BrowserContext[] = [];
    await use(async (kind, opts = {}) => {
      const phone = kind.startsWith('phone');
      const ctx = await browser.newContext({
        ...(phone
          ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true }
          : { viewport: { width: 1180, height: 820 } }),
        hasTouch: true,
        userAgent: ANDROID_UA,
        timezoneId: 'America/New_York',
        ...opts.context
      });
      opened.push(ctx);
      if (kind === 'tablet' || kind === 'phone') await ctx.addCookies(toCookies(board.editorCookie, board.url));
      else if (kind === 'admin') await ctx.addCookies(toCookies(board.adm.cookie, board.url));
      else if (kind !== 'phone-signed-out')
        await ctx.addCookies(toCookies(await board.pairScreen(kind === 'wall' ? 'view' : kind), board.url));
      const page = (await ctx.newPage()) as BoardPage;
      page.errors = [];
      page.on('pageerror', e => page.errors.push(e.message));
      page.on('dialog', d => d.accept()); // "Are you sure?" -> yes
      if (opts.time) await page.clock.setFixedTime(opts.time); // the screen's clock (the board's own "today" comes from the server)
      const path =
        opts.path ||
        (kind === 'tablet' || kind === 'admin' || kind === 'family'
          ? '/edit'
          : kind.startsWith('phone')
            ? '/chores'
            : '/');
      await page.goto(board.url + path);
      // the fonts on the screen have loaded (at most 10 seconds: one slow emoji piece mustn't fail a test)
      await page
        .waitForFunction(() => document.fonts && document.fonts.status === 'loaded', null, { timeout: 10_000 })
        .catch(() => {});
      // month, art, photos and weather arrive: no request on its way for a moment (<html data-busy> is gone)
      if (opts.settle !== false)
        await page.waitForFunction(
          () =>
            new Promise<boolean>(done => {
              let quiet = 0;
              const t = setInterval(() => {
                quiet = document.documentElement.dataset.busy ? 0 : quiet + 1;
                if (quiet >= 3) {
                  clearInterval(t);
                  done(true);
                }
              }, 50);
            }),
          null,
          { timeout: 10_000 }
        );
      // a reminder or timer left by another test can pop up as the screen opens: close it, so it doesn't
      // sit over what this test taps (tests that want one make it after opening the screen)
      for (let i = 0; i < 3 && (await page.locator('.scrim').count()); i++) await page.keyboard.press('Escape');
      return page;
    });
    for (const c of opened) await c.close();
  }
});

// this month as the board shows it
function thisMonth() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  return {
    ym,
    name: d.toLocaleString('en-US', { month: 'long' }),
    day: d.getDate(),
    date: `${ym}-${String(d.getDate()).padStart(2, '0')}`
  };
}

const expect = base.expect;
export { test, expect, thisMonth };
