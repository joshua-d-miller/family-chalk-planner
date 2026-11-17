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
