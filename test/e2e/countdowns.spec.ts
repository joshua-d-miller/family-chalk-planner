/*
===============================================================================
 Family Chalk Planner | Tests | Browser | countdowns.spec.ts
===============================================================================
 Version:   1.2.3
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-17
 Updated:   2026-11-22

 Purpose:
     The fun countdowns: a starred event gets a picture and a badge on its
     day; a kid's tablet shows the next one big, in sleeps, with a paper
     chain (one link a day); on the day it says "It's today!"; and the
     overnight slideshow shows it in a corner.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.1.0    2026-11-17   joshua    New file.
                        claude

 1.2.3    2026-11-22   joshua    The starred event goes before the next
                        claude    holiday's countdown (Thanksgiving, 4 days
                                  out, was the next one instead).
===============================================================================
*/

import { expect, test, thisMonth } from './fixtures.ts';

const plus = (date: string, n: number) => new Date(Date.parse(date) + n * 864e5).toISOString().slice(0, 10);

test('a starred event: its picture, a badge on its day, the big card and the paper chain', async ({ as, board }) => {
  const { ym, date } = thisMonth();
  const left = new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate() - +date.slice(8);
  // the next one already counting down (a holiday, like Thanksgiving): ours goes before it, so it's the next
  const soonest = ((await (await board.admin.api('/api/countdowns')).json()) as { days: number }[])[0]?.days ?? 99;
  // a day still in this month (the badge is on this month's grid)
  const n = Math.min(5, left, soonest - 1);
  test.skip(n < 1, 'the last day of the month, or a holiday tomorrow: no day before it to count down to');
  const day = plus(date, n);

  // --------------------------------------------- //
  // | Starred in the event card, with a picture | //
  // --------------------------------------------- //
  const tab = await as('tablet', { path: '/edit' });
  await tab.locator('#addBtn').click();
  await tab.locator('#evTitle').fill('Grandma visits');
  await tab.locator('#evDate').fill(day);
  await tab.locator('#evAllDay').check();
  await tab.locator('#evCount').check();
  await tab.getByRole('radio', { name: '🎉' }).click();
  if (process.env.SHOTS) await tab.locator('.sheet').screenshot({ path: 'test-results/cd-editor.png' });
  await tab.locator('#evSheet').getByRole('button', { name: 'Add', exact: true }).click();
  const cell = tab.locator(`#grid [data-date="${day}"]`);
  await expect(cell.locator('.cdb')).toHaveText(`🎉 ${n === 1 ? 'tomorrow' : n + ' days'}`);
  if (process.env.SHOTS) await tab.screenshot({ path: 'test-results/cd-badge.png' });

  // -------------------------------------------------------- //
  // | A kid's tablet: big, in sleeps, with the paper chain | //
  // -------------------------------------------------------- //
  await board.admin.post('/api/chores/save', { example: true });
  const kid = await as('kid:kid1', { path: '/chores' });
  const card = kid.locator('#cdCard');
  await expect(card).toContainText('Grandma visits');
  await expect(card.locator('.cdnum')).toContainText(`${n} ${n === 1 ? 'sleep' : 'sleeps'} to go`);
  await expect(card.locator('.chain .link')).toHaveCount(n);
  if (process.env.SHOTS) await kid.screenshot({ path: 'test-results/cd-kid.png' });

  // ------------------------------------------- //
  // | The slideshow: the next one in a corner | //
  // ------------------------------------------- //
  await board.admin.post('/api/photos/settings', { night: true, from: '00:00', to: '23:59' });
  const wall = await as('wall');
  await expect(wall.locator('#cdCorner')).toContainText('Grandma visits');
  await expect(wall.locator('#cdCorner')).toContainText(`${n} ${n === 1 ? 'day' : 'days'} to go`); // days on the wall
  if (process.env.SHOTS) await wall.screenshot({ path: 'test-results/cd-slideshow.png' });
  await board.admin.post('/api/photos/settings', { night: false, from: '21:00', to: '06:00' });

  // ----------------------------- //
  // | On the day: "It's today!" | //
  // ----------------------------- //
  const ev = (await (await board.admin.api(`/api/month?ym=${ym}`)).json()).events.find(
    (e: { title: string }) => e.title === 'Grandma visits'
  );
  await board.admin.post('/api/events/update', {
    ref: ev.ref,
    scope: 'all',
    origDate: day,
    title: 'Grandma visits',
    date,
    allDay: true
  });
  const ev2 = (await (await board.admin.api(`/api/month?ym=${ym}`)).json()).events.find(
    (e: { title: string }) => e.title === 'Grandma visits'
  );
  await board.admin.post('/api/countdowns', { ref: ev2.ref, title: 'Grandma visits', date, on: true, icon: '🎉' });
  await expect(card.locator('.cdtoday')).toHaveText('It’s today!');
  await expect(card.locator('.chain')).toHaveCount(0);
  if (process.env.SHOTS) {
    await kid.waitForTimeout(400); // mid-confetti
    await kid.screenshot({ path: 'test-results/cd-today.png' });
  }
  await board.admin.post('/api/events/delete', { ref: ev2.ref, scope: 'all', origDate: date });
});
