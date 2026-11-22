/*
===============================================================================
 Family Chalk Planner | Tests | Browser | console-screens.spec.ts
===============================================================================
 Version:   1.1.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-17
 Updated:   2026-11-17

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
