/*
===============================================================================
 Family Chalk Planner | Tests | Browser | chores-jars-meals.spec.ts
===============================================================================
 Version:   1.3.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Updated:   2026-11-26

 Purpose:
     Chores (tablet, phone, kid's tablet, wall), reward jars and the meal
     plan.
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

 0.14.0    2026-11-07   joshua    Back to the calendar from the tab bar.
                        claude

 1.2.0    2026-11-21   joshua    The big jar from the Notes column: ★ Reward
                        claude    empties only that jar.

 1.3.0    2026-11-26   joshua    Swiping through the pinned pages and back.
                        claude    A page swiped to goes back after 2 quiet
                                  minutes.
===============================================================================
*/

import { test, expect } from './fixtures.ts';
import type { Page } from '@playwright/test';

const names = { dad: 'Josh', mom: 'Tarin', kid1: 'Theo', kid2: 'Nora' };
async function exampleChores(board) {
  const v = await (await board.admin.post('/api/chores/save', { example: true })).json();
  await board.admin.post('/api/chores/save', {
    people: v.people.map(p => ({ ...p, name: names[p.id] })),
    chores: v.chores
  });
}
const doneOf = async (board, title) => {
  const c = (await (await board.admin.api('/api/chores')).json()).chores.find(x => x.title === title);
  return c.each ? c.doneEach : c.done;
};

// this screen's (or person's) pinned pages: read, and set (they also hold its ★ pictures)
const pinsOf = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    fetch('api/favorites')
      .then(r => r.json())
      .then(d => d.items || [])
  );
const setPins = (page: Page, items: string[]) =>
  page.evaluate(
    v =>
      fetch('api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Chalk': '1' },
        body: JSON.stringify({ items: v })
      }).then(r => r.status),
    items
  );

test('chores from the tablet: swipe across the board, tick one off, back to the calendar', async ({ as, board }) => {
  await exampleChores(board);
  const page = await as('tablet');
  const before = await pinsOf(page);
  await setPins(page, []); // nothing pinned: a swipe goes to Chores
  await page.reload();
  const b = (await page.locator('.slate').boundingBox())!;
  await page.mouse.move(b.x + 800, b.y + 300);
  await page.mouse.down();
  await page.mouse.move(b.x + 600, b.y + 305, { steps: 6 });
  await page.mouse.move(b.x + 400, b.y + 310, { steps: 6 });
  await page.mouse.up();
  await expect(page).toHaveURL(/\/chores$/);
  await expect(page.locator('#chCols .chcol h3', { hasText: 'Josh & Tarin' })).toBeVisible();
  await page.locator('.chitem', { hasText: 'Wipe kitchen counters' }).click();
  await expect(page.locator('.chitem', { hasText: 'Wipe kitchen counters' })).toHaveClass(/done/);
  await expect.poll(() => doneOf(board, 'Wipe kitchen counters')).toBe(1);
  await page.locator('#chTabs button', { hasText: 'This week' }).click();
  await expect(page.locator('.chitem', { hasText: 'Fold laundry' })).toContainText('0 of 3');
  await page.locator('#tabbar a', { hasText: 'Calendar' }).click(); // a tablet: the tab bar
  await expect(page).toHaveURL(/\/edit$/);
  await setPins(page, before);
});

test('swiping goes through the pinned pages and back, and stops at the last one', async ({ as }) => {
  const page = await as('tablet');
  const before = await pinsOf(page);
  const swipe = async (left: boolean) => {
    const at = { x: 590, y: 420 };
    await page.mouse.move(at.x + (left ? 200 : -200), at.y);
    await page.mouse.down();
    await page.mouse.move(at.x, at.y + 4, { steps: 6 });
    await page.mouse.move(at.x + (left ? -200 : 200), at.y + 8, { steps: 6 });
    await page.mouse.up();
  };
  try {
    expect(await setPins(page, ['meals', 'pantry'])).toBe(200);
    await page.reload();
    await page.waitForTimeout(800);
    await swipe(true);
    await expect(page).toHaveURL(/\/meals$/);
    await swipe(true);
    await expect(page).toHaveURL(/\/pantry$/);
    await swipe(true); // the last one: it doesn't go round
    await page.waitForTimeout(400);
    await expect(page).toHaveURL(/\/pantry$/);
    await swipe(false);
    await expect(page).toHaveURL(/\/meals$/);
    await swipe(false);
    await expect(page).toHaveURL(/\/edit$/);
    await swipe(false); // the calendar: a swipe to the right goes nowhere
    await page.waitForTimeout(400);
    await expect(page).toHaveURL(/\/edit$/);
  } finally {
    await setPins(page, before); // (the tablet is shared by the other tests)
  }
});

