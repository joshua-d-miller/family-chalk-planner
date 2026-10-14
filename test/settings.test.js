// Admin console → ⚙️ Board: settings saved in the database override .env, passwords encrypted,
// saving restarts the board.
const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { makeAdmin, client } = require('./helpers');

const PORT = 3996, DAV = 5996, GEO = 5997;
const base = `http://127.0.0.1:${PORT}`;
let server, dav, geo, data, admin, exitCode;

function start() {
  exitCode = null;
  server = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'chalkboard.js')], {
    env: { ...process.env, PORT: String(PORT), BIND: '127.0.0.1', DATA_DIR: data, TIMEZONE: 'America/New_York', BOARD_TITLE: 'From env',
      CALDAV_URL: `http://127.0.0.1:${DAV}/`, CALDAV_USER: 'u', CALDAV_PASSWORD: 'p', CALDAV_CALENDAR: 'Family', GEOCODE_URL: `http://127.0.0.1:${GEO}` },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.on('exit', c => { exitCode = c; });
}
async function ready() { for (let i = 0; i < 50; i++) { try { if ((await fetch(base + '/api/whoami')).ok) return; } catch {} await new Promise(r => setTimeout(r, 200)); } }

test.before(async () => {
  dav = await require('./mock-caldav').start(DAV);
  geo = http.createServer((req, res) => res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ results: [{ name: 'State College', admin1: 'Pennsylvania', country: 'United States', latitude: 40.79339, longitude: -77.86, timezone: 'America/New_York' }] }))).listen(GEO, '127.0.0.1');
  data = fs.mkdtempSync(path.join(os.tmpdir(), 'fcp-set-'));
  start(); await ready();
  admin = client(base, (await makeAdmin(base, data)).cookie);
});
test.after(() => { server && server.kill(); dav && dav.close(); geo && geo.close(); fs.rmSync(data, { recursive: true, force: true }); });

test('settings show where each value comes from; secrets are never sent', async () => {
  const d = await (await admin.api('/api/board-settings')).json();
  assert.equal(d.fields.BOARD_TITLE.source, 'env'); assert.equal(d.fields.BOARD_TITLE.env, 'From env');
  assert.equal(d.fields.CALDAV_PASSWORD.set, true); assert.equal(d.fields.CALDAV_PASSWORD.value, undefined); assert.equal(d.fields.CALDAV_PASSWORD.env, undefined);
  assert.ok(d.timezones.includes('America/New_York'));
  assert.doesNotMatch(JSON.stringify(d), /"p"/);
});

test('bad values are refused with a reason', async () => {
  const r = await admin.post('/api/board-settings', { values: { TIMEZONE: 'Mars/Base', LATITUDE: '200', PHOTO_ALBUM_URL: 'javascript:alert(1)', BOARD_TITLE: 'x\nEVIL=1' } });
  assert.equal(r.status, 400);
  assert.deepEqual(Object.keys((await r.json()).errors).sort(), ['BOARD_TITLE', 'LATITUDE', 'PHOTO_ALBUM_URL', 'TIMEZONE']);
});

test('find my calendars and town search', async () => {
  assert.deepEqual((await (await admin.post('/api/board-settings/caldav-test', {})).json()).calendars, ['Family', 'Kids'], 'saved password');
  const bad = await admin.post('/api/board-settings/caldav-test', { url: `http://127.0.0.1:${DAV}/nope/`, user: 'u', password: 'x' });
  assert.equal(bad.status, 400);
  const g = await (await admin.api('/api/board-settings/geocode?q=state%20college')).json();
  assert.deepEqual(g.places[0], { name: 'State College, Pennsylvania, United States', lat: 40.7934, lon: -77.86, timezone: 'America/New_York' });
});

