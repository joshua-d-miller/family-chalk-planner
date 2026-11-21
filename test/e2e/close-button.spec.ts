/*
===============================================================================
 Family Chalk Planner | Tests | Browser | close-button.spec.ts
===============================================================================
 Version:   1.2.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-17
 Updated:   2026-11-21

 Purpose:
     Every card and the ☰ menu has a ✕ at its top right. It stays in reach
     while a long card scrolls, closes the card without saving (like
     Cancel), and isn't what a card focuses when it opens.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.1.0    2026-11-17   joshua    New file.
                        claude

 1.2.0    2026-11-21   joshua    A card with changes asks "Discard your
                        claude    changes?" first; one without closes at once.
===============================================================================
*/

import { expect, test } from './fixtures.ts';

test('a card closes with the ✕ at its top right, even scrolled down', async ({ as }) => {
  const tab = await as('tablet');
  // --------------------------- //
  // | A new event, then the ✕ | //
  // --------------------------- //
  await tab.locator('#addBtn').click();
  const card = tab.locator('.sheet[role="dialog"]');
  const x = card.locator('.closex');
  await expect(card).toBeVisible();
  await expect(x).toBeVisible();
  await expect(x).toHaveAttribute('aria-label', 'Close');
  await expect(tab.locator('#evTitle')).toBeFocused(); // the first field, not the ✕
  // the ✕ sits at the card's top right
  const cardBox = (await card.boundingBox())!;
  const xBox = (await x.boundingBox())!;
  expect(xBox.x + xBox.width).toBeGreaterThan(cardBox.x + cardBox.width - 70);
  expect(xBox.y).toBeLessThan(cardBox.y + 60);
  expect(xBox.width).toBeGreaterThanOrEqual(44); // a finger-sized target

  // ------------------------------------------ //
  // | Scrolled to the bottom, still in reach | //
  // ------------------------------------------ //
  await tab.setViewportSize({ width: 800, height: 420 }); // short enough that the card scrolls
  await card.evaluate(el => (el.scrollTop = el.scrollHeight));
  await expect(x).toBeInViewport();
  if (process.env.SHOTS) await tab.screenshot({ path: 'test-results/close-scrolled.png' });

  // ---------------------------------- //
  // | The ✕ closes it, nothing saved | //
  // ---------------------------------- //
  await tab.locator('#evTitle').fill('Should not be saved');
  await x.click();
  // something was typed: it asks first ("Keep editing" leaves it as it was)
  await expect(card.locator('.discard')).toContainText('Discard your changes?');
  await card.locator('#keepEditing').click();
  await expect(card.locator('.discard')).toHaveCount(0);
  await expect(tab.locator('#evTitle')).toHaveValue('Should not be saved');
  await tab.keyboard.press('Escape'); // (Escape asks too)
  await card.locator('#discardBtn').click();
  await expect(card).toHaveCount(0);
  await expect(tab.getByText('Should not be saved')).toHaveCount(0);
});

test('the ☰ menu closes with its ✕', async ({ as }) => {
  const fam = await as('family');
  await fam.locator('#menuBtn').click();
  const panel = fam.locator('#menuPanel');
  await expect(panel).toBeVisible();
  const x = panel.locator('.closex');
  await expect(x).toHaveAttribute('aria-label', 'Close the menu');
  if (process.env.SHOTS) await fam.screenshot({ path: 'test-results/close-menu.png' });
  await x.click();
  await expect(panel).toHaveCount(0);
});
