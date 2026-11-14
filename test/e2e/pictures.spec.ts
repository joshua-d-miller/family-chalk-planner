/*
===============================================================================
 Family Chalk Planner | Tests | Browser | pictures.spec.ts
===============================================================================
 Version:   0.17.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-14
 Updated:   2026-11-14

 Purpose:
     The reworked Pictures on a family screen: two taps from the calendar,
     no keyboard popping up, this month's pack first, a search through
     everything (a turkey is the bird), ★ into Favorites for every screen,
     and a picture placed then ready to move or resize.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.17.0    2026-11-14   joshua    New file.
                        claude
===============================================================================
*/

import { expect, test } from './fixtures.ts';

test('pictures on a family screen: packs, search, favorites, placed and picked', async ({ as, board }) => {
  const fam = await as('family', { context: { viewport: { width: 1280, height: 720 } } });
  // two taps: Edit the calendar, then ⭐ Pictures
  await fam.locator('#editBtn').click();
  await fam.locator('#picturesBtn').click();
  const lib = fam.locator('#libSheet');
  await expect(lib).toBeVisible();
  // the search box doesn't take the focus (no keyboard popping up on a touch screen)
  expect(await fam.evaluate(() => document.activeElement?.className || '')).not.toContain('clipq');
  // Favorites, then the packs; one marked for this month, first after Favorites
  const cards = lib.locator('.packs .pack');
  await expect(cards.first()).toHaveId('pack-fav');
  await expect(cards.nth(1)).toHaveClass(/now/);
  await expect(lib.locator('#pack-gif')).toBeVisible();
  if (process.env.SHOTS) await fam.screenshot({ path: 'test-results/pictures-home.png' });
  // a pack
  await lib.locator('#pack-thanksgiving').click();
  await expect.poll(() => lib.locator('.ptile').count()).toBeGreaterThan(20);
  if (process.env.SHOTS) await fam.screenshot({ path: 'test-results/pictures-pack.png' });
  // search: every picture, the bird first
  await lib.locator('.clipq').fill('turkey');
  await expect(lib.locator('.ptile .ctile img').first()).toHaveAttribute('src', /\/api\/clip\/turkey\.svg/);
  if (process.env.SHOTS) await fam.screenshot({ path: 'test-results/pictures-search.png' });
  // ★ pins it to Favorites, for every screen
  await lib.locator('.ptile').first().locator('.pin').click();
  await expect(lib.locator('.ptile').first().locator('.pin')).toHaveAttribute('aria-pressed', 'true');
  await expect
    .poll(async () => (await (await board.admin.api('/api/clip/favorites')).json()).items)
    .toContain('turkey');
  await lib.locator('.clipq').fill('');
  await lib.locator('#picBack').click();
  await lib.locator('#pack-fav').click();
  await expect(lib.locator('.ptile .ctile img[src*="/api/clip/turkey"]')).toBeVisible();
  // put it up: tap it, tap the board; it's picked, ready to move or resize
  await lib.locator('.ptile .ctile').first().click();
  await expect(fam.locator('.slate .status')).toContainText('Tap the board');
  await fam.mouse.click(500, 300);
  await expect(fam.locator('.slate img[src*="/api/clip/turkey"]')).toHaveCount(1);
  await expect(fam.locator('.selbar')).toBeVisible();
  if (process.env.SHOTS) await fam.screenshot({ path: 'test-results/pictures-placed.png' });
  // tidy up
  await fam.locator('.selbar').getByRole('button', { name: 'Erase' }).click();
  await board.admin.post('/api/clip/favorites', { id: 'turkey', on: false });
  expect(fam.errors).toEqual([]);
});

test('look on the web: only when asked, a picture from the web placed and kept on the board', async ({ as, board }) => {
  const fam = await as('family', { context: { viewport: { width: 1280, height: 720 } } });
  // Openverse stands in here (the board's own handling of it is in test/webclip.test.ts)
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
  const kept = (await (
    await board.admin.api('/api/media', { method: 'POST', body: png, headers: { 'Content-Type': 'image/png' } })
  ).json()) as { src: string };
  const id = 'aaaaaaaa-1111-4111-8111-000000000001';
  let searches = 0;
  await fam.route('**/api/clip/web?*', r => {
    searches++;
    return r.fulfill({ json: { found: [{ id, title: 'Red kite', creator: 'Someone', source: 'x', w: 4, h: 3 }] } });
  });
  await fam.route(`**/api/clip/web/${id}/thumb`, r => r.fulfill({ body: png, contentType: 'image/png' }));
  await fam.route('**/api/clip/web/keep', r => r.fulfill({ json: kept }));
  await fam.locator('#editBtn').click();
  await fam.locator('#picturesBtn').click();
  const lib = fam.locator('#libSheet');
  await lib.locator('.clipq').fill('kite');
  // the board's own pictures first; the web only when asked
  await expect(lib.locator('#webSearch')).toContainText('Look on the web for “kite”');
  expect(searches).toBe(0);
  await lib.locator('#webSearch').click();
  await expect(lib.locator('.webpics .ctile.web')).toHaveCount(1);
  expect(searches).toBe(1);
  if (process.env.SHOTS) await fam.screenshot({ path: 'test-results/pictures-web.png' });
  await lib.locator('.webpics .ctile.web').click();
  await expect(fam.locator('.slate .status')).toContainText('Tap the board');
  await fam.mouse.click(500, 300);
  await expect(fam.locator(`.slate img[src*="${kept.src}"]`)).toHaveCount(1);
  await fam.locator('.selbar').getByRole('button', { name: 'Erase' }).click();
  expect(fam.errors).toEqual([]);
});
