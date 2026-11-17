/*
===============================================================================
 Family Chalk Planner | Tests | Browser | style-title.spec.ts
===============================================================================
 Version:   1.1.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Updated:   2026-11-17

 Purpose:
     Board style (background, presets) and the month title card.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    Browser tests for the board as each screen
                        claude    sees it (Playwright).
                        colby
                                  Server and tests are all TypeScript (ES
                                  modules).

                                  The new screens take over: /, /edit and
                                  /chores are the React board; the old one
                                  stays at /classic.

 0.15.0    2026-11-08   joshua    The Regular fonts.
                        claude

 0.16.1    2026-11-11   joshua    The style opens on just this month.
                        claude

 1.1.0    2026-11-17   joshua    Board style's tabs: each shows only its own
                        claude    rows, Save stays in reach, and a tab with
                                  changes gets a dot.
===============================================================================
*/

import { test, expect } from './fixtures.ts';

const surfaceOf = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.querySelector<HTMLElement>('.slate')!.dataset.surface);

test('board style: a different background and preset, saved and sent to the wall', async ({ as, board }) => {
  await board.admin.post('/api/theme', { p: 'classic', o: {} });
  const page = await as('tablet');
  const wall = await as('wall');
  await page.locator('#styleBtn').click();
  await expect(page.locator('#styleSheet')).toBeVisible();
  // it opens on just this month: every month is asked for
  await expect(page.locator('#styleSheet .surfaces:not(.presets)')).toHaveCount(0);
  await page.locator('#styleSheet').getByRole('radio', { name: 'Every month' }).click();
  await page.locator('#styleSheet .surfaces:not(.presets) button').nth(3).click(); // cork
  await page.locator('#styleSheet .presets button').filter({ hasText: 'Pastel' }).click();
  await page.locator('#styleSheet').getByRole('button', { name: 'Save' }).click();
  await expect.poll(async () => (await (await board.admin.api('/api/theme')).json()).p).toBe('pastel');
  await expect.poll(() => surfaceOf(page)).toBe('cork');
  await expect.poll(() => surfaceOf(wall)).toBe('cork'); // the wall follows
  await board.admin.post('/api/theme', { p: 'classic', o: {} });
});

test('board style: Cancel puts the board back', async ({ as, board }) => {
  await board.admin.post('/api/theme', { p: 'classic', o: {} });
  const page = await as('tablet');
  await expect.poll(() => surfaceOf(page)).toBe('slate');
  const before = 'slate';
  await page.locator('#styleBtn').click();
  await page.locator('#styleSheet').getByRole('radio', { name: 'Every month' }).click();
  await page.locator('#styleSheet .surfaces:not(.presets) button').nth(2).click();
  await expect.poll(() => surfaceOf(page)).not.toBe(before); // shown as she picks
  await page.locator('#styleSheet').getByRole('button', { name: 'Cancel' }).click();
  await expect.poll(() => surfaceOf(page)).toBe(before);
});

test('month title: typed style with a size, then hand-lettered', async ({ as, board }) => {
  const page = await as('tablet');
  await page.locator('#titleBtn').click();
  await expect(page.locator('#titleSheet')).toBeVisible();
  await page.locator('#titleSheet').getByRole('radio', { name: 'L', exact: true }).click();
  await page.locator('#titleSheet').getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#titleSheet')).toHaveCount(0);
  const ym = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('#grid [data-date]')][15].dataset.date!.slice(0, 7)
  );
  await expect.poll(async () => ((await (await board.admin.api('/api/meta?ym=' + ym)).json()).title || {}).z).toBe(80);
  await page.locator('#titleBtn').click();
  await page.locator('#titleSheet').getByRole('radio', { name: 'I’ll hand-letter it' }).click();
  await page.locator('#titleSheet').getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#monthName')).toHaveClass(/hand/);
  await board.admin.post('/api/meta', { ym, hideTitle: false });
});

test('fonts: a Regular group with plain serif and sans (like Times and Arial)', async ({ as }) => {
  const t = await as('tablet', { path: '/edit' });
  await t.locator('#titleBtn').click();
  await t.locator('#titleSheet .fgroups button', { hasText: 'Regular' }).click();
  await t.locator('#titleSheet .fontpick .seg[title^="Times"]').click();
  await expect.poll(() => t.locator('#monthName .mn').evaluate(e => getComputedStyle(e).fontFamily)).toContain('Tinos');
  expect(await t.locator('#monthName .mn').evaluate(e => getComputedStyle(e).fontFamily)).toContain('serif');
  // the font itself arrives from the board (no fallback)
  await expect.poll(() => t.evaluate(() => document.fonts.check('400 20px Tinos'))).toBe(true);
});

test('board style: its parts on tabs, with Save and Cancel always in reach', async ({ as }) => {
  const t = await as('tablet', { path: '/edit' });
  await t.locator('#styleBtn').click();
  const card = t.locator('#styleSheet');
  const tabs = card.getByRole('tab');
  await expect(tabs).toHaveText(['Style', 'Days', 'Events', 'Notes', 'Lines']);
  await expect(card.getByRole('tab', { name: 'Style' })).toHaveAttribute('aria-selected', 'true');
  await expect(card.locator('.presets')).toBeVisible();
  await expect(card.locator('.threl')).toHaveCount(0); // the rows wait on their tabs
  // each tab shows only its own rows
  const rows: [string, string[]][] = [
    ['Days', ['Day numbers', 'Number boxes', 'Today', 'Weekday names']],
    ['Events', ['Events', 'All-day events', 'Holidays']],
    ['Notes', ['Headings', '“Notes” color', '“Meal Plan” color', 'Notes text']],
    ['Lines', ['Calendar lines']]
  ];
  for (const [tab, labels] of rows) {
    await card.getByRole('tab', { name: tab }).click();
    await expect(card.locator('.threl > b')).toHaveText(labels);
    await expect(card.locator('.presets')).toBeHidden();
    await expect(card.getByRole('button', { name: 'Save' })).toBeInViewport();
  }
  // a tab with changes of its own gets a dot
  await card.locator('.threl .colors button').nth(3).click();
  await expect(card.getByRole('tab', { name: 'Lines' }).locator('.tdot')).toHaveCount(1);
  await expect(card.getByRole('tab', { name: 'Days' }).locator('.tdot')).toHaveCount(0);
  await card.getByRole('button', { name: 'Cancel' }).click();
  await expect(card).toHaveCount(0);
});
