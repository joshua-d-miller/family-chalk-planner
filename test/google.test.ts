/*
===============================================================================
 Family Chalk Planner | Tests | google.test.ts
===============================================================================
 Version:   0.15.1
 Author:    Joshua D. Miller, Colby Way, Claude
 Updated:   2026-11-10

 Purpose:
     Google Calendar end to end against a fake Google: sign in (paste
     flow), pick a calendar, read, add, edit, delete, token refresh, and a
     revoked sign-in.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.3.0     2026-10-13   joshua    Google Calendar, Settings, Up next, tap-a-
                        claude    day, photos per month.

                                  Admin console, paired screens, sign-in with
                                  passkeys or password + authenticator.

 0.13.0    2026-11-07   joshua    Server and tests are all TypeScript (ES
                        claude    modules).
                        colby
                                  Google: several calendars at once, read-only
                                  ones, and which calendar a new event goes
                                  in.

 0.15.1    2026-11-10   joshua    Without Google, the month still shows and
                        claude    says why.
===============================================================================
*/

import test from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 3995,
  GPORT = 5995,
  PIN = '1357';
const base = `http://127.0.0.1:${PORT}`;
let server,
  google,
  data,
  cookie = '';
import { pairAdmin, client } from './helpers.ts';
import * as mockGoogle from './mock-google.ts';
const { api, post } = client(base, () => cookie);
const month = async () => await (await api('/api/month?ym=2026-10')).json();

test.before(async () => {
  google = await mockGoogle.start(GPORT, { expiresIn: 2 });
  data = fs.mkdtempSync(path.join(os.tmpdir(), 'fcp-g-'));
  const g = `http://127.0.0.1:${GPORT}`;
  server = spawn(process.execPath, [path.join(import.meta.dirname, '..', 'server', 'chalkboard.js')], {
    env: {
      ...process.env,
      PORT: String(PORT),
      BIND: '127.0.0.1',
      DATA_DIR: data,
      TIMEZONE: 'America/New_York',
      CHALK_PIN: PIN,
      HOLIDAYS: 'none',
      CALENDAR_PROVIDER: 'google',
      GOOGLE_CLIENT_ID: 'test-client',
      GOOGLE_CLIENT_SECRET: 'test-secret',
      GOOGLE_AUTH_URL: `${g}/auth`,
      GOOGLE_TOKEN_URL: `${g}/token`,
      GOOGLE_API_BASE: g,
      GOOGLE_CALDAV_BASE: g
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(base + '/api/whoami')).ok) break;
    } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  cookie = await pairAdmin(base, data);
});
test.after(() => {
  server && server.kill();
  google && google.close();
  fs.rmSync(data, { recursive: true, force: true });
});

test('before connecting, the board says how to connect', async () => {
  const s = await (await api('/api/calendar/status')).json();
  assert.deepEqual([s.provider, s.configured, s.connected, s.paste], ['google', true, false, true]);
  assert.match((await month()).problem, /connect it in ⚙ Settings/); // (the month still shows, holidays and all)
});

test('sign-in needs an admin device', async () => {
  const r = await fetch(base + '/api/google/start', { method: 'POST', headers: { 'X-Chalk': '1' } });
  assert.equal(r.status, 401);
});

test('sign in by pasting the address back', async () => {
  const { url } = await (await post('/api/google/start', {})).json();
  const u = new URL(url);
  assert.equal(u.searchParams.get('client_id'), 'test-client');
  assert.equal(u.searchParams.get('access_type'), 'offline');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.match(u.searchParams.get('scope'), /auth\/calendar$/);
  const st = u.searchParams.get('state');
  // a wrong state is refused, and doesn't use up the real one
  assert.equal(
    (await post('/api/google/finish', { pasted: `http://localhost/?state=nope&code=GOOD-CODE` })).status,
    400
  );
  assert.equal((await post('/api/google/finish', { pasted: 'just some text' })).status, 400);
  const ok = await post('/api/google/finish', { pasted: `http://localhost/?state=${st}&code=GOOD-CODE&scope=x` });
  assert.equal(ok.status, 200, await ok.text());
  const s = await (await api('/api/calendar/status')).json();
  assert.equal(s.connected, true);
  const saved = fs.statSync(path.join(data, 'google-auth.json'));
  assert.equal(saved.mode & 0o777, 0o600, 'token file is private');
  // the same sign-in can't be used twice
  assert.equal(
    (await post('/api/google/finish', { pasted: `http://localhost/?state=${st}&code=GOOD-CODE` })).status,
    400
  );
});

