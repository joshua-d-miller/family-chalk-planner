/*
===============================================================================
 Family Chalk Planner | Tests | Browser | board.spec.ts
===============================================================================
 Version:   0.14.0
 Author:    Joshua D. Miller, Claude
 Updated:   2026-11-06

 Purpose:
     The board itself: this month on the tablet, moving between months,
     the strip of buttons.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-06   joshua    Browser tests for the board as each screen
                        claude    sees it (Playwright).

                                  Server and tests are all TypeScript (ES
                                  modules).

 0.14.0    2026-11-07   joshua    A family screen's cork fits, drawer open or
                        claude    closed.
===============================================================================
*/

import { test, expect, thisMonth } from './fixtures.ts';

test('the tablet opens on this month, with weather, countdowns and no errors', async ({ as }) => {
  const page = await as('tablet');
  await expect(page.locator('#monthName')).toContainText(thisMonth().name);
  await expect(page.locator(`[data-date="${thisMonth().date}"]`)).toBeVisible();
  await expect(page.locator('#wNow')).toContainText('58°');
  expect(page.errors).toEqual([]);
});

test('next and previous month', async ({ as }) => {
  const page = await as('tablet');
  const start = await page.locator('#monthName').innerText();
  await page.locator('#next').click();
  await expect(page.locator('#monthName')).not.toHaveText(start);
  await page.locator('#prev').click();
  await expect(page.locator('#monthName')).toHaveText(start);
});

test('every button in the strip fits on an iPad', async ({ as }) => {
  const page = await as('tablet');
  const off = await page.evaluate(() => {
    const strip = document.querySelector('.cork').getBoundingClientRect();
    return [...document.querySelectorAll('.cork > *')]
      .filter(e => (e as HTMLElement).offsetWidth)
      .filter(e => {
        const r = e.getBoundingClientRect();
        return r.left < strip.left - 1 || r.right > strip.right + 1;
      })
      .map(e => e.id || e.className);
  });
  expect(off).toEqual([]);
});

test('a family screen: the pages and the calendar tools both fit on the cork', async ({ as }) => {
  const page = await as('family', { context: { viewport: { width: 1024, height: 600 } } });
  const off = (sel: string) =>
    page.evaluate(sel => {
      const cork = document.querySelector('.cork')!.getBoundingClientRect();
      return [...document.querySelectorAll(sel)]
        .filter(e => (e as HTMLElement).offsetWidth)
        .filter(e => {
          const r = e.getBoundingClientRect();
          return r.left < cork.left - 1 || r.right > cork.right + 1;
        })
        .map(e => e.id || e.className);
    }, sel);
  expect(await off('.cork .corknav > *, .cork > #addBtn')).toEqual([]);
  await page.locator('#editBtn').click();
  await page.waitForTimeout(400);
  expect(await off('.cork .drawer > *')).toEqual([]);
});
