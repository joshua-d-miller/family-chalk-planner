/*
===============================================================================
 Family Chalk Planner | Tests | smoke.test.ts
===============================================================================
 Version:   1.2.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Updated:   2026-11-21

 Purpose:
     End-to-end smoke test: real server + mock CalDAV + mock photo album,
     all on localhost.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.1.0     2026-10-11   joshua    Standalone service, installer, updater,
                        claude    tests.

 0.3.0     2026-10-13   joshua    Admin console, paired screens, sign-in with
                        claude    passkeys or password + authenticator.

 0.4.0     2026-10-13   joshua    Board backgrounds: black slate, green and
                        claude    blue chalkboard, cork, kraft paper,
                                  whiteboard.

 0.4.1     2026-10-13   joshua    Real clipart (Fluent Emoji, MIT); no zoom on
                        claude    family screens.

 0.4.4     2026-10-14   joshua    Bundled fonts, stricter page protections,
                        claude    HTTPS/proxy warnings, media tidy-up,
                                  releases.

 0.8.0     2026-10-14   joshua    Four new backgrounds, optional seasonal
                        claude    pattern, plainer console fonts.

 0.9.0     2026-10-16   joshua    Kids pick which piece goes in their reward
                        claude    jar; jars remember every piece in order.

 0.10.0    2026-10-23   joshua    Event size on the board (Large / Extra
                        claude    large), XL month title, tap a day to see its
                                  events.

 0.11.0    2026-10-28   joshua    Holiday borders around the calendar; chalk
                        claude    drawings (hand-picked Game Icons, CC BY 3.0)
                                  in any color.

 0.12.1    2026-10-28   joshua    Art moves with the days when a border is
                        claude    added, resized or removed; XL title fits
                                  above the calendar.

 0.12.2    2026-10-29   joshua    Hide holidays (tap a holiday for the list);
                        claude    tapping an event in a day's list opens it
                                  again.

 0.13.0    2026-11-07   joshua    Server and tests are all TypeScript (ES
                        claude    modules).
                        colby
                                  Settings (new screen), and an emoji font
                                  Chrome-based tablets can show.

 0.14.0    2026-11-07   joshua    The other picture styles are unpacked and
                        claude    served.

 0.15.1    2026-11-10   joshua    The month without its calendar.
                        claude

 0.16.0    2026-11-11   joshua    Birthdays; turned pictures; a month's own
                        claude    colors; the garland set.

 0.17.0    2026-11-14   joshua    Weather and food pictures; the rest of the
                        claude    chalk drawings (not the ones that aren't for
                                  a family board); OpenMoji in chalk white.

 1.1.0    2026-11-17   joshua    Countdown pictures, every countdown, sleeps
                        claude    or days; the new backgrounds and a photo
                                  background.

 1.1.2    2026-11-20   joshua    A month's own background.
                        claude

 1.2.0    2026-11-21   joshua    Where each screen's 🗓️ Week starts; hiding
                        claude    the − / + / Fit buttons; Split View.
===============================================================================
*/

import test from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 3992,
  DAV = 5992,
  ALBUM = 5993,
  PIN = '2468';
const base = `http://127.0.0.1:${PORT}`;
let server,
  dav,
  album,
  data,
  cookie = '';
import { pairAdmin, client } from './helpers.ts';
import * as mockAlbum from './mock-album.ts';
import * as mockCaldav from './mock-caldav.ts';
const { api, post } = client(base, () => cookie);

