/*
===============================================================================
 Family Chalk Planner | Tests | Browser | console-photos.spec.ts
===============================================================================
 Version:   1.1.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-17
 Updated:   2026-11-28

 Purpose:
     The admin console's ⚙️ Board → Photos: which photos to show and how
     many copies the board keeps, and the photo picker (a small picture of
     every photo in the album to tick, saved on the board).
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.1.0    2026-11-17   joshua    New file.
                        claude

 1.3.0    2026-11-28   joshua    More albums in the console.
                        claude
===============================================================================
*/

import { expect, test } from './fixtures.ts';

test('the console picks which photos show, and how many copies are kept', async ({ as, board }) => {
  const page = await as('admin', { path: '/admin' });
  await page.locator('#tabs button[data-t="board"]').click();

  // -------------------------------------------- //
  // | Each choice shows only what goes with it | //
  // -------------------------------------------- //
  await expect(page.locator('#bfRandWrap')).toBeHidden();
  await page.locator('#bfPick').selectOption('random');
  await expect(page.locator('#bfRandWrap')).toBeVisible();
  await page.locator('#bfKeep').selectOption('few');
  await expect(page.locator('#bfKeepN')).toBeVisible();
  await expect(page.locator('#bfKeepNote')).toBeVisible();

  // ---------------------------------- //
  // | The picker: tick some and save | //
  // ---------------------------------- //
  await page.locator('#bfPick').selectOption('picked');
  await expect(page.locator('#bfRandWrap')).toBeHidden();
  await page.locator('#bfPickBtn').click();
  const tiles = page.locator('#bfPickGrid label');
  await expect(tiles.first()).toBeVisible();
  const total = await tiles.count();
  expect(total).toBeGreaterThan(1);
  // the small pictures load (the test album's are 1×1)
  await expect
    .poll(() =>
      tiles
        .nth(0)
        .locator('img')
        .evaluate(i => (i as HTMLImageElement).naturalWidth)
    )
    .toBeGreaterThan(0);
  await expect(page.locator('#bfPickInfo')).toContainText('Nothing ticked');
  await tiles.nth(0).locator('input').check();
  await expect(tiles.nth(0)).toHaveClass('on');
  await expect(page.locator('#bfPickInfo')).toContainText(`1 of ${total} ticked`);
  if (process.env.SHOTS) await page.locator('#bfPicker').screenshot({ path: 'test-results/console-picker.png' });
  await page.locator('#bfPickSave').click();
  await expect(page.locator('#bfPickErr')).toContainText('Saved');
  await expect(page.locator('#bfPickCount')).toContainText('1 picked');
  const c = await (await board.admin.api('/api/board-settings/photo-choices')).json();
  expect(c.picked).toHaveLength(1);
});

test('the console adds more albums: a share link or an Immich album, each with its own id', async ({ as }) => {
  const page = await as('admin', { path: '/admin' });
  await page.locator('#tabs button[data-t="board"]').click();
  const add = async (name: string, what: string) => {
    await page.locator('#bfAlbName').fill(name);
    await page.locator('#bfAlbWhat').fill(what);
    await page.locator('#bfAlbAdd').click();
  };
  await expect(page.locator('#bfAlbums .item')).toHaveCount(1); // the test board's second album, Our trip
  await page.locator('#bfAlbAdd').click();
  await expect(page.locator('#bfAlbErr')).toContainText('Give it a name');
  await add('Summer trip', 'https://www.icloud.com/sharedalbum/#B0abc');
  await add('Summer trip', 'Grandkids');
  await expect(page.locator('#bfAlbums .item')).toHaveCount(3);
  await expect(page.locator('#bfAlbums')).toContainText('Immich: Grandkids');
  expect(JSON.parse(await page.locator('#bfAlbumsVal').inputValue()).slice(1)).toEqual([
    { id: 'summer-trip', name: 'Summer trip', url: 'https://www.icloud.com/sharedalbum/#B0abc' },
    { id: 'summer-trip-2', name: 'Summer trip', immich: 'Grandkids' }
  ]);
  await page.locator('#bfAlbums .item').nth(1).getByRole('button', { name: 'Remove' }).click();
  await expect(page.locator('#bfAlbums .item')).toHaveCount(2);
  expect(page.errors).toEqual([]);
});
