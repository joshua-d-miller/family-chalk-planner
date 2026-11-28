/*
===============================================================================
 Family Chalk Planner | Tests | Browser | console-screens.spec.ts
===============================================================================
 Version:   1.3.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-17
 Updated:   2026-11-28

 Purpose:
     The admin console's 📺 Screens tab: a paired screen's list of roles
     always shows the kid's tablet. Before anyone is in 🧹 Chores it's
     there but greyed out, saying to add the family first; after, there's
     one for each person.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.1.0    2026-11-17   joshua    New file (only View only and Family showed
                        claude    while Chores had nobody in it).

 1.3.0    2026-11-28   joshua    A wall's pages to swipe to, its month
                        claude    arrows and how soon a page goes back.
===============================================================================
*/

import { expect, test } from './fixtures.ts';

test('a paired screen can always see the kid’s tablet role', async ({ as, board }) => {
  // (the board is shared with other tests: start with nobody in Chores, and put back what was there)
  const was = await (await board.admin.api('/api/chores')).json();
  await board.admin.post('/api/chores/save', { people: [], chores: [] });
  await as('wall'); // pairs a screen, so the list has one
  const page = await as('admin', { path: '/admin' });
  const role = page.locator('#dvList select[aria-label="What it may do"]').first();

  // ------------------------ //
  // | Nobody in Chores yet | //
  // ------------------------ //
  await expect(role.locator('option[value="view"]')).toHaveCount(1);
  await expect(role.locator('option[value="family"]')).toHaveCount(1);
  const hint = role.locator('option', { hasText: 'Kid’s tablet' });
  await expect(hint).toHaveCount(1);
  await expect(hint).toBeDisabled();
  await expect(hint).toContainText('add the family in 🧹 Chores first');

  // ------------------------------ //
  // | The family added in Chores | //
  // ------------------------------ //
  await board.admin.post('/api/chores/save', { example: true });
  await page.reload();
  await expect(role.locator('option[value^="kid:"]').first()).toBeAttached();
  await expect(role.locator('option[value^="kid:"]:disabled')).toHaveCount(0);
  await expect(role.locator('option', { hasText: 'add the family' })).toHaveCount(0);
  await board.admin.post('/api/chores/save', { people: was.people, chores: was.chores });
});

test('📺 Screens: a screen’s own Notes column on the month and the week, its pages and switch, or off', async ({
  as,
  board
}) => {
  const wall = await as('wall');
  await expect(wall.locator('.slate .notes')).toBeVisible();
  const page = await as('admin', { path: '/admin' });
  const devs = (await (await board.admin.api('/api/devices')).json()).devices as { id: string; role: string }[];
  const id = devs.find(d => d.role === 'view')!.id;
  const month = page.locator('#nc-month-' + id);
  if (!(await month.isVisible())) await page.getByText('📺 Screens', { exact: false }).first().click();
  const cols = async () => (await (await board.admin.api('/api/devices/notes-col')).json()).cols[id] || null;
  // off on the month: the wall's calendar takes the whole board
  await month.locator('select').selectOption('off');
  await expect.poll(cols).toMatchObject({ month: { on: false } });
  await expect(wall.locator('.slate .notes')).toHaveCount(0);
  // its own: the pages and the bottom's switch
  await month.locator('select').selectOption('on');
  await expect(wall.locator('.slate .notes')).toBeVisible();
  await month.locator('label', { hasText: 'Jars' }).first().locator('input').uncheck();
  await month.locator('label', { hasText: 'Up next' }).first().locator('input').check();
  await expect.poll(async () => (await cols())?.month?.pages).toEqual(['info', 'meals', 'upnext']);
  await expect(month.locator('label', { hasText: '3. 📅 Up next' })).toBeVisible(); // (drawn again)
  await month.locator('label', { hasText: 'Photos' }).last().locator('input').uncheck();
  await expect.poll(async () => (await cols())?.month?.bottom?.can).not.toContain('photos');
  // the week is its own: untouched
  expect((await cols())?.week).toBeUndefined();
  await month.locator('select').selectOption('');
  await expect.poll(cols).toBe(null);
  expect(page.errors).toEqual([]);
});

test('📺 Screens: a wall’s pages to swipe to, its month arrows and how soon a page goes back', async ({
  as,
  board
}) => {
  const devs = (await (await board.admin.api('/api/devices')).json()).devices as {
    id: string;
    role: string;
    name: string;
  }[];
  const { id, name } = devs.find(d => d.role === 'view')!;
  const page = await as('admin', { path: '/admin' });
  const pages = page.getByRole('checkbox', { name: '🍽️ Meal plan on ' + name });
  if (!(await pages.isVisible())) await page.getByText('📺 Screens', { exact: false }).first().click();
  const of = async (what: string) => (await (await board.admin.api('/api/devices/' + what)).json()).screens[id];
  try {
    await pages.check();
    await expect.poll(() => of('favorites')).toEqual(['meals']);
    await page.getByRole('combobox', { name: '◀ ▶ Month arrows on ' + name }).selectOption('never');
    await expect.poll(() => of('arrows')).toBe('never');
    await page.getByRole('combobox', { name: '↩ Back to the calendar on ' + name }).selectOption('0');
    await expect.poll(() => of('backafter')).toBe(0);
    // the wall: a swipe goes to the meal plan
    const wall = await as('wall');
    const b = (await wall.locator('.slate').boundingBox())!;
    await wall.mouse.move(b.x + 800, b.y + 300);
    await wall.mouse.down();
    await wall.mouse.move(b.x + 600, b.y + 305, { steps: 6 });
    await wall.mouse.move(b.x + 400, b.y + 310, { steps: 6 });
    await wall.mouse.up();
    await expect(wall).toHaveURL(/\/meals$/);
    // a screen can't set any screen's: that's the console's alone
    const tried = await wall.evaluate(async i => {
      const r = await fetch('api/devices/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Chalk': '1' },
        body: JSON.stringify({ id: i, items: ['jars'] })
      });
      return r.status;
    }, id);
    expect(tried).toBe(403);
    expect(page.errors).toEqual([]);
  } finally {
    await board.admin.post('/api/devices/favorites', { id, items: [] });
    await board.admin.post('/api/devices/arrows', { id, value: null });
    await board.admin.post('/api/devices/backafter', { id, value: null });
  }
});
