/*
===============================================================================
 Family Chalk Planner | Tests | Browser | drawing-border.spec.ts
===============================================================================
 Version:   0.13.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Updated:   2026-11-07

 Purpose:
     Drawing on the board, and a holiday border that moves the art onto
     the (smaller) days.
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
===============================================================================
*/

import { test, expect } from './fixtures.ts';

const shownYm = page =>
  page.evaluate(() => [...document.querySelectorAll<HTMLElement>('#grid [data-date]')][15].dataset.date.slice(0, 7));
const art = async (board, ym) => (await board.admin.api('/api/art?ym=' + ym)).json();
// a point on the board (slate coordinates) -> where it is on the screen
const onScreen = (page, x, y) =>
  page.evaluate(
    ([x, y]) => {
      const s = document.getElementById('slate').getBoundingClientRect(),
        k = s.width / 1252;
      return { x: s.left + x * k, y: s.top + y * k };
    },
    [x, y]
  );

test('draw a chalk line, undo it, and draw again; it is saved for the month', async ({ as, board }) => {
  const page = await as('tablet');
  const ym = await shownYm(page);
  await board.admin.post('/api/art/clear', { ym });
  await page.reload();
  await page.waitForTimeout(1200);
  await page.locator('#drawBtn').click();
  await expect(page.locator('body')).toHaveClass(/drawing/);
  const line = async y => {
    const a = await onScreen(page, 300, y),
      b = await onScreen(page, 520, y + 40);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 6 });
    await page.mouse.move(b.x, b.y, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(500);
  };
  await line(250);
  await expect.poll(async () => (await art(board, ym)).length).toBe(1);
  await page.locator('#undoBtn').click();
  await expect.poll(async () => (await art(board, ym)).length).toBe(0);
  await line(300);
  await expect.poll(async () => (await art(board, ym)).length).toBe(1);
  const [stroke] = await art(board, ym);
  expect(stroke.p.length).toBeGreaterThan(6);
  await page.locator('#drawBtn').click(); // Done drawing
  await expect(page.locator('body')).not.toHaveClass(/drawing/);
  expect(page.errors).toEqual([]);
});

test('a border moves art on the calendar onto the same days, and back when it comes off', async ({ as, board }) => {
  const page = await as('tablet');
  const ym = await shownYm(page);
  await board.admin.post('/api/art/clear', { ym });
  await board.admin.post('/api/border', { ym, border: null });
  await page.reload();
  await page.waitForTimeout(1200);
  const cell = date =>
    page.evaluate(d => {
      const s = document.getElementById('slate').getBoundingClientRect(),
        k = s.width / 1252,
        e = document.querySelector(`[data-date="${d}"]`).getBoundingClientRect();
      return { x: (e.left - s.left) / k, y: (e.top - s.top) / k, w: e.width / k, h: e.height / k };
    }, date);
  const date = `${ym}-12`,
    c = await cell(date);
  const ring = [];
  for (let a = 0; a <= 6.3; a += 0.3) ring.push(c.x + c.w / 2 + Math.cos(a) * 20, c.y + c.h / 2 + Math.sin(a) * 20);
  const { id } = await (await board.admin.post('/api/art', { ym, stroke: { c: '#F6B3CB', w: 4, p: ring } })).json();
  const beside = await (
    await board.admin.post('/api/art', { ym, stroke: { c: '#F2D479', w: 4, p: [40, 20, 60, 40] } })
  ).json();
  const middle = async () => {
    const it = (await art(board, ym)).find(i => i.id === id),
      xs = it.p.filter((_, i) => !(i % 2)),
      ys = it.p.filter((_, i) => i % 2);
    return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  };
  await page.reload();
  await page.waitForTimeout(1200);

  await board.admin.post('/api/border', { ym, border: { items: ['jack-o-lantern', 'ghost'], size: 'm' } });
  await expect.poll(async () => (await (await board.admin.api('/api/meta?ym=' + ym)).json()).artPad).toBe(32);
  await expect(page.locator('#borderLayer img').first()).toBeVisible();
  const c2 = await cell(date),
    [mx, my] = await middle();
  expect(Math.abs(mx - (c2.x + c2.w / 2))).toBeLessThan(3);
  expect(Math.abs(my - (c2.y + c2.h / 2))).toBeLessThan(3);
  expect((await art(board, ym)).find(i => i.id === beside.id).p.slice(0, 2)).toEqual([40, 20]); // beside the title: stays put

  await board.admin.post('/api/border', { ym, border: null });
  await expect.poll(async () => (await (await board.admin.api('/api/meta?ym=' + ym)).json()).artPad).toBe(0);
  const [bx, by] = await middle();
  expect(Math.abs(bx - (c.x + c.w / 2))).toBeLessThan(2);
  expect(Math.abs(by - (c.y + c.h / 2))).toBeLessThan(2);
});

test('the border popup: pick a ready-made set, see it, cancel puts it back', async ({ as, board }) => {
  const page = await as('tablet');
  const ym = await shownYm(page);
  await board.admin.post('/api/border', { ym, border: null });
  await page.reload();
  await page.waitForTimeout(1200);
  await page.locator('#borderBtn').click();
  await expect(page.locator('#borderSheet')).toBeVisible();
  await page.locator('#borderSheet .seg', { hasText: 'Halloween' }).click();
  await expect(page.locator('#borderLayer img').first()).toBeVisible(); // shown while picking
  await page.locator('#borderSheet').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('#borderLayer img')).toHaveCount(0);
});
