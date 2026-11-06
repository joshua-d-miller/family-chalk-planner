// Board style (background, presets) and the month title popup.
import { test, expect } from './fixtures.ts';

test('board style: a different background and preset, saved and sent to the wall', async ({ as, board }) => {
  await board.admin.post('/api/theme', { p: 'classic', o: {} });
  const page = await as('tablet');
  const wall = await as('wall');
  await page.locator('#styleBtn').click();
  await expect(page.locator('#thmodal')).toHaveClass(/open/);
  await page.locator('#thSurf button, #thSurf .seg').nth(3).click(); // cork
  await page.locator('#thPresets button, #thPresets .seg').filter({ hasText: 'Pastel' }).click();
  await page.locator('#thSave').click();
  await expect.poll(async () => (await (await board.admin.api('/api/theme')).json()).p).toBe('pastel');
  const surface = await page.evaluate(() => document.body.dataset.surface);
  expect(surface).toBeTruthy();
  await expect.poll(() => wall.evaluate(() => document.body.dataset.surface)).toBe(surface); // the wall follows
  await board.admin.post('/api/theme', { p: 'classic', o: {} });
});

test('board style: Cancel puts the board back', async ({ as, board }) => {
  await board.admin.post('/api/theme', { p: 'classic', o: {} });
  const page = await as('tablet');
  const before = await page.evaluate(() => document.body.dataset.surface);
  await page.locator('#styleBtn').click();
  await page.locator('#thSurf button, #thSurf .seg').nth(2).click();
  await page.locator('#thCancel').click();
  await expect.poll(() => page.evaluate(() => document.body.dataset.surface)).toBe(before);
});

test('month title: typed style with a size, then hand-lettered', async ({ as, board }) => {
  const page = await as('tablet');
  await page.locator('#titleBtn').click();
  await expect(page.locator('#ttmodal')).toHaveClass(/open/);
  await page.locator('#ttSizes button, #ttSizes .seg').filter({ hasText: /^L$/ }).click();
  await page.locator('#ttForm [type=submit], #ttForm .btn.go').first().click();
  await expect(page.locator('#ttmodal')).not.toHaveClass(/open/);
  const ym = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('#grid [data-date]')][15].dataset.date.slice(0, 7)
  );
  await expect.poll(async () => ((await (await board.admin.api('/api/meta?ym=' + ym)).json()).title || {}).z).toBe(80);
  await page.locator('#titleBtn').click();
  await page.locator('#ttMode button, #ttMode .seg').nth(1).click(); // I'll hand-letter it
  await page.locator('#ttForm [type=submit], #ttForm .btn.go').first().click();
  await expect(page.locator('#monthName')).toHaveClass(/hand/);
  await board.admin.post('/api/meta', { ym, hideTitle: false });
});
