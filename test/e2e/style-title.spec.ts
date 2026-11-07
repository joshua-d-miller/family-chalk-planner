// Board style (background, presets) and the month title card.
import { test, expect } from './fixtures.ts';

const surfaceOf = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.querySelector<HTMLElement>('.slate')!.dataset.surface);

test('board style: a different background and preset, saved and sent to the wall', async ({ as, board }) => {
  await board.admin.post('/api/theme', { p: 'classic', o: {} });
  const page = await as('tablet');
  const wall = await as('wall');
  await page.locator('#styleBtn').click();
  await expect(page.locator('#styleSheet')).toBeVisible();
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