test.before(async () => {
  dav = await mockCaldav.start(DAV);
  album = await mockAlbum.start(ALBUM);
  data = fs.mkdtempSync(path.join(os.tmpdir(), 'fcp-'));
  server = spawn(process.execPath, [path.join(import.meta.dirname, '..', 'server', 'chalkboard.js')], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(PORT),
      BIND: '127.0.0.1',
      DATA_DIR: data,
      TIMEZONE: 'America/New_York',
      TRASH_DAY: '2',
      CALDAV_URL: `http://127.0.0.1:${DAV}/`,
      CALDAV_USER: 'u',
      CALDAV_PASSWORD: 'p',
      CALDAV_CALENDAR: 'Family',
      CHALK_PIN: PIN,
      PHOTO_ALBUM_URL: 'https://photos.icloud.com/shared/album/0d3TESTALBUMxyz',
      PHOTO_CK_HOST: `http://127.0.0.1:${ALBUM}`,
      BOARD_TITLE: 'Test <Family>'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(base + '/api/whoami')).ok) break;
    } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
});
test.after(() => {
  server && server.kill();
  dav && dav.close();
  album && album.close();
  fs.rmSync(data, { recursive: true, force: true });
});

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
  assert.equal((await post('/api/evsize', { ref: { href: add.href }, size: 'xl' })).status, 200, 'a big day');
  assert.equal((await post('/api/evsize', { ref: { href: add.href }, size: 'huge' })).status, 400);
  ev = (await (await api('/api/month?ym=2026-10')).json()).events.find(e => e.title === 'Smoke test');
  assert.equal(ev.size, 'xl');
  assert.equal((await post('/api/evsize', { ref: { href: add.href }, size: null })).status, 200);
  ev = (await (await api('/api/month?ym=2026-10')).json()).events.find(e => e.title === 'Smoke test');
  assert.equal(ev.size, undefined, 'back to normal');
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
  const five = Array.from({ length: 5 }, (_, i) => ({
    id: 'k' + i,
    name: 'Kid ' + i,
    pieces: ['star'],
    count: 1,
    goal: 10
  }));
  const saved = await (await post('/api/jars', { jars: five })).json();
  assert.equal(saved.length, 4);
});

