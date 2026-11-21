/*
===============================================================================
 Family Chalk Planner | Tests | Browser | style-title.spec.ts
===============================================================================
 Version:   1.2.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Updated:   2026-11-21

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

 1.1.2    2026-11-20   joshua    The backgrounds show on Just this month too,
                        claude    and are saved for every month.

 1.2.0    2026-11-21   joshua    On this screen: the wooden frame and filling
                        claude    the screen. The hard-to-read warning.
===============================================================================
*/

import { test, expect, thisMonth } from './fixtures.ts';

const surfaceOf = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.querySelector<HTMLElement>('.slate')!.dataset.surface);

test('🎨 Board style warns when a color is hard to read on the background picked', async ({ as }) => {
  const page = await as('tablet');
  await page.locator('#styleBtn').click();
  const sheet = page.locator('#styleSheet');
  await sheet.getByRole('radio', { name: /Every month/ }).click();
  await sheet.getByRole('tab', { name: 'Days' }).click();
  await expect(sheet.locator('.hardread')).toHaveCount(0); // chalk yellow on the black slate: fine
  await sheet.getByRole('tab', { name: 'Style' }).click();
  await sheet.locator('#surface-linen').click(); // light paper
  await sheet.getByRole('tab', { name: 'Days' }).click();
  await expect(sheet.locator('.hardread').first()).toContainText('Hard to read on this background');
  await sheet.getByRole('button', { name: 'Cancel' }).click(); // (Cancel discards: no question)
  await expect(sheet).toHaveCount(0);
  expect(page.errors).toEqual([]);
});

test('🎨 Style → On this screen: the wooden frame can come off, and the board can fill the screen', async ({ as }) => {
  const page = await as('tablet');
  const pad = () => page.locator('#board').evaluate(el => getComputedStyle(el).paddingTop);
  expect(await pad()).not.toBe('0px'); // a tablet's board has its frame
  await page.locator('#styleBtn').click();
  await page.locator('#frameBox').click(); // off
  await expect(page.locator('#frameBox')).not.toBeChecked();
  await expect.poll(pad).toBe('0px');
  await page.locator('#frameBox').click(); // and back
  await expect(page.locator('#frameBox')).toBeChecked();
  await expect.poll(pad).not.toBe('0px');
  await expect(page.locator('#fillBox')).not.toBeChecked();
  expect(page.errors).toEqual([]);
});

test('board style: a different background and preset, saved and sent to the wall', async ({ as, board }) => {
  await board.admin.post('/api/theme', { p: 'classic', o: {} });
  const page = await as('tablet');
  const wall = await as('wall');
  await page.locator('#styleBtn').click();
  await expect(page.locator('#styleSheet')).toBeVisible();
  // it opens on just this month, and the backgrounds are there too (a month can have its own)
  await expect(page.locator('#styleSheet .surfaces:not(.presets) button').first()).toBeVisible();
  await expect(page.locator('#styleSheet')).toContainText('now the same as every month');
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

test('board style: a background just for this month; every other month keeps the board’s', async ({ as, board }) => {
  const { ym } = thisMonth();
  await board.admin.post('/api/theme', { p: 'classic', o: {}, s: 'green' });
  const page = await as('tablet', { path: '/edit' });
  await expect.poll(() => surfaceOf(page)).toBe('green');
  await page.locator('#styleBtn').click();
  const card = page.locator('#styleSheet');
  await expect(card).toContainText('now the same as every month');
  await card.locator('#surface-navy').click();
  await expect.poll(() => surfaceOf(page)).toBe('navy');
  await expect(card).toContainText('Background just for');
  await card.getByRole('button', { name: 'Save' }).click();
  await expect.poll(async () => (await (await board.admin.api(`/api/meta?ym=${ym}`)).json()).look?.s).toBe('navy');
  expect((await (await board.admin.api('/api/theme')).json()).s).toBe('green'); // the board's own is unchanged
  // the next month: the board's background
  await page.getByRole('button', { name: 'Next month' }).click();
  await expect.poll(() => surfaceOf(page)).toBe('green');
  // Like every month takes it away
  await page.getByRole('button', { name: 'Previous month' }).click();
  await page.locator('#styleBtn').click();
  await card.locator('#lookClear').click();
  await expect.poll(() => surfaceOf(page)).toBe('green');
  await card.getByRole('button', { name: 'Cancel' }).click();
  await board.admin.post('/api/meta', { ym, look: null });
  await board.admin.post('/api/theme', { p: 'classic', o: {} });
});
