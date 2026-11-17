/*
===============================================================================
 Family Chalk Planner | Tests | outages.test.ts
===============================================================================
 Version:   1.1.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-17
 Updated:   2026-11-17

 Purpose:
     Reading Apple's System Status and Google's Workspace Status Dashboard:
     a calendar problem that's going on now is found; one that's over, or
     about another service, isn't; anything unexpected (a broken page, no
     answer) is "nothing known", never an error; and an answer is kept for
     10 minutes.
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
import http from 'node:http';
import { appleSays, googleSays, makeOutages } from '../server/outages.ts';

const NOW = Date.parse('2026-11-17T15:00:00Z');
const H = 3600e3;
const apple = (events: object[], name = 'iCloud Calendar') =>
  `jsonCallback(${JSON.stringify({
    services: [
      { serviceName: 'App Store', events: [] },
      { serviceName: name, events }
    ]
  })});`;

test('Apple: a calendar problem going on now, and not one that is over or elsewhere', () => {
  assert.match(
    appleSays(apple([{ epochStartDate: NOW - H, epochEndDate: null, eventStatus: 'ongoing' }]), NOW)!,
    /Apple’s System Status shows a problem with iCloud Calendar/
  );
  assert.equal(appleSays(apple([{ epochStartDate: NOW - 2 * H, epochEndDate: NOW - H }]), NOW), null, 'over');
  assert.equal(
    appleSays(apple([{ epochStartDate: NOW - H, epochEndDate: null, eventStatus: 'resolved' }]), NOW),
    null,
    'resolved'
  );
  assert.equal(appleSays(apple([{ epochStartDate: NOW - H }], 'Apple Music'), NOW), null, 'another service');
});

test('Google: a Calendar incident that has begun and not ended', () => {
  const inc = (o: object) => JSON.stringify([{ service_name: 'Gmail', begin: '2026-11-17T10:00:00Z' }, o]);
  assert.match(
    googleSays(inc({ affected_products: [{ title: 'Google Calendar' }], begin: '2026-11-17T14:00:00Z' }), NOW)!,
    /Google Calendar/
  );
  assert.equal(
    googleSays(
      inc({ service_name: 'Google Calendar', begin: '2026-11-17T10:00:00Z', end: '2026-11-17T12:00:00Z' }),
      NOW
    ),
    null,
    'ended'
  );
  assert.equal(googleSays(JSON.stringify([{ service_name: 'Gmail', begin: '2026-11-17T10:00:00Z' }]), NOW), null);
});

test('asking: kept for a while, and anything unexpected is "nothing known"', async () => {
  let body = apple([{ epochStartDate: Date.now() - H }]);
  let asked = 0;
  const srv = http.createServer((_q, r) => {
    asked++;
    r.end(body);
  });
  await new Promise<void>(r => srv.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(srv.address() as { port: number }).port}/`;
  let company: 'apple' | 'google' | null = 'apple';
  const outage = makeOutages({ company: () => company, appleUrl: url, googleUrl: url });
  assert.match((await outage())!, /iCloud Calendar/);
  body = 'not json at all';
  assert.match((await outage())!, /iCloud Calendar/, 'the same answer for 10 minutes');
  assert.equal(asked, 1);
  company = 'google'; // another company: asked again, and a broken page is nothing known
  assert.equal(await outage(), null);
  company = null; // not iCloud or Google: never asked
  assert.equal(await outage(), null);
  assert.equal(asked, 2);
  srv.close();
  const nobody = makeOutages({ company: () => 'apple', appleUrl: 'http://127.0.0.1:9/' });
  assert.equal(await nobody(), null, 'no answer at all');
});
