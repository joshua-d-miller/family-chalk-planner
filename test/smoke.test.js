// End-to-end smoke test: real server + mock CalDAV + mock photo album, all on localhost.
const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 3992, DAV = 5992, ALBUM = 5993, PIN = '2468';
const base = `http://127.0.0.1:${PORT}`;
let server, dav, album, data, cookie = '';
const { pairAdmin, client } = require('./helpers');
const { api, post } = client(base, () => cookie);

test.before(async () => {
  dav = await require('./mock-caldav').start(DAV);
  album = await require('./mock-album').start(ALBUM);
  data = fs.mkdtempSync(path.join(os.tmpdir(), 'fcp-'));
  server = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'chalkboard.js')], {
    env: { ...process.env, NODE_ENV: 'test', PORT: String(PORT), BIND: '127.0.0.1', DATA_DIR: data, TIMEZONE: 'America/New_York', TRASH_DAY: '2',
      CALDAV_URL: `http://127.0.0.1:${DAV}/`, CALDAV_USER: 'u', CALDAV_PASSWORD: 'p', CALDAV_CALENDAR: 'Family', CHALK_PIN: PIN,
      PHOTO_ALBUM_URL: 'https://photos.icloud.com/shared/album/0d3TESTALBUMxyz', PHOTO_CK_HOST: `http://127.0.0.1:${ALBUM}`, BOARD_TITLE: 'Test <Family>' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(base + '/api/whoami')).ok) break; } catch {} await new Promise(r => setTimeout(r, 200)); }
});
test.after(() => { server && server.kill(); dav && dav.close(); album && album.close(); fs.rmSync(data, { recursive: true, force: true }); });

test('page is served with the configured title (escaped)', async () => {
  const html = await (await api('/')).text();
  assert.match(html, /<title>Test Family<\/title>/);
  assert.match(html, /board-version/);
});

test('an unpaired device can neither read nor change; the setup code makes the first admin', async () => {
  assert.equal((await api('/api/month?ym=2026-10')).status, 401);
  assert.equal((await post('/api/meals', { items: [{ t: 'Tacos' }] })).status, 401);
  cookie = await pairAdmin(base, data);
  assert.equal((await post('/api/meals', { items: [{ t: 'Tacos' }] })).status, 200);
});

test('month view merges calendar events and holidays', async () => {
  const m = await (await api('/api/month?ym=2026-10')).json();
  const titles = m.events.map(e => e.title);
  assert.ok(titles.includes('Dentist'));
  assert.ok(titles.includes('Halloween'));
  assert.ok(m.events.filter(e => e.title === 'Piano').length >= 3, 'repeating event expands');
});

test('add, color and delete an event', async () => {
  const add = await (await post('/api/events', { title: 'Smoke test', date: '2026-10-21', allDay: true })).json();
  assert.ok(add.href);
  assert.equal((await post('/api/evcolor', { ref: { href: add.href }, color: '#2C64D6' })).status, 200);
  let ev = (await (await api('/api/month?ym=2026-10')).json()).events.find(e => e.title === 'Smoke test');
  assert.equal(ev.color, '#2C64D6');
  assert.equal((await post('/api/events/delete', { ref: ev.ref, scope: 'all', origDate: ev.start })).status, 200);
  ev = (await (await api('/api/month?ym=2026-10')).json()).events.find(e => e.title === 'Smoke test');
  assert.equal(ev, undefined);
});

test('extras: trash day from settings, weather off without a location', async () => {
  const x = await (await api('/api/extras')).json();
  assert.equal(x.trashDay, 2);
  assert.match(x.trash.label, /Tues|tonight|today/);
  assert.equal(x.weather, null);
});

test('jars start empty and allow up to 4', async () => {
  assert.deepEqual(await (await api('/api/jars')).json(), []);
  const five = Array.from({ length: 5 }, (_, i) => ({ id: 'k' + i, name: 'Kid ' + i, pieces: ['star'], count: 1, goal: 10 }));
  const saved = await (await post('/api/jars', { jars: five })).json();
  assert.equal(saved.length, 4);
});

