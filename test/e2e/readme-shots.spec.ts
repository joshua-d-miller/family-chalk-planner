/*
===============================================================================
 Family Chalk Planner | Tests | Browser | readme-shots.spec.ts
===============================================================================
 Version:   0.17.1
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-14
 Updated:   2026-11-14

 Purpose:
     The README's screenshots, from a sample family (Lily and Sam, made-up
     events, fall art) on October 14, 2026, so no real household ever ends
     up in them. Only runs when asked:

       README_SHOTS=1 NODE_OPTIONS="--import ./test/fakenow.mjs" \
         npx playwright test test/e2e/readme-shots.spec.ts

     then python3 test/readme-shots.py copies them into docs/images.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.17.1    2026-11-14   joshua    New file.
                        claude
===============================================================================
*/

import { expect, test } from './fixtures.ts';

test.skip(!process.env.README_SHOTS, 'only for the README (README_SHOTS=1)');
test.setTimeout(300_000);
const OUT = 'test-results/readme/';
const YM = '2026-10';
test('readme shots', async ({ as, board }) => {
  const a = board.admin;
  for (let i = 0; i < 180; i++) {
    const st = await (await a.api('/api/clip/styles')).json();
    if (st.length && st.every((s: { count: number }) => s.count)) break;
    await new Promise(r => setTimeout(r, 1000));
  }
  const ev = (title: string, date: string, time?: string) =>
    a.post('/api/events', time ? { title, date, time, allDay: false } : { title, date, allDay: true });
  await ev('Book club', '2026-10-07', '19:00');
  await ev('Parent-teacher night', '2026-10-20', '18:30');
  await ev('Pumpkin patch', '2026-10-17');
  await ev('Sam birthday', '2026-10-24');
  await ev('Trick or treat!', '2026-10-31', '18:00');
  await a.post('/api/birthdays', { cake: true, countdown: true });
  await a.post('/api/photos/settings', { frame: false });
  await a.post('/api/meals', {
    items: [{ t: 'Tacos' }, { t: 'Chili & cornbread' }, { t: 'Spaghetti' }, { t: 'Soup night' }, { t: 'Pizza' }]
  });
  await a.post('/api/jars', {
    jars: [
      { id: 'lily', name: 'Lily', pieces: ['heart', 'star'], count: 7, goal: 10 },
      { id: 'sam', name: 'Sam', pieces: ['rainbow', 'star'], count: 4, goal: 10 }
    ]
  });
  const st = (src: string, x: number, y: number, w = 70) => ({ k: 'g', x, y, w, h: w, src, still: src, mode: 'still' });
  await a.post('/api/art/bulk', {
    ym: YM,
    items: [
      st('/api/clip/fallen-leaf.svg', 40, 38, 64),
      st('/api/clip/maple-leaf.svg', 150, 44, 64),
      st('/api/clip/chestnut.svg', 905, 40, 58),
      st('/api/clip/jack-o-lantern.svg', 628, 585, 62),
      st('/api/clip/ghost.svg', 768, 585, 62),
      { k: 't', s: 'Happy Fall!', x: 110, y: 612, c: '#F2C14E', f: 'rock-salt', z: 30 }
    ]
  });
  const wall = await as('wall', { path: '/', context: { viewport: { width: 1600, height: 900 } } });
  await wall.clock.install({ time: new Date('2026-10-14T12:00:00-04:00') });
  await wall.reload();
  await wall.waitForTimeout(2500);
  await wall.screenshot({ path: OUT + 'wall.png' });
  const tab = await as('family', {
    path: '/',
    context: { viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.125 }
  });
  await tab.clock.install({ time: new Date('2026-10-14T12:00:00-04:00') });
  await tab.reload();
  await tab.waitForTimeout(2500);
  await tab.screenshot({ path: OUT + 'tablet.png' });
  for (const s of ['green', 'cork', 'kraft', 'white']) {
    await a.post('/api/theme', { p: 'classic', o: {}, s });
    await wall.waitForTimeout(2500);
    await wall.screenshot({ path: OUT + 'bg-' + s + '.png' });
  }
  await a.post('/api/theme', { p: 'classic', o: {} });
  expect(true).toBe(true);
});