test('a page swiped to goes back to the calendar after 2 quiet minutes', async ({ as }) => {
  const page = await as('tablet');
  const before = await pinsOf(page);
  try {
    await setPins(page, []); // nothing pinned: a swipe goes to Chores
    await page.clock.install();
    await page.reload();
    const b = (await page.locator('.slate').boundingBox())!;
    await page.mouse.move(b.x + 800, b.y + 300);
    await page.mouse.down();
    await page.mouse.move(b.x + 600, b.y + 305, { steps: 6 });
    await page.mouse.move(b.x + 400, b.y + 310, { steps: 6 });
    await page.mouse.up();
    await expect(page).toHaveURL(/\/chores$/);
    await page.clock.fastForward('01:30');
    await page.mouse.click(600, 120); // a tap: the 2 minutes start again
    await page.clock.fastForward('01:30');
    await expect(page).toHaveURL(/\/chores$/);
    await page.clock.fastForward('00:40');
    await expect(page).toHaveURL(/\/edit$/);
  } finally {
    await setPins(page, before);
  }
});

test('change the chores: add one for the kids, each their own', async ({ as, board }) => {
  await exampleChores(board);
  const page = await as('tablet', { path: '/chores' });
  await page.locator('#chEdit').click();
  await expect(page.locator('#chedmodal')).toBeVisible();
  await page.getByRole('radio', { name: 'Every week' }).click();
  await page.locator('#chedAddC').click();
  await page.keyboard.type('Water the plants');
  const row = page.locator('#chedList .chedc').last();
  await row.locator('.who .seg', { hasText: 'Theo' }).click();
  await row.locator('.who .seg', { hasText: 'Nora' }).click();
  await row.locator('.who .seg', { hasText: 'Each does their own' }).click();
  await page.locator('#chedSave').click();
  await expect(page.locator('#chedmodal')).toHaveCount(0);
  const c = (await (await board.admin.api('/api/chores')).json()).chores.find(x => x.title === 'Water the plants');
  expect(c).toMatchObject({ every: 'week', who: ['kid1', 'kid2'], each: true });
});