test('chalk drawings and holiday borders', async () => {
  const groups = await (await api('/api/clip/drawings')).json();
  assert.ok(groups.Halloween.includes('gi-mummy-head') && groups.Halloween.includes('gi-witch-face'));
  let r = await api('/api/clip/gi-mummy-head.svg');
  assert.equal(r.status, 200);
  assert.match(await r.text(), /color="#EDEAE0"/, 'chalk white by default');
  r = await api('/api/clip/gi-pumpkin--f2a35e.svg');
  assert.match(await r.text(), /color="#f2a35e"/, 'any color');
  assert.equal((await api('/api/clip/gi-guillotine.svg')).status, 404, 'none that aren’t for a family board');
  assert.equal((await api('/api/clip/gi-farm-tractor.svg')).status, 200, 'the rest of the set is in');
  // the other picture styles: unpacked in the background, then listed and served from disk
  let styles: { prefix: string; count: number }[] = [];
  for (let i = 0; i < 120 && !(styles.length && styles.every(s => s.count > 0)); i++) {
    await new Promise(r => setTimeout(r, 500));
    styles = await (await api('/api/clip/styles')).json();
  }
  assert.deepEqual(
    styles.map(s => s.prefix),
    ['se', 'no', 'om', 'tw', 'fx', 'eo', 'ip', 'mc', 'ic', 'oc', 'cp']
  );
  assert.ok(
    styles.filter(s => !['cp', 'mc', 'ic'].includes(s.prefix)).every(s => s.count > 500),
    'every style unpacked'
  );
  assert.ok(styles.find(s => s.prefix === 'mc')!.count > 400, 'weather');
  assert.ok(styles.find(s => s.prefix === 'ic')!.count > 100, 'food');
  // OpenMoji's black outlines: chalk white, so they show on the board
  const om = await (await api('/api/clip/om-turkey.svg')).text();
  assert.ok(!/stroke="#000"/i.test(om) && /#EDEAE0/.test(om), 'chalk-white outlines');
  // the board's own: garlands and trims, a garland long and thin
  assert.equal(styles.find(s => s.prefix === 'cp')!.count, 46);
  assert.match(await (await api('/api/clip/cp-bulb-red.svg')).text(), /<animate /, 'the lights twinkle');
  const garland = await (await api('/api/clip/cp-garland-lights.svg')).text();
  assert.match(garland, /width="256" height="\d+"/);
  assert.ok(Number(/height="(\d+)"/.exec(garland)![1]) < 100, 'long and thin');
  const noto = await (await api('/api/clip/list?style=no')).json();
  assert.ok(noto.includes('no-jack-o-lantern'));
  r = await api('/api/clip/no-jack-o-lantern.svg');
  assert.equal(r.status, 200);
  assert.match(await r.text(), /^<svg /);
  assert.equal((await api('/api/clip/no-..%2Fetc.svg')).status, 404);
  // a border every October, a different one just for 2026-10, and none in 2027-10
  const halloween = {
    items: ['jack-o-lantern', 'gi-bat', 'gi-mummy-head', 'gi-vampire-dracula', 'nope'],
    color: '#f2d479',
    size: 'l'
  };
  let m = await (await post('/api/border', { ym: '2026-10', border: halloween, yearly: true })).json();
  assert.deepEqual(m.border, {
    items: ['jack-o-lantern', 'gi-bat', 'gi-mummy-head', 'gi-vampire-dracula'],
    color: '#F2D479',
    size: 'l'
  });
  assert.equal(m.borderYearly, true);
  m = await (await api('/api/meta?ym=2027-10')).json();
  assert.equal(m.border.items[0], 'jack-o-lantern', 'comes back next October');
  m = await (await post('/api/border', { ym: '2027-10', border: null })).json();
  assert.equal(m.border, undefined, 'none in 2027 only');
  assert.equal((await (await api('/api/meta?ym=2028-10')).json()).border.size, 'l');
  await post('/api/meta', { ym: '2026-10', hideTitle: false });
  assert.ok((await (await api('/api/meta?ym=2026-10')).json()).border, 'saving the title keeps the border');
  assert.equal((await post('/api/border', { ym: '2026-10', border: { items: ['nope'] } })).status, 400);
  await post('/api/border', { ym: '2026-10', border: null, yearly: true });
  assert.equal((await (await api('/api/meta?ym=2028-10')).json()).border, undefined, 'yearly border removed');
});

test('art remembers the layout it was placed on and moves once when the border changes', async () => {
  const ym = '2031-03';
  const id = (await (await post('/api/art', { ym, stroke: { c: '#EDEAE0', w: 4, p: [300, 300, 320, 320] } })).json())
    .id;
  const m = await (await api('/api/meta?ym=' + ym)).json();
  assert.equal(m.artPad, 0, 'placed with no border');
  await post('/api/border', { ym, border: { items: ['jack-o-lantern'], size: 'm' } });
  let r = await post('/api/art/relayout', { ym, padFrom: 0, padTo: 40, items: [] });
  assert.equal(r.status, 409, 'must match the border the month has');
  r = await post('/api/art/relayout', {
    ym,
    padFrom: 0,
    padTo: 32,
    items: [{ id, c: '#EDEAE0', w: 4, p: [310, 310, 328, 328] }]
  });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).moved, 1);
  assert.deepEqual((await (await api('/api/art?ym=' + ym)).json())[0].p, [310, 310, 328, 328]);
  assert.equal((await (await api('/api/meta?ym=' + ym)).json()).artPad, 32);
  r = await post('/api/art/relayout', { ym, padFrom: 0, padTo: 32, items: [] });
  assert.equal(r.status, 409, "a second screen doesn't move it again");
  await post('/api/meta', { ym, hideTitle: true });
  assert.equal((await (await api('/api/meta?ym=' + ym)).json()).artPad, 32, 'saving the title keeps it');
  // a month whose first art goes on with a border already there
  await post('/api/border', { ym: '2031-04', border: { items: ['jack-o-lantern'], size: 's' } });
  await post('/api/art', { ym: '2031-04', stroke: { c: '#EDEAE0', w: 4, p: [1, 1, 2, 2] } });
  assert.equal((await (await api('/api/meta?ym=2031-04')).json()).artPad, 26);
  await post('/api/art/clear', { ym: '2031-04' });
  await post('/api/border', { ym: '2031-04', border: null });
  await post('/api/art', { ym: '2031-04', stroke: { c: '#EDEAE0', w: 4, p: [1, 1, 2, 2] } });
  assert.equal((await (await api('/api/meta?ym=2031-04')).json()).artPad, 0, 'wiping the month starts over');
});

