/*
===============================================================================
 Family Chalk Planner | Tests | real-servers.test.ts
===============================================================================
 Version:   1.1.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-17
 Updated:   2026-11-17

 Purpose:
     The board against real servers instead of pretend ones, with no
     accounts anywhere: Radicale (a real CalDAV server, the protocol
     iCloud uses) and Immich (the real photo server, in Docker). Each part
     runs only when its server is given, so `npm test` stays quick:
       REAL_CALDAV_URL, REAL_CALDAV_USER, REAL_CALDAV_PASSWORD
       REAL_IMMICH_URL (a fresh Immich: the test signs up its admin)
     CI starts both (.github/workflows/ci.yml, "Real calendar and photo
     servers").

 Usage:
     bash test/real-servers/start-radicale.sh
     REAL_CALDAV_URL=http://127.0.0.1:5232/ REAL_CALDAV_USER=family \
       REAL_CALDAV_PASSWORD=secret node --test test/real-servers.test.ts
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.1.0    2026-11-17   joshua    New file.
                        claude
===============================================================================
*/

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { client, makeAdmin, startServer } from './helpers.ts';

const env = process.env;
const DAV = env.REAL_CALDAV_URL;
const IMMICH = env.REAL_IMMICH_URL?.replace(/\/+$/, '');
const thisMonth = () =>
  new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })).toISOString().slice(0, 10);
