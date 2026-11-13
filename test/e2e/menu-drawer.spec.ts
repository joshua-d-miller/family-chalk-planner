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
 0.17.0    2026-11-12   joshua    New file. On a 16:9 screen (the kitchen's),
                                  nothing on the board is under the buttons.
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
  // + Add event: one tap, beside the ☰
  await fam.locator('.fabrow #addBtn').click();
  await expect(fam.locator('#evTitle')).toBeVisible();
  await fam.keyboard.press('Escape');
  await expect(fam.locator('#evTitle')).toHaveCount(0);
  await fam.locator('#menuFab').click();
  const panel = fam.locator('#menuPanel');
  await expect(panel).toHaveClass(/right/);
  await expect(panel.locator('#addBtn')).toHaveCount(0); // (it has its own button)
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

// ---------------------------------------- //
// | A 16:9 screen: nothing under the buttons | //
// ---------------------------------------- //
// Overlap of two boxes on the screen (0: they don't touch)
const overlap = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

test('on a 16:9 screen the buttons cover nothing on the board, on either side', async ({ as }) => {
  for (const [w, h] of [
    [1280, 720],
    [1920, 1080]
  ] as const) {
    const fam = await as('family', { context: { viewport: { width: w, height: h } } });
    await fam.locator('#menuBtn').click();
    await fam.locator('#menuStyle-right').click();
    const row = fam.locator('.fabrow');
    await expect(row).toHaveClass(/right/);
    // on the right: the Notes column's list stops above the buttons (the board keeps its size)
    const rowBox = (await row.boundingBox())!;
    const lastNote = (await fam.locator('.slate .notes > *').last().boundingBox())!;
    expect(lastNote.y + lastNote.height, `${w}x${h}: Notes ends above the buttons`).toBeLessThanOrEqual(rowBox.y);
    expect(overlap(rowBox, (await fam.locator('#grid').boundingBox())!), `${w}x${h}: the calendar is clear`).toBe(0);
    if (process.env.SHOTS) await fam.screenshot({ path: `test-results/k-right-${w}x${h}.png` });
    // on the left: the board leaves room under itself, so the last Sunday is clear
    await fam.locator('#menuFab').click();
    await fam.locator('#menuStyle-left').click();
    await expect(fam.locator('.fabrow')).toHaveClass(/left/);
    await fam.waitForTimeout(300); // the board has resized
    const leftBox = (await fam.locator('.fabrow').boundingBox())!;
    const grid = (await fam.locator('#grid').boundingBox())!;
    expect(overlap(leftBox, grid), `${w}x${h}: the calendar is clear of the buttons`).toBe(0);
    if (process.env.SHOTS) await fam.screenshot({ path: `test-results/k-left-${w}x${h}.png` });
    await fam.locator('#menuFab').click();
    await fam.locator('#menuStyle-cork').click();
    await expect(fam.locator('#editBtn')).toBeVisible();
    expect(fam.errors).toEqual([]);
  }
});