test('jars remember which piece went in, in order', async () => {
  const jar = { id: 'kid', name: 'Nora', pieces: ['star', 'heart', 'rainbow'], goal: 10 };
  let [j] = await (
    await post('/api/jars', { jars: [{ ...jar, count: 3, items: ['rainbow', 'rainbow', 'heart'] }] })
  ).json();
  assert.deepEqual(j.items, ['rainbow', 'rainbow', 'heart'], 'the pieces the kids asked for');
  [j] = await (await post('/api/jars', { jars: [{ ...jar, count: 5 }] })).json();
  assert.deepEqual(
    j.items,
    ['rainbow', 'rainbow', 'heart', 'star', 'heart'],
    'an older page (no items) keeps them and fills in the rotation'
  );
  [j] = await (
    await post('/api/jars', { jars: [{ ...jar, count: 2, items: ['bolt', 'nope', 'critter', 'star'] }] })
  ).json();
  assert.deepEqual(j.items, ['bolt', 'critter'], 'only known pieces, never more than the count');
  [j] = await (
    await post('/api/jars', { jars: [{ id: 'old', name: 'Theo', pieces: ['star', 'heart'], count: 3, goal: 10 }] })
  ).json();
  assert.deepEqual(j.items, ['star', 'heart', 'star'], 'a jar from before looks the same as it did');
  await post('/api/jars', { jars: [] });
});

test('clipart (Fluent Emoji) is served by the board and can be placed', async () => {
  const names = await (await api('/api/clip/list')).json();
  assert.ok(names.length > 3000 && names.includes('jack-o-lantern'));
  const r = await api('/api/clip/jack-o-lantern.svg');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /svg/);
  assert.match(await r.text(), /^<svg /);
  assert.equal((await api('/api/clip/not-a-picture.svg')).status, 404);
  const { ids } = await (
    await post('/api/art/bulk', {
      ym: '2026-10',
      items: [
        { k: 'g', x: 10, y: 10, w: 96, h: 96, src: '/api/clip/ghost.svg', still: '/api/clip/ghost.svg', mode: 'still' },
        { k: 'g', x: 10, y: 10, w: 96, h: 96, src: '/api/clip/../media/x.svg' }
      ]
    })
  ).json();
  assert.ok(ids[0] > 0);
  assert.equal(ids[1], null);
});