test('pick a calendar and see its events', async () => {
  const cals = await (await post('/api/google/calendars', {})).json();
  assert.ok(cals.find(c => c.name === 'Family' && !c.readOnly));
  assert.ok(cals.find(c => c.name === 'School' && c.readOnly));
  assert.equal(
    (await post('/api/google/calendar', { id: 'family@group.calendar.google.com', name: 'Family' })).status,
    200
  );
  const m = await month();
  assert.ok(
    m.events.find(e => e.title === 'Google picnic'),
    JSON.stringify(m)
  );
});

// from Colby Way's board
test('several calendars (one read-only); new events go to the main one or the one picked', async () => {
  const sel = [
    { id: 'family@group.calendar.google.com', name: 'Family', color: '#9fe1e7', readOnly: false },
    { id: 'kids@group.calendar.google.com', name: 'Kids', color: '#a9d8a0', readOnly: false },
    { id: 'school@group.calendar.google.com', name: 'School', color: '#f6b3cb', readOnly: true }
  ];
  const r = await post('/api/google/calendar', { calendars: sel, calendarId: 'family@group.calendar.google.com' });
  assert.equal(r.status, 200);
  const st = await (await api('/api/calendar/status')).json();
  assert.equal(st.calendar, 'Family');
  assert.equal(st.calendars.length, 3);

  const m = await month();
  const picnic = m.events.find(e => e.title === 'Google picnic');
  const piano = m.events.find(e => e.title === 'Piano recital');
  const assembly = m.events.find(e => e.title === 'School assembly');
  assert.ok(picnic && !picnic.calColor && !picnic.readOnly, 'the main calendar looks like the board');
  assert.ok(piano && piano.cal === 'Kids' && piano.calColor === '#A9D8A0' && !piano.readOnly && piano.ref);
  assert.ok(
    assembly && assembly.cal === 'School' && assembly.readOnly && !assembly.ref,
    'read-only: shown, not changeable'
  );
  assert.deepEqual(
    m.calendars.map(c => [c.name, c.main]),
    [
      ['Family', true],
      ['Kids', false]
    ]
  );
  const kids = await (
    await post('/api/events', {
      title: 'Soccer practice',
      date: '2026-10-23',
      allDay: true,
      calendarId: 'kids@group.calendar.google.com'
    })
  ).json();
  assert.ok(kids.href.includes(encodeURIComponent('kids@group.calendar.google.com')));
  const soccer = (await month()).events.find(e => e.title === 'Soccer practice');
  assert.ok(soccer && soccer.cal === 'Kids');
  const ro = await post('/api/events', {
    title: 'Nope',
    date: '2026-10-24',
    allDay: true,
    calendarId: 'school@group.calendar.google.com'
  });
  assert.equal(ro.status, 502);
  assert.match((await ro.json()).error, /read-only/);
  // a read-only event can't be changed even by sending its address
  const roRef = { href: '/caldav/v2/school%40group.calendar.google.com/events/assembly.ics', etag: null };
  assert.equal((await post('/api/events/delete', { ref: roRef, scope: 'all', origDate: '2026-10-20' })).status, 502);
});

test('add, edit and delete go to Google with a fresh token', async () => {
  await new Promise(r => setTimeout(r, 2200)); // let the access token expire: the next call must refresh it
  const add = await (await post('/api/events', { title: 'Soccer sign-ups', date: '2026-10-21', allDay: true })).json();
  assert.ok(add.href && add.href.includes('/caldav/v2/'), JSON.stringify(add));
  let ev = (await month()).events.find(e => e.title === 'Soccer sign-ups');
  assert.ok(ev);
  assert.equal(
    (
      await post('/api/events/update', {
        ref: ev.ref,
        scope: 'all',
        origDate: ev.start,
        title: 'Soccer sign-ups (gym)',
        date: '2026-10-22',
        allDay: true
      })
    ).status,
    200
  );
  ev = (await month()).events.find(e => e.title === 'Soccer sign-ups (gym)');
  assert.equal(ev && ev.start, '2026-10-22');
  assert.equal((await post('/api/events/delete', { ref: ev.ref, scope: 'all', origDate: ev.start })).status, 200);
  assert.equal(
    (await month()).events.find(e => e.title.startsWith('Soccer sign-ups')),
    undefined
  );
  assert.ok(google.state.calls.filter(c => c === 'POST /token').length >= 2, 'refreshed the token');
});

test('a revoked sign-in tells the tablet to reconnect', async () => {
  google.state.refresh.clear();
  await new Promise(r => setTimeout(r, 2200));
  const m = await (await api('/api/month?ym=2026-11')).json();
  assert.match(m.problem || '', /reconnect/i);
  const s = await (await api('/api/calendar/status')).json();
  assert.equal(s.connected, false);
  assert.match(s.problem, /reconnect/);
});

test('disconnect removes the sign-in', async () => {
  assert.equal((await post('/api/google/disconnect', {})).status, 200);
  assert.equal(fs.existsSync(path.join(data, 'google-auth.json')), false);
});
