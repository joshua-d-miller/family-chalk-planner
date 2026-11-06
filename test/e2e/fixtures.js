// A real board for the browser tests: the server with a fake calendar, photo album and weather,
// an admin who is signed in, and helpers to open the board as any kind of screen.
const base = require('@playwright/test');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { makeAdmin, client, totpNow, cookiesOf } = require('../helpers');

const ROOT = path.join(__dirname, '..', '..');
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

function fakeWeather(port) {
  const body = JSON.stringify({ current: { temperature_2m: 58, weather_code: 2 },
    daily: { temperature_2m_max: [63, 66], temperature_2m_min: [44, 47], precipitation_probability_max: [10, 40], weather_code: [2, 61] } });
  const srv = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(body); });
  return new Promise(r => srv.listen(port, '127.0.0.1', () => r(srv)));
}
async function waitUp(url) {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(url)).ok) return; } catch {} await new Promise(r => setTimeout(r, 150)); }
  throw new Error('the board did not start');
}
const toCookies = (cookie, url) => cookie.split('; ').filter(Boolean).map(c => { const i = c.indexOf('='); return { name: c.slice(0, i), value: c.slice(i + 1), url }; });

async function startBoard(workerIndex) {
  const port = 4100 + workerIndex * 10, dav = port + 1, album = port + 2, weather = port + 3;
  const url = `http://127.0.0.1:${port}`;
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fcp-e2e-'));
  const servers = [await require('../mock-caldav').start(dav), await require('../mock-album').start(album), await fakeWeather(weather)];
  const proc = spawn(process.execPath, [path.join(ROOT, 'server', 'chalkboard.js')], {
    env: { ...process.env, NODE_ENV: 'test', PORT: String(port), BIND: '127.0.0.1', DATA_DIR: data, TIMEZONE: 'America/New_York', TRASH_DAY: '2',
      BOARD_TITLE: 'Test Family', CALDAV_URL: `http://127.0.0.1:${dav}/`, CALDAV_USER: 'u', CALDAV_PASSWORD: 'p', CALDAV_CALENDAR: 'Family',
      PHOTO_ALBUM_URL: 'https://photos.icloud.com/shared/album/0d3TESTALBUMxyz', PHOTO_CK_HOST: `http://127.0.0.1:${album}`,
      LATITUDE: '40.79', LONGITUDE: '-77.86', WEATHER_URL: `http://127.0.0.1:${weather}` },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let log = ''; proc.stdout.on('data', d => { log += d; }); proc.stderr.on('data', d => { log += d; });
  await waitUp(url + '/api/today');
  const adm = await makeAdmin(url, data);
  const admin = client(url, adm.cookie);
  await admin.post('/api/photos/sync', {});
  // no overnight slideshow over the tests (it has its own test, with a night-time clock)
  await admin.post('/api/photos/settings', { night: false });
  // an editor, like a parent's own tablet: invited, password + authenticator code
  const H = { 'Content-Type': 'application/json', 'X-Chalk': '1' };
  const inv = await (await admin.post('/api/users/invite', { username: 'parent', name: 'Parent', role: 'editor' })).json();
  const join = await (await fetch(url + '/api/account/join', { method: 'POST', headers: H, body: JSON.stringify({ invite: inv.link.split('#')[1], password: 'another long password' }) })).json();
  const enr = await fetch(url + '/api/account/enroll', { method: 'POST', headers: H, body: JSON.stringify({ enroll: join.enroll, code: totpNow(join.secret) }) });
  if (!enr.ok) throw new Error('editor sign-up failed: ' + (await enr.text()));
  const editorCookie = cookiesOf(enr);

  // a paired screen: 'view' (wall), 'family', or 'kid:<personId>'. One per kind, reused (the board
  // allows 10 new pairings per address every 10 minutes).
  const paired = {};
  const pairScreen = role => paired[role] || (paired[role] = pairNew(role));
  async function pairNew(role, name = role) {
    const r = await fetch(url + '/api/pair/start', { method: 'POST', headers: { 'X-Chalk': '1', 'User-Agent': ANDROID_UA } });
    if (!r.ok) throw new Error('pairing failed: ' + (await r.text()));
    const pairCookie = (r.headers.get('set-cookie') || '').split(';')[0], { code } = await r.json();
    const ok = await admin.post('/api/devices/approve', { code, name, role });
    if (!ok.ok) throw new Error('approve failed: ' + (await ok.text()));
    const s = await fetch(url + '/api/pair/status', { headers: { cookie: pairCookie } });
    return s.headers.getSetCookie()[0].split(';')[0];
  }
  return {
    url, data, admin, adm, editorCookie, editor: client(url, editorCookie), log: () => log, pairScreen,
    stop() { proc.kill(); servers.forEach(s => s.close()); fs.rmSync(data, { recursive: true, force: true }); }
  };
}

const test = base.test.extend({
  // one board per worker, shared by its tests
  board: [async ({}, use, info) => { const b = await startBoard(info.workerIndex); await use(b); b.stop(); }, { scope: 'worker' }],
  // open the board as a kind of screen: 'tablet' (a signed-in editor), 'admin' (the admin's tablet), 'wall', 'family',
  // 'kid:<personId>', 'phone' (an editor's phone), 'phone-signed-out'
  as: async ({ browser, board }, use) => {
    const opened = [];
    await use(async (kind, opts = {}) => {
      const phone = kind.startsWith('phone');
      const ctx = await browser.newContext({
        ...(phone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true } : { viewport: { width: 1180, height: 820 } }),
        hasTouch: true, userAgent: ANDROID_UA, timezoneId: 'America/New_York', ...opts.context
      });
      opened.push(ctx);
      if (kind === 'tablet' || kind === 'phone') await ctx.addCookies(toCookies(board.editorCookie, board.url));
      else if (kind === 'admin') await ctx.addCookies(toCookies(board.adm.cookie, board.url));
      else if (kind !== 'phone-signed-out') await ctx.addCookies(toCookies(await board.pairScreen(kind === 'wall' ? 'view' : kind), board.url));
      const page = await ctx.newPage();
      page.errors = [];
      page.on('pageerror', e => page.errors.push(e.message));
      page.on('dialog', d => d.accept());   // "Are you sure?" -> yes
      if (opts.time) await page.clock.setFixedTime(opts.time);   // the screen's clock (the board's own "today" comes from the server)
      const path = opts.path || (kind === 'tablet' || kind === 'admin' || kind === 'family' ? '/edit' : kind.startsWith('phone') ? '/chores' : '/');
      await page.goto(board.url + path);
      await page.waitForFunction(() => document.fonts && document.fonts.status === 'loaded');
      if (opts.settle !== false) await page.waitForTimeout(1200);   // month, art, photos and weather arrive
      return page;
    });
    for (const c of opened) await c.close();
  }
});

// this month as the board shows it
function thisMonth() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  return { ym, name: d.toLocaleString('en-US', { month: 'long' }), day: d.getDate(), date: `${ym}-${String(d.getDate()).padStart(2, '0')}` };
}

module.exports = { test, expect: base.expect, thisMonth };