test('fonts come from the board itself; board pages allow nothing from elsewhere', async () => {
  const css = await (await api('/fonts.css')).text();
  assert.match(css, /font-family: 'Kalam'/);
  // relative, so they work wherever the board is served from (a Home Assistant sidebar)
  assert.match(css, /url\(fonts\/kalam\/files\/kalam-latin-700-normal\.woff2\)/);
  // the emoji: only a fallback, in the format Chrome-based tablets show
  assert.match(
    css,
    /font-family: 'Board Emoji'[\s\S]*url\(fonts\/noto-color-emoji\/files\/0\.woff2\) format\(woff2\);/
  );
  assert.doesNotMatch(css, /tech\(/);
  assert.equal((await api('/fonts/noto-color-emoji/files/0.woff2')).status, 200);
  assert.equal((await api('/fonts/kalam/files/kalam-latin-700-normal.woff2')).status, 200);
  assert.equal((await api('/fonts/kalam/files/..%2F..%2Fpackage.json')).status, 404);
  assert.equal((await api('/fonts/express/files/x.woff2')).status, 404);
  for (const p of ['/', '/edit', '/chores', '/settings', '/meals', '/classic', '/classic/edit']) {
    const r = await api(p),
      csp = r.headers.get('content-security-policy');
    assert.match(csp, /default-src 'self'/, p);
    assert.match(csp, /object-src 'none'/, p);
    assert.doesNotMatch(csp, /googleapis|gstatic/);
    assert.doesNotMatch(await r.text(), /fonts\.googleapis/);
    // the screens (React) run no inline scripts; only the board as it was needs them
    if (p.startsWith('/classic')) assert.match(csp, /script-src 'self' 'unsafe-inline'/, p);
    else assert.match(csp, /script-src 'self';/, p);
  }
});

test('unused pictures are tidied up; ones in use are kept', async () => {
  const up = async () =>
    (
      await (
        await api('/api/media', {
          method: 'POST',
          headers: { 'Content-Type': 'image/gif' },
          body: Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(30)])
        })
      ).json()
    ).src;
  const kept = await up(),
    stamped = await up(),
    orphan = await up();
  await post('/api/gifs/add', { src: kept, w: 1, h: 1 });
  await post('/api/art/bulk', {
    ym: '2026-10',
    items: [{ k: 'g', x: 1, y: 1, w: 20, h: 20, src: stamped, still: stamped }]
  });
  assert.equal((await (await post('/api/test/clean-media', { days: 0 })).json()).removed, 1);
  assert.equal((await api(kept)).status, 200);
  assert.equal((await api(stamped)).status, 200);
  assert.equal((await api(orphan)).status, 404);
});

test('theme is validated', async () => {
  const t = await (
    await post('/api/theme', { p: 'x<y', o: { numC: 'red;}', lineS: 'groove', evF: 'tall', todayS: 'heart' } })
  ).json();
  assert.deepEqual(t, { p: 'classic', o: { evF: 'tall', todayS: 'heart' } });
  assert.deepEqual(
    await (await post('/api/theme', { p: 'pastel', o: {}, s: 'white' })).json(),
    { p: 'pastel', o: {}, s: 'white' },
    'background kept'
  );
  assert.deepEqual(
    await (await post('/api/theme', { p: 'pastel', o: {}, s: 'url(x)' })).json(),
    { p: 'pastel', o: {} },
    'unknown background dropped'
  );
  assert.deepEqual(
    await (await post('/api/theme', { p: 'classic', o: {}, s: 'slate' })).json(),
    { p: 'classic', o: {} },
    'slate is the default'
  );
  assert.deepEqual(
    await (await post('/api/theme', { p: 'classic', o: {}, s: 'wood', z: 1 })).json(),
    { p: 'classic', o: {}, s: 'wood', z: 1 },
    'seasonal pattern kept'
  );
  assert.deepEqual(
    await (await post('/api/theme', { p: 'classic', o: {}, z: 'yes' })).json(),
    { p: 'classic', o: {} },
    'seasonal is off unless turned on'
  );
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
  const r = await api('/api/media', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: Buffer.from('not an image at all, just text')
  });
  assert.equal(r.status, 400);
});

test('holidays can be hidden (every year) and brought back', async () => {
  let d = await (await api('/api/holidays')).json();
  const ipd = d.holidays.find(h => h.title === "Indigenous Peoples' Day");
  assert.ok(ipd && !ipd.off);
  const has = async (ym, t) =>
    (await (await api('/api/month?ym=' + ym)).json()).events.some(e => e.holiday && e.title === t);
  assert.ok(await has('2026-10', "Indigenous Peoples' Day"));
  const r = await post('/api/holidays', { off: ["Indigenous Peoples' Day", 'Not a holiday'] });
  assert.deepEqual((await r.json()).off, ["Indigenous Peoples' Day"]);
  assert.equal(await has('2026-10', "Indigenous Peoples' Day"), false);
  assert.equal(await has('2027-10', "Indigenous Peoples' Day"), false, 'every year');
  assert.ok(await has('2026-10', 'Halloween'), 'the others stay');
  d = await (await api('/api/holidays')).json();
  assert.equal(d.holidays.find(h => h.title === "Indigenous Peoples' Day").off, true);
  await post('/api/holidays', { off: [] });
  assert.ok(await has('2026-10', "Indigenous Peoples' Day"), 'back again');
});

