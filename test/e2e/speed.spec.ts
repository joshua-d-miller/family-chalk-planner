/*
===============================================================================
 Family Chalk Planner | Tests | Browser | speed.spec.ts
===============================================================================
 Version:   1.3.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-28
 Updated:   2026-11-28

 Purpose:
     The speed budget: what a wall downloads to start (its code, kept under
     a limit, without the editors, the drawing tools or the pages it never
     opens), and ?perf's box.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.3.0     2026-11-28   joshua    New file.
                        claude
===============================================================================
*/

import { test, expect } from './fixtures.ts';

// the wall's code (uncompressed): about 430 KB in 1.3.0; raise this only on purpose
const WALL_JS_KB = 480;

test('the speed budget: a wall downloads less than the limit, and nothing it only needs to edit', async ({ as }) => {
  const wall = await as('wall');
  const js: { url: string; bytes: number }[] = [];
  wall.on('response', async r => {
    if (!/\.js(\?|$)/.test(r.url())) return;
    try {
      js.push({ url: r.url(), bytes: (await r.body()).length });
    } catch {
      // (a response cut short by the reload is no download)
    }
  });
  await wall.reload();
  await expect(wall.locator('.slate')).toBeVisible();
  await wall.waitForTimeout(2500); // anything fetched ahead would come now
  const kb = Math.round(js.reduce((n, f) => n + f.bytes, 0) / 1024);
  console.log(`wall code: ${kb} KB in ${js.length} files: ${js.map(f => f.url.split('/').pop()).join(' ')}`);
  expect(kb).toBeLessThan(WALL_JS_KB);
  expect(js.map(f => f.url).join(' ')).not.toMatch(/Draw|Tools|Library|Editor|Settings|Chores|perf/);
});

test('?perf: how the screen is keeping up, only when asked for', async ({ as }) => {
  const wall = await as('wall', { path: '/?perf' });
  await expect(wall.locator('#perfBox')).toContainText(/\d+ fps/);
  await expect(wall.locator('#perfBox')).toContainText(/elements/);
  expect(wall.errors).toEqual([]);
});
