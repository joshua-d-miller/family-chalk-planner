/*
===============================================================================
 Family Chalk Planner | Tests | Browser | wall-screens.spec.ts
===============================================================================
 Version:   1.2.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-21
 Updated:   2026-11-21

 Purpose:
     A screen on the wall: the page doesn't zoom (a pinch or a double tap),
     a low-power screen turns off what moves, and on a slow screen (the
     CPU six times slower) the board still answers a tap quickly.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.2.0    2026-11-21   joshua    New file.
                        claude
===============================================================================
*/

import { test, expect } from './fixtures.ts';

const set = (p, path: string, body: object) =>
  p.evaluate(
    ([path, body]) =>
      fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Chalk': '1' },
        body: JSON.stringify(body)
      }),
    [path, body] as const
  );

test('a screen on the wall doesn’t zoom; a tablet still can', async ({ as }) => {
  for (const kind of ['wall', 'family'] as const) {
    const p = await as(kind);
    await expect(p.locator('html')).toHaveClass(/nozoom/);
    expect(await p.evaluate(() => getComputedStyle(document.documentElement).touchAction)).toBe('pan-x pan-y');
  }
  const tab = await as('tablet');
  await expect(tab.locator('html')).not.toHaveClass(/nozoom/);
  expect(await tab.evaluate(() => getComputedStyle(document.documentElement).touchAction)).toBe('auto');
});

test('a low-power screen: nothing moves, and the chalk is drawn plainer', async ({ as }) => {
  const fam = await as('family');
  await set(fam, 'api/boardfit', { low: true });
  await expect(fam.locator('html')).toHaveClass(/lowpower/);
  expect(await fam.evaluate(() => getComputedStyle(document.querySelector('.slate')!).animationName)).toBe('none');
  await set(fam, 'api/boardfit', { low: false });
  await expect(fam.locator('html')).not.toHaveClass(/lowpower/);
  expect(fam.errors).toEqual([]);
});

test('a slow screen (CPU six times slower, 1080p) still answers a tap quickly', async ({ as }) => {
  const fam = await as('family', { context: { viewport: { width: 1920, height: 1080 } } });
  const cdp = await fam.context().newCDPSession(fam);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  // + Add event: the card is up
  let t0 = Date.now();
  await fam.locator('#addBtn').click();
  await expect(fam.locator('#evTitle')).toBeVisible();
  const card = Date.now() - t0;
  await fam.keyboard.press('Escape');
  // the next month, drawn
  const first = await fam.locator('#grid .day').first().getAttribute('data-date');
  t0 = Date.now();
  await fam.locator('.titlerow button').last().click();
  await expect.poll(() => fam.locator('#grid .day').first().getAttribute('data-date')).not.toBe(first);
  const month = Date.now() - t0;
  console.log(`slow screen: event card ${card} ms, next month ${month} ms`);
  expect(card).toBeLessThan(1500);
  expect(month).toBeLessThan(3000);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
});

test('a 1080p screen: the board drawn at the screen’s own resolution (zoomed, not a stretched layer)', async ({
  as
}) => {
  const wall = await as('wall', { context: { viewport: { width: 1920, height: 1080 } } });
  const board = wall.locator('#board');
  await expect(wall.locator('#grid .day').first()).toBeVisible();
  const style = await board.evaluate(el => ({ zoom: el.style.zoom, transform: el.style.transform }));
  expect(Number(style.zoom)).toBeGreaterThan(1.4);
  expect(style.transform).toBe('');
  // it fills the screen's width, and a day's box is where its size says
  const b = (await board.boundingBox())!;
  expect(b.width).toBeGreaterThan(1900);
  const day = (await wall.locator('#grid .day').first().boundingBox())!;
  expect(day.width).toBeGreaterThan(200);
  expect(wall.errors).toEqual([]);
});