test('clipart (Fluent Emoji) is served by the board and can be placed', async () => {
  const names = await (await api('/api/clip/list')).json();
  assert.ok(names.length > 3000 && names.includes('jack-o-lantern'));
  const r = await api('/api/clip/jack-o-lantern.svg');
  assert.equal(r.status, 200); assert.match(r.headers.get('content-type'), /svg/); assert.match(await r.text(), /^<svg /);
  assert.equal((await api('/api/clip/not-a-picture.svg')).status, 404);
  const { ids } = await (await post('/api/art/bulk', { ym: '2026-10', items: [
    { k: 'g', x: 10, y: 10, w: 96, h: 96, src: '/api/clip/ghost.svg', still: '/api/clip/ghost.svg', mode: 'still' },
    { k: 'g', x: 10, y: 10, w: 96, h: 96, src: '/api/clip/../media/x.svg' }] })).json();
  assert.ok(ids[0] > 0); assert.equal(ids[1], null);
});

test('fonts come from the board itself; board pages allow nothing from elsewhere', async () => {
  const css = await (await api('/fonts.css')).text();
  assert.match(css, /font-family: 'Kalam'/); assert.match(css, /url\(\/fonts\/kalam\/files\/kalam-latin-700-normal\.woff2\)/);
  assert.equal((await api('/fonts/kalam/files/kalam-latin-700-normal.woff2')).status, 200);
  assert.equal((await api('/fonts/kalam/files/..%2F..%2Fpackage.json')).status, 404);
  assert.equal((await api('/fonts/express/files/x.woff2')).status, 404);
  for (const p of ['/', '/edit']) {
    const r = await api(p), csp = r.headers.get('content-security-policy');
    assert.match(csp, /default-src 'self'/); assert.match(csp, /object-src 'none'/); assert.doesNotMatch(csp, /googleapis|gstatic/);
    assert.doesNotMatch(await r.text(), /fonts\.googleapis/);
  }
});

test('unused pictures are tidied up; ones in use are kept', async () => {
  const up = async () => (await (await api('/api/media', { method: 'POST', headers: { 'Content-Type': 'image/gif' }, body: Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(30)]) })).json()).src;
  const kept = await up(), stamped = await up(), orphan = await up();
  await post('/api/gifs/add', { src: kept, w: 1, h: 1 });
  await post('/api/art/bulk', { ym: '2026-10', items: [{ k: 'g', x: 1, y: 1, w: 20, h: 20, src: stamped, still: stamped }] });
  assert.equal((await (await post('/api/test/clean-media', { days: 0 })).json()).removed, 1);
  assert.equal((await api(kept)).status, 200); assert.equal((await api(stamped)).status, 200); assert.equal((await api(orphan)).status, 404);
});

test('theme is validated', async () => {
  const t = await (await post('/api/theme', { p: 'x<y', o: { numC: 'red;}', lineS: 'groove', evF: 'tall', todayS: 'heart' } })).json();
  assert.deepEqual(t, { p: 'classic', o: { evF: 'tall', todayS: 'heart' } });
  assert.deepEqual(await (await post('/api/theme', { p: 'pastel', o: {}, s: 'white' })).json(), { p: 'pastel', o: {}, s: 'white' }, 'background kept');
  assert.deepEqual(await (await post('/api/theme', { p: 'pastel', o: {}, s: 'url(x)' })).json(), { p: 'pastel', o: {} }, 'unknown background dropped');
  assert.deepEqual(await (await post('/api/theme', { p: 'classic', o: {}, s: 'slate' })).json(), { p: 'classic', o: {} }, 'slate is the default');
  assert.deepEqual(await (await post('/api/theme', { p: 'classic', o: {}, s: 'wood', z: 1 })).json(), { p: 'classic', o: {}, s: 'wood', z: 1 }, 'seasonal pattern kept');
  assert.deepEqual(await (await post('/api/theme', { p: 'classic', o: {}, z: 'yes' })).json(), { p: 'classic', o: {} }, 'seasonal is off unless turned on');
});

test('photo album sync caches photos, skips video and hidden', async () => {
  const r = await (await post('/api/photos/sync', {})).json();
  assert.equal(r.error, null);
  assert.equal(r.photos, 3);
  const list = (await (await api('/api/photos')).json()).photos;
  const img = await api('/api/photos/img/' + list[0].id);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/jpeg');
});

test('no path traversal through file routes', async () => {
  assert.equal((await api('/api/photos/img/..%2Fchalkboard.db')).status, 404);
  assert.equal((await api('/api/media/..%2F..%2Fchalkboard.db')).status, 404);
});

test('uploads must really be images', async () => {
  const r = await api('/api/media', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: Buffer.from('not an image at all, just text') });
  assert.equal(r.status, 400);
});
