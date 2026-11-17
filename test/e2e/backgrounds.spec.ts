/*
===============================================================================
 Family Chalk Planner | Tests | Browser | backgrounds.spec.ts
===============================================================================
 Version:   1.1.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-17
 Updated:   2026-11-17

 Purpose:
     The new backgrounds in 🎨 Board style (navy and burgundy chalkboards,
     felt letter board, brick, burlap, white barnwood, graph paper) and a
     photo of your own: picked on the Style tab, shown on the board as you
     pick, and saved. (sky.jpg beside this file is the test photo.)
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.1.0    2026-11-17   joshua    New file.
                        claude
===============================================================================
*/

import path from 'node:path';
import { expect, test } from './fixtures.ts';

test('the new backgrounds, and a photo of your own', async ({ as, board }) => {
  const t = await as('tablet', { path: '/edit' });
  await t.locator('#styleBtn').click();
  const card = t.locator('#styleSheet');
  await card.getByRole('radio', { name: 'Every month' }).click();
  if (process.env.SHOTS) await card.screenshot({ path: 'test-results/bg-tiles.png' });

  // ---------------------------------------------- //
  // | Each one shows on the board as it's picked | //
  // ---------------------------------------------- //
  for (const sf of ['navy', 'burgundy', 'felt', 'brick', 'burlap', 'barn', 'graph']) {
    await card.locator('#surface-' + sf).click();
    await expect(t.locator('#slate')).toHaveAttribute('data-surface', sf);
    if (process.env.SHOTS) await t.screenshot({ path: `test-results/bg-${sf}.png` });
  }

  // ------------------------------------- //
  // | Your photo: picked, dimmed, saved | //
  // ------------------------------------- //
  await t.locator('#surfacePhoto').setInputFiles(path.join(import.meta.dirname, 'sky.jpg'));
  await expect(t.locator('#slate')).toHaveAttribute('data-surface', 'photo');
  await expect
    .poll(() =>
      t.evaluate(() =>
        ['#stage', '#slate'].map(q => getComputedStyle(document.querySelector(q)!).backgroundImage).join(' ')
      )
    )
    .toContain('/api/media/');
  await expect(card).toContainText('Your photo is dimmed');
  if (process.env.SHOTS) await t.screenshot({ path: 'test-results/bg-photo.png' });
  await card.getByRole('button', { name: 'Save' }).click();
  await expect.poll(async () => (await (await board.admin.api('/api/theme')).json()).s).toBe('photo');
  await board.admin.post('/api/theme', { p: 'classic', o: {} });
});