test('a turned picture keeps its turn; a month keeps its own colors', async () => {
  const r = await (
    await post('/api/art/bulk', {
      ym: '2026-12',
      items: [
        { k: 'g', src: '/api/clip/gi-mummy-head.svg', x: 300, y: 300, w: 90, h: 90, r: 35 },
        { k: 't', s: 'Hi', x: 200, y: 200, r: -190 }
      ]
    })
  ).json();
  const art = await (await api('/api/art?ym=2026-12')).json();
  assert.equal(art.find((x: { id: number }) => x.id === r.ids[0]).r, 35);
  assert.equal(art.find((x: { id: number }) => x.id === r.ids[1]).r, undefined, 'out of range: not turned');
  await post('/api/art/delete', { ym: '2026-12', ids: r.ids });
  // December's own day-box and number colors (the rest from the board style)
  let m = await (
    await post('/api/meta', { ym: '2026-12', look: { lineC: '#C62828', numC: '#A9D8A0', numF: 'x', bogus: '#000000' } })
  ).json();
  assert.deepEqual(m.look, { lineC: '#C62828', numC: '#A9D8A0' });
  m = await (await post('/api/meta', { ym: '2026-12', side: { mode: 'art' } })).json();
  assert.deepEqual(m.look, { lineC: '#C62828', numC: '#A9D8A0' }, 'kept when something else changes');
  assert.equal((await (await api('/api/meta?ym=2026-11')).json()).look, undefined, 'only December');
  // a background of its own (a photo only with one the board keeps)
  m = await (await post('/api/meta', { ym: '2026-12', look: { s: 'navy' } })).json();
  assert.deepEqual(m.look, { s: 'navy' });
  m = await (await post('/api/meta', { ym: '2026-12', look: { s: 'photo', img: 'https://example.com/x.jpg' } })).json();
  assert.equal(m.look, undefined, 'not a photo the board keeps');
  m = await (await post('/api/meta', { ym: '2026-12', look: { s: 'nope' } })).json();
  assert.equal(m.look, undefined);
  m = await (await post('/api/meta', { ym: '2026-12', look: null })).json();
  assert.equal(m.look, undefined);
});

test('birthdays: no cake and no countdown unless asked; a starred one counts down', async () => {
  const d = new Date(Date.now() + 5 * 864e5).toLocaleString('sv-SE', { timeZone: 'America/New_York' }).slice(0, 10);
  const add = await (await post('/api/events', { title: 'Amanda’s Bday', date: d, allDay: true })).json();
  const cd = async () => (await (await api('/api/countdowns')).json()) as { icon: string; title: string }[];
  const month = async () => await (await api('/api/month?ym=' + d.slice(0, 7))).json();
  assert.deepEqual(await (await api('/api/birthdays')).json(), { cake: false, countdown: false });
  assert.equal((await month()).cake, false);
  assert.ok(!(await cd()).some(c => /Amanda/.test(c.title)), 'no countdown without a star');
  // counting down to every birthday: a star, until the cake is on too
  await post('/api/birthdays', { countdown: true });
  assert.equal((await cd()).find(c => /Amanda/.test(c.title))?.icon, '⭐');
  await post('/api/birthdays', { cake: true });
  assert.equal((await cd()).find(c => /Amanda/.test(c.title))?.icon, '🎂');
  assert.equal((await month()).cake, true);
  // back off; starring this one counts it down by itself
  await post('/api/birthdays', { cake: false, countdown: false });
  const ev = (await month()).events.find((e: { title: string }) => /Amanda/.test(e.title));
  assert.equal((await post('/api/countdowns', { ref: ev.ref, on: true, title: ev.title, date: ev.start })).status, 200);
  assert.equal((await cd()).find(c => /Amanda/.test(c.title))?.icon, '⭐');
  // a picture of its own: on the countdown and on the event (for its day's badge)
  assert.equal(
    (await post('/api/countdowns', { ref: ev.ref, on: true, title: ev.title, date: ev.start, icon: '🎁' })).status,
    200
  );
  assert.equal((await cd()).find(c => /Amanda/.test(c.title))?.icon, '🎁');
  assert.equal((await month()).events.find((e: { title: string }) => /Amanda/.test(e.title)).cdIcon, '🎁');
  assert.equal(
    (await post('/api/countdowns', { ref: ev.ref, on: true, title: ev.title, date: ev.start, icon: 'x' })).status,
    400
  );
  // ?all=1: every one in the next 60 days, the starred ones marked
  const all = (await (await api('/api/countdowns?all=1')).json()) as { title: string; starred?: boolean }[];
  assert.ok(all.length >= (await cd()).length);
  assert.equal(all.find(c => /Amanda/.test(c.title))?.starred, true);
  await post('/api/events/delete', { ref: add.ref || { href: add.href }, scope: 'all', origDate: d });
});

