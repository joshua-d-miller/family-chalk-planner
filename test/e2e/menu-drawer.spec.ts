/*
===============================================================================
 Family Chalk Planner | Tests | Browser | menu-drawer.spec.ts
===============================================================================
 Version:   0.17.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-12
 Updated:   2026-11-12

 Purpose:
     A family screen that swaps the cork for the ☰ button: on the right,
     on the left, and back to the cork. The drawer has the calendar's
     tools and the pages; drawing puts the tools in a rail down that side.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.17.0    2026-11-12   joshua    New file.
                        colby
                        claude
===============================================================================
*/

import { expect, test } from './fixtures.ts';

test('a family screen can swap the cork for the ☰ button on either side', async ({ as }) => {
  const fam = await as('family');
  // ----------------------------------- //
  // | The cork, then the button right | //
  // ----------------------------------- //
  await expect(fam.locator('#editBtn')).toBeVisible();
  await fam.locator('#menuBtn').click();
  await fam.locator('#menuStyle-right').click();
  await expect(fam.locator('#editBtn')).toHaveCount(0); // no cork
  await expect(fam.locator('#menuFab')).toHaveClass(/right/);
  // the board takes the cork's room (a family screen has no frame)
  await expect(fam.locator('#board')).toHaveCSS('height', '642px');
  if (process.env.SHOTS) await fam.screenshot({ path: 'test-results/menu-right-board.png' });

  // ------------------------------------- //
  // | The drawer: tools, then the pages | //
  // ------------------------------------- //
  await fam.locator('#menuFab').click();
  const panel = fam.locator('#menuPanel');
  await expect(panel).toHaveClass(/right/);
  await expect(panel.locator('#addBtn')).toBeVisible();
  await expect(panel.locator('#drawBtn')).toContainText('Decorate');
  await expect(panel.locator('a[href="chores"]')).toBeVisible();
  if (process.env.SHOTS) await fam.screenshot({ path: 'test-results/menu-right-open.png' });

  // ----------------------------- //
  // | Decorating: the tool rail | //
  // ----------------------------- //
  await panel.locator('#drawBtn').click();
  await expect(fam.locator('#menuPanel')).toHaveCount(0);
  const rail = fam.locator('.cork.rail.right');
  await expect(rail).toBeVisible();
  await expect(rail.locator('#stampsBtn')).toBeVisible();
  await expect(fam.locator('#menuFab')).toHaveCount(0);
  if (process.env.SHOTS) await fam.screenshot({ path: 'test-results/menu-right-rail.png' });
  await rail.locator('#drawBtn').click(); // Done
  await expect(fam.locator('.cork.rail')).toHaveCount(0);
  await expect(fam.locator('#menuFab')).toBeVisible();

  // ------------------------------- //
  // | A page: the button there too | //
  // ------------------------------- //
  await fam.locator('#menuFab').click();
  await fam.locator('#menuPanel a[href="chores"]').click();
  await expect(fam).toHaveURL(/\/chores$/);
  await expect(fam.locator('.corkbar')).toHaveCount(0);
  await expect(fam.locator('#menuFab')).toHaveClass(/right/);

  // ------------------------------ //
  // | The left, then the cork again | //
  // ------------------------------ //
  await fam.locator('#menuFab').click();
  await fam.locator('#menuStyle-left').click();
  await expect(fam.locator('#menuFab')).toHaveClass(/left/);
  await fam.locator('#menuFab').click();
  await expect(fam.locator('#menuPanel')).not.toHaveClass(/right/);
  if (process.env.SHOTS) {
    await fam.waitForTimeout(400); // the drawer has slid in
    await fam.screenshot({ path: 'test-results/menu-left-page.png' });
  }
  await fam.locator('#menuStyle-cork').click();
  await expect(fam.locator('#menuFab')).toHaveCount(0);
  await expect(fam.locator('.corkbar')).toBeVisible();
  expect(fam.errors).toEqual([]);
});

test('a phone keeps its tab bar (no menu choice there)', async ({ as }) => {
  const phone = await as('phone');
  await expect(phone.locator('#tabbar')).toBeVisible();
  await phone.locator('#moreBtn').click();
  await expect(phone.locator('#menuStyle-right')).toHaveCount(0);
});