test('a phone: /chores asks to sign in, then shows the chores on one page', async ({ as, board }) => {
  await exampleChores(board);
  const out = await as('phone-signed-out');
  await expect(out.locator('#signpad')).toBeVisible();
  await expect(out.locator('#pairpad')).toHaveCount(0);
  const phone = await as('phone');
  await expect(phone.locator('body')).toHaveClass(/chorespage/);
  await expect(phone.locator('#chores h2')).toHaveText('Chores');
  await phone.locator('.chitem', { hasText: 'Quick living room pickup' }).click();
  await expect.poll(() => doneOf(board, 'Quick living room pickup')).toBe(1);
  await phone.locator('.chitem', { hasText: 'Quick living room pickup' }).click(); // and back, for the other tests
  await expect.poll(() => doneOf(board, 'Quick living room pickup')).toBe(0);
  // nothing runs off the side of the phone
  expect(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test("a kid's tablet shows only their chores, and they can only tick their own", async ({ as, board }) => {
  await exampleChores(board);
  const kid = await as('kid:kid1');
  await expect(kid).toHaveURL(/\/chores$/); // a kid's tablet opens on their chores
  await expect(kid.locator('#chores h2')).toHaveText('Theo’s chores');
  await expect(kid.locator('#chCols .chcol h3').first()).toContainText('Just me');
  await kid.locator('.chitem', { hasText: 'Put dirty clothes in hampers' }).click();
  await expect.poll(async () => (await doneOf(board, 'Put dirty clothes in hampers')).kid1).toBe(1);
  expect((await doneOf(board, 'Put dirty clothes in hampers')).kid2).toBe(0);
  // someone else's chore, straight to the server: refused
  const dad = (await (await board.admin.api('/api/chores')).json()).chores.find(
    c => c.who.length === 1 && c.who[0] === 'dad'
  );
  expect(
    await kid.evaluate(
      id =>
        fetch('/api/chores/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Chalk': '1' },
          body: JSON.stringify({ id })
        }).then(r => r.status),
      dad.id
    )
  ).toBe(403);
});

test('the wall shows chores when swiped to, but can’t tick them', async ({ as, board }) => {
  await exampleChores(board);
  const wall = await as('wall');
  const b = (await wall.locator('.slate').boundingBox())!;
  await wall.mouse.move(b.x + 800, b.y + 300);
  await wall.mouse.down();
  await wall.mouse.move(b.x + 600, b.y + 305, { steps: 6 });
  await wall.mouse.move(b.x + 400, b.y + 310, { steps: 6 });
  await wall.mouse.up();
  await expect(wall).toHaveURL(/\/chores$/);
  await expect(wall.locator('.chitem').first()).toBeVisible();
  await expect(wall.locator('.chitem.can')).toHaveCount(0);
  await expect(wall.locator('#chBack')).toBeVisible();
});

test('reward jars: add a jar, add pieces, take one out', async ({ as, board }) => {
  await board.admin.post('/api/jars', { jars: [] });
  const page = await as('tablet', { path: '/jars' });
  await page.locator('.jaradd').click();
  await page.locator('#jName').fill('Nora');
  await page.locator('#jSave').click();
  await expect(page.locator('#jarSheet')).toHaveCount(0);
  await page.getByRole('button', { name: /Add a star/ }).click();
  await page.getByRole('button', { name: /Add a star/ }).click();
  await expect.poll(async () => (await (await board.admin.api('/api/jars')).json())[0]?.count).toBe(2);
  await page.getByRole('button', { name: 'Take one out' }).click();
  await expect
    .poll(async () => (await (await board.admin.api('/api/jars')).json())[0])
    .toMatchObject({ name: 'Nora', count: 1 });
  await board.admin.post('/api/jars', { jars: [] });
});

test('the big jar: tap a jar in Notes, fill it, ★ Reward empties only that one', async ({ as, board }) => {
  await board.admin.post('/api/jars', {
    jars: [
      { id: 'nora', name: 'Nora', pieces: ['star'], count: 2, goal: 3 },
      { id: 'leo', name: 'Leo', pieces: ['heart'], count: 4, goal: 10 }
    ]
  });
  const page = await as('family');
  const jar = page.locator('.notes .jar[data-id="nora"]');
  await expect(jar).toBeVisible();
  await jar.click();
  const big = page.locator('#jarZoom');
  await expect(big.locator('#jzTitle')).toHaveText('Nora’s Jar');
  await expect(page).toHaveURL(/\/edit$/); // it opened the jar, not the Jars page
  await big.getByRole('button', { name: 'Add a heart' }).click();
  await expect(big.locator('#jzCount')).toContainText('Full! 3 / 3');
  await big.getByRole('button', { name: '★ Reward!' }).click(); // ("Are you sure?" -> yes)
  await expect
    .poll(async () =>
      ((await (await board.admin.api('/api/jars')).json()) as { id: string; count: number }[]).map(j => [j.id, j.count])
    )
    .toEqual([
      ['nora', 0],
      ['leo', 4]
    ]);
  await page.mouse.click(10, 10); // outside the jar: it goes back
  await expect(page.locator('#jarZoom.open')).toHaveCount(0);
  expect(page.errors).toEqual([]);
  await board.admin.post('/api/jars', { jars: [] });
});

test('meal plan: from the board, add meals, they show in the Notes column', async ({ as, board }) => {
  await board.admin.post('/api/meals', { items: [] });
  const page = await as('tablet');
  await page.locator('.nslot-meals').click();
  await expect(page).toHaveURL(/\/meals$/);
  const wall = await as('wall');
  await board.admin.post('/api/meals', { items: [{ t: 'Tacos' }, { t: 'Spaghetti' }] });
  await expect(wall.locator('.nslot-meals')).toContainText('Tacos', { timeout: 15_000 });
  await expect(wall.locator('.nslot-meals')).toContainText('Spaghetti');
});