test('backgrounds: the new ones, and a photo of your own only with a photo the board keeps', async () => {
  for (const sf of ['navy', 'burgundy', 'felt', 'brick', 'burlap', 'barn', 'graph']) {
    assert.equal((await (await post('/api/theme', { p: 'classic', s: sf })).json()).s, sf);
  }
  // a photo the board keeps: the background
  const up = await (
    await api('/api/media', {
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)])
    })
  ).json();
  const t = await (await post('/api/theme', { p: 'classic', s: 'photo', img: up.src })).json();
  assert.deepEqual([t.s, t.img], ['photo', up.src]);
  // anything else isn't a photo the board keeps: the slate
  const bad = await (await post('/api/theme', { p: 'classic', s: 'photo', img: 'https://example.com/x.jpg' })).json();
  assert.equal(bad.s, undefined);
  assert.equal(bad.img, undefined);
  // another background drops the photo
  assert.equal((await (await post('/api/theme', { p: 'classic', s: 'navy', img: up.src })).json()).img, undefined);
  await post('/api/theme', { p: 'classic' });
});

test('countdowns in sleeps or days: nothing saved until a screen picks, and the console sets any screen’s', async () => {
  assert.deepEqual(await (await api('/api/sleeps')).json(), { sleeps: null });
  assert.deepEqual(await (await post('/api/sleeps', { sleeps: true })).json(), { sleeps: true });
  assert.deepEqual(await (await api('/api/sleeps')).json(), { sleeps: true });
  assert.equal((await post('/api/sleeps', { sleeps: 'yes' })).status, 400);
  assert.deepEqual(await (await post('/api/sleeps', { sleeps: null })).json(), { sleeps: null });
  assert.deepEqual(await (await post('/api/devices/sleeps', { id: 'wall1', sleeps: true })).json(), { sleeps: true });
  assert.deepEqual((await (await api('/api/devices/sleeps')).json()).sleeps, { wall1: true });
  await post('/api/devices/sleeps', { id: 'wall1', sleeps: null });
});

test('🗓️ Week from today or the board’s first day: per screen, and the console sets any screen’s', async () => {
  assert.deepEqual(await (await api('/api/weekfrom')).json(), { from: 'board' });
  assert.deepEqual(await (await post('/api/weekfrom', { from: 'today' })).json(), { from: 'today' });
  assert.deepEqual(await (await api('/api/weekfrom')).json(), { from: 'today' });
  assert.equal((await post('/api/weekfrom', { from: 'monday' })).status, 400);
  assert.deepEqual(await (await post('/api/weekfrom', { from: 'board' })).json(), { from: 'board' });
  assert.deepEqual(await (await post('/api/devices/weekfrom', { id: 'wall1', from: 'today' })).json(), {
    from: 'today'
  });
  assert.deepEqual((await (await api('/api/devices/weekfrom')).json()).weekfrom, { wall1: 'today' });
  await post('/api/devices/weekfrom', { id: 'wall1', from: 'board' });
  assert.deepEqual((await (await api('/api/devices/weekfrom')).json()).weekfrom, {});
});

