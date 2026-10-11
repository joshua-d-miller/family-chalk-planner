// Google Photos shared album as the photo source (mock Google on localhost).
const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 3994, DAV = 5995, GP = 5996, PIN = '2468';
const base = `http://127.0.0.1:${PORT}`;
let server, dav, gp, data, token;
const api = (p, opts = {}) => fetch(base + p, opts);
const post = (p, body) => api(p, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Chalk-Token': token }, body: JSON.stringify(body) });

test.before(async () => {
  dav = await require('./mock-caldav').start(DAV);
  gp = await require('./mock-gphotos').start(GP);
  data = fs.mkdtempSync(path.join(os.tmpdir(), 'fcp-gp-'));
  server = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'chalkboard.js')], {
    env: { ...process.env, PORT: String(PORT), BIND: '127.0.0.1', DATA_DIR: data, CHALK_PIN: PIN,
      CALDAV_URL: `http://127.0.0.1:${DAV}/`, CALDAV_USER: 'u', CALDAV_PASSWORD: 'p', CALDAV_CALENDAR: 'Family',
      PHOTO_ALBUM_URL: `http://127.0.0.1:${GP}/s/short`, PHOTO_GOOGLE_HOST: `http://127.0.0.1:${GP}` },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  for (let i = 0; i < 50; i++) { try { if ((await api('/api/today')).ok) break; } catch {} await new Promise(r => setTimeout(r, 200)); }
  token = (await (await api('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: PIN }) })).json()).token;
});
test.after(() => { server && server.kill(); dav && dav.close(); gp && gp.close(); fs.rmSync(data, { recursive: true, force: true }); });

test('Google album: follows the short link, reads every page, skips video, newest first', async () => {
  const r = await (await post('/api/photos/sync', {})).json();
  assert.equal(r.error, null);
  assert.equal(r.photos, 3);
  const list = (await (await api('/api/photos')).json()).photos;
  assert.deepEqual(list.map(p => p.w + 'x' + p.h), ['1536x2048', '2048x1536', '2048x1536']);   // b (2026), c (2024), a (2024)
  assert.ok(list.every(p => /^g[0-9a-f]{23}$/.test(p.id)));
});

test('Google album: a photo served as WebP is fetched again as JPEG', async () => {
  const list = (await (await api('/api/photos')).json()).photos;
  for (const p of list) {
    const img = await api('/api/photos/img/' + p.id);
    assert.equal(img.status, 200);
    const b = Buffer.from(await img.arrayBuffer());
    assert.equal(b[0], 0xff); assert.equal(b[1], 0xd8);
  }
});

test('Google album: a photo removed from the album leaves the board', async () => {
  gp.close();
  gp = await require('./mock-gphotos').start(GP, { drop: 'c' });
  const r = await (await post('/api/photos/sync', {})).json();
  assert.equal(r.error, null);
  assert.equal(r.photos, 2);
});