test('saving restarts the board; the console wins over .env; passwords are encrypted at rest', async () => {
  const r = await (await admin.post('/api/board-settings', { values: { BOARD_TITLE: 'Millers', CALDAV_PASSWORD: 'super-secret-app-pw', TEMP_UNIT: 'celsius' } })).json();
  assert.equal(r.restarting, true); assert.deepEqual(r.changed.sort(), ['BOARD_TITLE', 'CALDAV_PASSWORD', 'TEMP_UNIT']);
  for (let i = 0; i < 30 && exitCode === null; i++) await new Promise(res => setTimeout(res, 100));
  assert.equal(exitCode, 3, 'exits so the service manager restarts it');
  start(); await ready();
  assert.match(await (await admin.api('/edit')).text(), /<title>Millers<\/title>/);
  const d = await (await admin.api('/api/board-settings')).json();
  assert.equal(d.fields.BOARD_TITLE.source, 'console'); assert.equal(d.fields.CALDAV_PASSWORD.source, 'console');
  const db = new DatabaseSync(path.join(data, 'chalkboard.db'), { readOnly: true });
  const raw = db.prepare("SELECT data FROM kv WHERE key = 'settings'").get().data; db.close();
  assert.doesNotMatch(raw, /super-secret-app-pw/); assert.match(raw, /"CALDAV_PASSWORD":"k1:/);
  assert.equal((fs.statSync(path.join(data, 'secret.key')).mode & 0o777).toString(8), '600');
  // the encrypted password works: the board can reach the calendar with it (the mock takes any password)
  assert.deepEqual((await (await admin.post('/api/board-settings/caldav-test', {})).json()).calendars, ['Family', 'Kids']);
  // nothing changed = no restart; empty = back to .env
  assert.equal((await (await admin.post('/api/board-settings', { values: { BOARD_TITLE: 'Millers' } })).json()).restarting, false);
  const log = (await (await admin.api('/api/security')).json()).log.find(e => e.event === 'settings.changed');
  assert.ok(log && /BOARD_TITLE/.test(log.detail) && !/super-secret/.test(JSON.stringify(log)));
});

test('a lost key only means entering the password again', async () => {
  server.kill(); await new Promise(r => setTimeout(r, 300));
  fs.writeFileSync(path.join(data, 'secret.key'), 'a-different-key\n');
  start(); await ready();
  const d = await (await admin.api('/api/board-settings')).json();
  assert.deepEqual(d.lost, ['CALDAV_PASSWORD']);
  assert.match(await (await admin.api('/edit')).text(), /<title>Millers<\/title>/, 'everything else still applies');
});

test('more calendars, calendar links, Monday weeks, 24-hour time, other holidays', async () => {
  const kidsUrl = `http://127.0.0.1:${DAV}/1/calendars/kids/`;
  const r = await (await admin.post('/api/board-settings', { values: {
    EXTRA_CALENDARS: JSON.stringify([{ id: kidsUrl, name: 'Kids', color: '#7FD1C7' }, { id: 'https://evil.example/cal/', name: 'Elsewhere', color: '#000000' }]),
    ICS_FEEDS: JSON.stringify([{ name: 'School', url: `http://127.0.0.1:${DAV}/feeds/school.ics`, color: '#9CC9E6' }, { name: 'Broken', url: `http://127.0.0.1:${DAV}/feeds/broken.ics`, color: '#F26B6B' }]),
    WEEK_START: 'monday', TIME_FORMAT: '24h', HOLIDAYS: 'gb' } })).json();
  assert.equal(r.restarting, true);
  for (let i = 0; i < 30 && exitCode === null; i++) await new Promise(res => setTimeout(res, 100));
  start(); await ready();
  const m = await (await admin.api('/api/month?ym=2026-10')).json();
  assert.equal(m.grid.weekStart, 1); assert.equal(m.grid.start, '2026-09-28', 'October 2026 starts on a Thursday: the grid starts Monday Sep 28');
  const swim = m.events.find(e => e.title === 'Swim lessons');
  assert.ok(swim && swim.cal === 'Kids' && swim.calColor === '#7FD1C7' && swim.ref && !swim.readOnly, 'second calendar, editable');
  assert.equal(swim.time, '18:00');
  const pd = m.events.find(e => e.title === 'No school - teacher day');
  assert.ok(pd && pd.readOnly && pd.cal === 'School' && !pd.ref, 'calendar link, read-only');
  assert.ok(!m.events.some(e => e.title === 'Long ago'));
  assert.ok(m.events.some(e => e.holiday && e.title === 'Bonfire Night') === false, 'Bonfire Night is in November');
  assert.ok(m.events.some(e => e.holiday && e.title === 'Halloween'));
  assert.ok(!m.events.some(e => e.title === "Indigenous Peoples' Day"), 'no US holidays');
  assert.ok(!m.events.some(e => e.cal === 'Elsewhere'), 'the account password never goes to another server');
  const st = await (await admin.api('/api/board-settings')).json();
  assert.match(st.problems.Broken, /isn’t a calendar/); assert.match(st.problems.Elsewhere, /same calendar account/);
  // editing an event on the second calendar works; a link's events have nothing to edit
  const up = await admin.post('/api/events/update', { ref: swim.ref, scope: 'one', title: 'Swim lessons (pool B)', date: '2026-10-14', allDay: false, time: '18:00', minutes: 60 });
  assert.equal(up.status, 200, await up.clone().text());
  const m2 = await (await admin.api('/api/month?ym=2026-10')).json();
  assert.ok(m2.events.some(e => e.title === 'Swim lessons (pool B)' && e.cal === 'Kids'));
});

test('only admins see or change settings', async () => {
  const anon = client(base, '');
  assert.equal((await anon.api('/api/board-settings')).status, 401);
  assert.equal((await anon.post('/api/board-settings', { values: { BOARD_TITLE: 'x' } })).status, 401);
});
