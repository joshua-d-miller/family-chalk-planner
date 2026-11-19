/*
===============================================================================
 Family Chalk Planner | Tests | Browser | looks.spec.ts
===============================================================================
 Version:   1.1.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-17
 Updated:   2026-11-17

 Purpose:
     🎨 Look of cards and menus: a screen picks light, dark or high
     contrast for its cards and ☰ menu, an accent color and larger text.
     It's kept on the board (still there after a reload), and the calendar
     keeps its own style.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.1.0    2026-11-17   joshua    New file.
                        claude
===============================================================================
*/

import { expect, test } from './fixtures.ts';

test('a screen picks the look of its cards and menu, and keeps it', async ({ as }) => {
  const fam = await as('family');
  const bg = (sel: string) => fam.locator(sel).evaluate(el => getComputedStyle(el).backgroundColor);
  const boardBefore = await bg('#board');

  // ----------------------------- //
  // | From the ☰ menu: the card | //
  // ----------------------------- //
  await fam.locator('#menuBtn').click();
  await fam.locator('#lookBtn').click();
  await expect(fam.locator('#menuPanel')).toHaveCount(0);
  const card = fam.locator('#lookCard');
  await expect(card).toBeVisible();
  expect(await bg('#lookCard')).toBe('rgb(22, 23, 22)'); // chalk: the slate

  // -------------------------------------- //
  // | Each look changes the card at once | //
  // -------------------------------------- //
  const shots: [string, string][] = [
    ['Light', 'rgb(251, 249, 244)'],
    ['Dark', 'rgb(29, 30, 33)'],
    ['High contrast', 'rgb(0, 0, 0)']
  ];
  for (const [name, color] of shots) {
    await card.getByRole('radio', { name, exact: true }).click();
    await expect.poll(() => bg('#lookCard')).toBe(color);
    if (process.env.SHOTS)
      await fam.screenshot({ path: `test-results/look-${name.toLowerCase().replace(/ /g, '-')}.png` });
  }

  // ------------------------------ //
  // | An accent, and larger text | //
  // ------------------------------ //
  await card.getByRole('radio', { name: 'Light', exact: true }).click();
  await card.getByRole('radio', { name: '#2F8F83' }).click();
  await expect.poll(() => card.locator('h3').evaluate(el => getComputedStyle(el).color)).toBe('rgb(47, 143, 131)');
  const before = await card.locator('h3').evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  await card.getByRole('radio', { name: 'Larger', exact: true }).click();
  await expect
    .poll(() => card.locator('h3').evaluate(el => parseFloat(getComputedStyle(el).fontSize)))
    .toBeGreaterThan(before * 1.2);
  if (process.env.SHOTS) await fam.screenshot({ path: 'test-results/look-light-accent-larger.png' });
  await card.locator('.closex').click();

  // --------------------------------------------- //
  // | The calendar keeps its style; a reload too | //
  // --------------------------------------------- //
  expect(await bg('#board')).toBe(boardBefore);
  await fam.reload();
  await fam.locator('#addBtn').click();
  await expect(fam.locator('.sheet[role="dialog"]')).toBeVisible();
  expect(await bg('.sheet[role="dialog"]')).toBe('rgb(251, 249, 244)');
  if (process.env.SHOTS) await fam.screenshot({ path: 'test-results/look-light-event.png' });
  await fam.keyboard.press('Escape');
  await fam.locator('#menuBtn').click();
  expect(await bg('#menuPanel')).toBe('rgb(251, 249, 244)');
  if (process.env.SHOTS) await fam.screenshot({ path: 'test-results/look-light-menu.png' });
  await fam.locator('#menuPanel .closex').click();

  // back to chalk, for the other tests on this board
  await fam.locator('#menuBtn').click();
  await fam.locator('#lookBtn').click();
  await card.getByRole('radio', { name: 'Chalk', exact: true }).click();
  await card.getByRole('radio', { name: 'The look’s own' }).click();
  await card.getByRole('radio', { name: 'Normal', exact: true }).click();
  await expect.poll(() => bg('#lookCard')).toBe('rgb(22, 23, 22)');
});

test('Settings opens the same card, and its parts take the look', async ({ as }) => {
  const tab = await as('tablet', { path: '/settings' });
  await tab.locator('#lookOpen').click();
  const card = tab.locator('#lookCard');
  await card.getByRole('radio', { name: 'Dark', exact: true }).click();
  await card.locator('.closex').click();
  await expect
    .poll(() =>
      tab
        .locator('#settings .scard')
        .first()
        .evaluate(el => getComputedStyle(el).backgroundColor)
    )
    .toBe('rgb(29, 30, 33)');
  if (process.env.SHOTS) await tab.screenshot({ path: 'test-results/look-dark-settings.png' });
  // back to chalk
  await tab.locator('#lookOpen').click();
  await card.getByRole('radio', { name: 'Chalk', exact: true }).click();
});
