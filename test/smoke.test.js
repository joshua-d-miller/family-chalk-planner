// End-to-end smoke test: real server + mock CalDAV + mock photo album, all on localhost.
const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 3992, DAV = 5992, ALBUM = 5993, PIN = '2468';
const base = `http://127.0.0.1:${PORT}`;
let server, dav, album, data, token;
const api = (p, opts = {}) => fetch(base + p, opts);
const post = (p, body, tok = token) => api(p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(tok ? { 'X-Chalk-Token': tok } : {}) }, body: JSON.stringify(body) });

test.before(async () => {
  dav = await require('./mock-caldav').start(DAV);
  album = await require('./mock-album').start(ALBUM);
  data = fs.mkdtempSync(path.join(os.tmpdir(), 'fcp-'));
  server = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'chalkboard.js')], {
    env: { ...process.env, PORT: String(PORT), BIND: '127.0.0.1', DATA_DIR: data, TIMEZONE: 'America/New_York', TRASH_DAY: '2',
      CALDAV_URL: `http://127.0.0.1:${DAV}/`, CALDAV_USER: 'u', CALDAV_PASSWORD: 'p', CALDAV_CALENDAR: 'Family', CHALK_PIN: PIN,
      PHOTO_ALBUM_URL: 'https://photos.icloud.com/shared/album/0d3TESTALBUMxyz', PHOTO_CK_HOST: `http://127.0.0.1:${ALBUM}`, BOARD_TITLE: 'Test <Family>' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  for (let i = 0; i < 50; i++) { try { if ((await api('/api/today')).ok) break; } catch {} await new Promise(r => setTimeout(r, 200)); }
});
test.after(() => { server && server.kill(); dav && dav.close(); album && album.close(); fs.rmSync(data, { recursive: true, force: true }); });

test('page is served with the configured title (escaped)', async () => {
  const html = await (await api('/')).text();
  assert.match(html, /<title>Test Family<\/title>/);
  assert.match(html, /board-version/);
});

test('wrong PIN is refused, right PIN gives a token', async () => {
  assert.equal((await post('/api/auth', { pin: '0000' }, null)).status, 401);
  const r = await post('/api/auth', { pin: PIN }, null);
  assert.equal(r.status, 200);
  token = (await r.json()).token;
  assert.ok(token);
});

test('changes need the PIN token', async () => {
  assert.equal((await post('/api/meals', { items: [{ t: 'Tacos' }] }, null)).status, 401);
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

test('theme is validated', async () => {
  const t = await (await post('/api/theme', { p: 'x<y', o: { numC: 'red;}', lineS: 'groove', evF: 'tall', todayS: 'heart' } })).json();
  assert.deepEqual(t, { p: 'classic', o: { evF: 'tall', todayS: 'heart' } });
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
  const r = await api('/api/media', { method: 'POST', headers: { 'X-Chalk-Token': token, 'Content-Type': 'application/octet-stream' }, body: Buffer.from('not an image at all, just text') });
  assert.equal(r.status, 400);
});
