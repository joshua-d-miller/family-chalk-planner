/*
===============================================================================
 Family Chalk Planner | Tests | Browser | board.spec.ts
===============================================================================
 Version:   0.15.0
 Author:    Joshua D. Miller, Claude
 Updated:   2026-11-08

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

 0.15.0    2026-11-08   joshua    Week view; the switch at the bottom of Notes.
                        claude

                                  Decorating a week; the bottom of Notes on
                                  this screen.
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

test('week view: a family screen switches to this week and back; the wall by tapping the month name', async ({
  as
}) => {
  const { day } = thisMonth();
  const page = await as('family', { context: { viewport: { width: 1280, height: 800 } } });
  await page.locator('#editBtn').click();
  await page.locator('#viewBtn').click();
  await expect(page.locator('#grid .week')).toHaveCount(1);
  await expect(page.locator('#grid .day.todaybox, #grid .ringAt').first()).toBeVisible();
  expect(await page.locator('#grid .day .num').allInnerTexts()).toContain(String(day));
  // the arrows go a week at a time
  const first = await page.locator('#grid .day').first().getAttribute('data-date');
  await page.locator('.titlerow button').last().click();
  await expect
    .poll(() => page.locator('#grid .day').first().getAttribute('data-date'))
    .toBe(new Date(Date.parse(first + 'T12:00:00Z') + 7 * 864e5).toISOString().slice(0, 10));
  await page.locator('#viewBtn').click();
  await expect.poll(() => page.locator('#grid .week').count()).toBeGreaterThan(3);

  const wall = await as('wall');
  await wall.locator('#monthName').click();
  await expect(wall.locator('#grid .week')).toHaveCount(1);
  await wall.reload();
  await expect(wall.locator('#grid .week')).toHaveCount(1); // kept for this screen
  await wall.locator('#monthName').click();
  await expect.poll(() => wall.locator('#grid .week').count()).toBeGreaterThan(3);
});

test('the bottom of Notes: a switch between today, up next and photos', async ({ as }) => {
  const wall = await as('wall');
  const sw = wall.locator('.notes .bslide');
  await expect(sw).toBeVisible();
  await sw.getByRole('tab', { name: 'Up next' }).click();
  await expect(wall.locator('.notes .hasswitch .mh')).toHaveText('Up Next');
  await expect(sw.getByRole('tab', { name: 'Up next' })).toHaveAttribute('aria-selected', 'true');
  await sw.getByRole('tab', { name: 'Today' }).click();
  await expect(wall.locator('.notes .hasswitch .mh')).toHaveText('Today');
  await wall.waitForTimeout(600);
  await expect(wall.locator('#slides.on')).toHaveCount(0); // two taps on the switch aren't a double tap
});

test('the bottom of Notes on this screen: what it shows and what the switch can flip to', async ({ as }) => {
  const page = await as('family');
  await page.locator('#editBtn').click();
  await page.locator('#notesBtn').click();
  await page.locator('#notesSheet').getByRole('radio', { name: '📅 Up next' }).click();
  for (const name of ['🫙 Jars', '📷 Photos'])
    await page.locator('#notesSheet .tick', { hasText: name }).locator('input').uncheck();
  await page.locator('#notesSheet').getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.notes .hasswitch .mh')).toHaveText('Up Next');
  await expect(page.locator('.notes .bslide button')).toHaveCount(2); // up next and today
  // just one: no switch
  await page.locator('#notesBtn').click();
  await page.locator('#notesSheet .tick', { hasText: '☀️ Today' }).locator('input').uncheck();
  await page.locator('#notesSheet').getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.notes .bslide')).toHaveCount(0);
  await expect(page.locator('.notes .nslot').last().locator('.mh')).toHaveText('Up Next');
  await page.locator('#notesBtn').click();
  await page.locator('#notesSheet').getByRole('button', { name: 'Like the rest of the board' }).click();
  await expect(page.locator('.notes .bslide')).toBeVisible();
});

test('week view: decorating a week keeps it to that week', async ({ as }) => {
  const page = await as('family', { context: { viewport: { width: 1280, height: 800 } } });
  await page.locator('#editBtn').click();
  await page.locator('#viewBtn').click();
  await expect(page.locator('#grid .week')).toHaveCount(1);
  await expect(page.locator('#drawBtn')).toBeVisible();
  await page.evaluate(async () => {
    const wk = document.querySelector('#grid .day')!.getAttribute('data-date');
    await fetch('api/art/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Chalk': '1' },
      body: JSON.stringify({ ym: wk, items: [{ k: 't', s: 'Busy week!', x: 300, y: 300, z: 30, c: '#ffffff' }] })
    });
  });
  await page.reload();
  await expect.poll(() => page.locator('#grid .week').count()).toBe(1);
  await expect.poll(() => page.locator('#slate').evaluate(e => e.innerHTML.includes('Busy week!'))).toBe(true);
  await page.locator('#editBtn').click();
  await page.locator('#viewBtn').click();
  await expect.poll(() => page.locator('#grid .week').count()).toBeGreaterThan(3);
  expect(await page.locator('#slate').evaluate(e => e.innerHTML.includes('Busy week!'))).toBe(false);
});