const plus = (d: string, n: number) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------------------------------- //
// | A real CalDAV server (Radicale) | //
// ----------------------------------- //
test('a real CalDAV calendar: found, read, and events added, changed and deleted', { skip: !DAV }, async () => {
  const user = env.REAL_CALDAV_USER || 'family';
  const pass = env.REAL_CALDAV_PASSWORD || 'secret';
  const auth = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
  // a calendar named Family (as a phone would make it)
  const home = new URL(`${user}/family-${Date.now()}/`, DAV).toString();
  const mk = await fetch(home, {
    method: 'MKCALENDAR',
    headers: { Authorization: auth, 'Content-Type': 'application/xml' },
    body: `<?xml version="1.0"?><C:mkcalendar xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><D:set><D:prop><D:displayname>Family</D:displayname></D:prop></D:set></C:mkcalendar>`
  });
  assert.ok([201, 200].includes(mk.status), `MKCALENDAR answered ${mk.status}`);

  const PORT = 3991;
  const board = await startServer(PORT, {
    CALDAV_URL: DAV!,
    CALDAV_USER: user,
    CALDAV_PASSWORD: pass,
    CALDAV_CALENDAR: 'Family'
  });
  try {
    assert.ok(board.up, board.output());
    const base = `http://127.0.0.1:${PORT}`;
    const ed = client(base, (await makeAdmin(base, board.data)).cookie);
    const today = thisMonth();
    const day = plus(today, 3);
    const ym = day.slice(0, 7);

    // ------------------------------- //
    // | Check connections: all well | //
    // ------------------------------- //
    const ck = await (await ed.post('/api/board-settings/check', { write: true })).json();
    const cal = ck.checks.find((c: { name: string }) => c.name === 'Calendar');
    assert.equal(cal.ok, true, cal.detail);
    const rt = ck.checks.find((c: { name: string }) => c.name === 'Adding an event');
    assert.equal(rt.ok, true, rt.detail);

    // ------------------------------ //
    // | An event: added, read back | //
    // ------------------------------ //
    const added = await (
      await ed.post('/api/events', { title: 'Piano recital', date: day, allDay: false, time: '18:30', minutes: 60 })
    ).json();
    assert.ok(added.href, JSON.stringify(added));
    const find = async (t: string) =>
      (await (await ed.api(`/api/month?ym=${ym}`)).json()).events.find((e: { title: string }) => e.title.startsWith(t));
    const ev = await find('Piano recital');
    assert.ok(ev, 'the event is on the board');
    assert.equal(ev.start, day);
    assert.equal(ev.hm, '18:30');

    // ---------------------- //
    // | Changed, then gone | //
    // ---------------------- //
    const ch = await ed.post('/api/events/update', {
      ref: ev.ref,
      scope: 'all',
      origDate: day,
      title: 'Piano recital (moved)',
      date: day,
      allDay: false,
      time: '19:00',
      minutes: 90
    });
    assert.equal(ch.status, 200, await ch.text());
    const moved = await find('Piano recital (moved)');
    assert.equal(moved?.hm, '19:00');
    assert.equal((await ed.post('/api/events/delete', { ref: moved.ref, scope: 'all', origDate: day })).status, 200);
    assert.equal(await find('Piano recital'), undefined, 'deleted');
  } finally {
    await board.stop();
    fs.rmSync(board.data, { recursive: true, force: true });
  }
});

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------------- //
// | A real Immich (a fresh one) | //
// ------------------------------- //
// Its admin, an API key, three photos in an album and a share link, made    //
// by the test; then the board reads them every way it can.                  //
test(
  'a real Immich: an album by name, a share link, and a big album kept a few at a time',
  { skip: !IMMICH, timeout: 300_000 },
  async () => {
    const j = async (r: Response) => {
      const t = await r.text();
      assert.ok(r.ok, `${r.status} ${t}`);
      return t ? JSON.parse(t) : null;
    };
    const call = (p: string, init: RequestInit = {}, token?: string) =>
      fetch(IMMICH + p, {
        ...init,
        headers: {
          ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(init.headers || {})
        }
      });
    // ---------------------------- //
    // | Immich's admin and a key | //
    // ---------------------------- //
    const who = { email: 'admin@example.com', password: 'family-chalk-test', name: 'Admin' };
    const signup = await call('/api/auth/admin-sign-up', { method: 'POST', body: JSON.stringify(who) });
    assert.ok(signup.ok || signup.status === 400, `sign-up ${signup.status}`); // (400: done on an earlier run)
    const { accessToken } = await j(
      await call('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: who.email, password: who.password })
      })
    );
    const { secret: KEY } = await j(
      await call(
        '/api/api-keys',
        { method: 'POST', body: JSON.stringify({ name: 'board test', permissions: ['all'] }) },
        accessToken
      )
    );

    // ---------------------------------------- //
    // | Three photos, an album, a share link | //
    // ---------------------------------------- //
    const ids: string[] = [];
    for (const [i, f] of ['photo1.jpg', 'photo2.jpg', 'photo3.jpg'].entries()) {
      const fd = new FormData();
      fd.append(
        'assetData',
        new Blob([fs.readFileSync(path.join(import.meta.dirname, 'real-servers', f))], { type: 'image/jpeg' }),
        f
      );
      fd.append('deviceAssetId', `board-test-${f}`);
      fd.append('deviceId', 'board-test');
      fd.append('fileCreatedAt', `2025-0${i + 6}-15T12:00:00.000Z`);
      fd.append('fileModifiedAt', `2025-0${i + 6}-15T12:00:00.000Z`);
      const up = await j(await call('/api/assets', { method: 'POST', body: fd }, accessToken));
      ids.push(up.id);
    }
    const album = await j(
      await call(
        '/api/albums',
        { method: 'POST', body: JSON.stringify({ albumName: `Board test ${Date.now()}`, assetIds: ids }) },
        accessToken
      )
    );
    const share = await j(
      await call(
        '/api/shared-links',
        {
          method: 'POST',
          body: JSON.stringify({ type: 'ALBUM', albumId: album.id, allowDownload: true, showMetadata: true })
        },
        accessToken
      )
    );
    // Immich makes its previews in the background: wait for them
    for (const id of ids)
      for (let i = 0; i < 60; i++) {
        if ((await call(`/api/assets/${id}/thumbnail?size=preview`, {}, accessToken)).ok) break;
        await new Promise(r => setTimeout(r, 1000));
      }

    // --------------------------------- //
    // | The board: the album, by name | //
    // --------------------------------- //
    const PORT = 3992;
    let board = await startServer(PORT, { IMMICH_URL: IMMICH!, IMMICH_API_KEY: KEY, IMMICH_ALBUM: album.albumName });
    const base = `http://127.0.0.1:${PORT}`;
    try {
      assert.ok(board.up, board.output());
      const ed = client(base, (await makeAdmin(base, board.data)).cookie);
      const synced = async () => {
        await ed.post('/api/photos/sync', {});
        return (await ed.api('/api/photos')).json();
      };
      let p = await synced();
      assert.equal(p.error, null, p.error);
      assert.equal(p.photos.length, 3, 'all three photos');
      const img = await ed.api('/api/photos/img/' + p.photos[0].id);
      assert.equal(img.status, 200);
      assert.match(img.headers.get('content-type') || '', /^image\//);
      const ck = (await (await ed.post('/api/board-settings/check', {})).json()).checks.find(
        (c: { name: string }) => c.name === 'Photos'
      );
      assert.equal(ck.ok, true, ck.detail);

      // ---------------------------------------------- //
      // | A few copies at a time, and the share link | //
      // ---------------------------------------------- //
      await ed.post('/api/board-settings', { values: { PHOTO_KEEP: 'few', PHOTO_KEEP_COUNT: '2' } });
      await board.exited;
      board = await startServer(PORT, {}, board.data);
      p = await synced();
      assert.equal(p.photos.length, 3);
      for (const ph of p.photos) assert.equal((await ed.api('/api/photos/img/' + ph.id)).status, 200);
      const copies = fs.readdirSync(path.join(board.data, 'photo-cache')).filter(f => f.endsWith('.jpg'));
      assert.equal(copies.length, 2, 'only the last two kept');

      await ed.post('/api/board-settings', {
        values: { IMMICH_URL: '', IMMICH_API_KEY: '', PHOTO_KEEP: '', PHOTO_ALBUM_URL: `${IMMICH}/share/${share.key}` }
      });
      await board.exited;
      board = await startServer(PORT, {}, board.data);
      p = await synced();
      assert.equal(p.kind, 'immich-share');
      assert.equal(p.photos.length, 3, 'the share link has all three');
    } finally {
      await board.stop();
      fs.rmSync(board.data, { recursive: true, force: true });
    }
  }
);