test('🗓️ Split View: per screen, what goes under the week, and the console sets any screen’s', async () => {
  assert.deepEqual(await (await api('/api/weekview')).json(), { split: false, a: 'photos', b: 'draw' });
  assert.deepEqual(await (await post('/api/weekview', { split: true, b: 'meals' })).json(), {
    split: true,
    a: 'photos',
    b: 'meals'
  });
  assert.equal((await post('/api/weekview', { a: 'everything' })).status, 400);
  // not the same thing twice: the right one is then nothing
  assert.equal((await (await post('/api/weekview', { a: 'meals' })).json()).b, 'none');
  await post('/api/weekview', { split: false, a: 'photos', b: 'draw' });
  assert.deepEqual(await (await post('/api/devices/weekview', { id: 'wall1', split: true })).json(), {
    split: true,
    a: 'photos',
    b: 'draw'
  });
  assert.deepEqual((await (await api('/api/devices/weekview')).json()).weekview, {
    wall1: { split: true, a: 'photos', b: 'draw' }
  });
  await post('/api/devices/weekview', { id: 'wall1', split: false });
  assert.deepEqual((await (await api('/api/devices/weekview')).json()).weekview, {});
});

test('the − / + / Fit buttons: shown until a screen hides them', async () => {
  assert.deepEqual(await (await api('/api/nozoom')).json(), { hide: false });
  assert.deepEqual(await (await post('/api/nozoom', { hide: true })).json(), { hide: true });
  assert.deepEqual(await (await api('/api/nozoom')).json(), { hide: true });
  assert.equal((await post('/api/nozoom', { hide: 'yes' })).status, 400);
  assert.deepEqual(await (await post('/api/nozoom', { hide: false })).json(), { hide: false });
});

test('Check connections: the calendar and the photos now, and a real round trip only when asked', async () => {
  type C = { name: string; ok: boolean | null; detail: string };
  let r = await (await post('/api/board-settings/check', {})).json();
  const by = (n: string) => (r.checks as C[]).find(c => c.name === n);
  assert.equal(by('Calendar')?.ok, true, by('Calendar')?.detail);
  assert.equal(by('Photos')?.ok, true, by('Photos')?.detail);
  assert.equal(by('Adding an event'), undefined, 'nothing added unless asked');
  r = await (await post('/api/board-settings/check', { write: true })).json();
  assert.equal(by('Adding an event')?.ok, true, by('Adding an event')?.detail);
  // the test event is gone again
  const y = new Date(Date.now() + 400 * 864e5).toISOString().slice(0, 7);
  const m = await (await api('/api/month?ym=' + y)).json();
  assert.ok(!m.events.some((e: { title: string }) => /Chalk Planner check/.test(e.title)));
  assert.equal(r.outage, null);
});

test('the calendar can’t be reached: the month still shows, with its holidays and the problem', async () => {
  dav.close();
  (dav as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
  const r = await api('/api/month?ym=2027-03');
  assert.equal(r.status, 200);
  const m = await r.json();
  assert.equal(m.grid.weeks >= 4, true);
  assert.ok(m.problem, 'says what went wrong');
  const ck = await (await post('/api/board-settings/check', {})).json();
  assert.equal(
    ck.checks.find((c: { name: string }) => c.name === 'Calendar').ok,
    false,
    'Check connections says so too'
  );
  assert.ok(
    m.events.some((e: { title: string }) => /Patrick/.test(e.title)),
    'holidays still show'
  );
});
