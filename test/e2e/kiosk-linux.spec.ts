/*
===============================================================================
 Family Chalk Planner | Tests | Browser | kiosk-linux.spec.ts
===============================================================================
 Version:   1.1.1
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-19
 Updated:   2026-11-19

 Purpose:
     The board as Colby runs it: Chrome in kiosk mode on Linux, on a 2K
     touch screen (and 1080p and 4K), paired as a family screen with
     someone also signed in. It opens ready to edit, with the cork, working
     month arrows, the ☰ button's drawer sized to the screen, and Reload
     the board in the menu.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.1.1    2026-11-19   joshua    New file.
                        claude
===============================================================================
*/

import { expect, test } from './fixtures.ts';

const LINUX_CHROME =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36';
const SCREENS = [
  { name: '1080p', width: 1920, height: 1080, deviceScaleFactor: 1 },
  { name: '2K', width: 2560, height: 1440, deviceScaleFactor: 1 },
  { name: '4K', width: 1920, height: 1080, deviceScaleFactor: 2 } // a 4K screen at 200%
];

for (const sc of SCREENS)
  test(`Linux kiosk on a ${sc.name} touch screen: family screen, also signed in`, async ({ as, board }) => {
    const ctx = {
      viewport: { width: sc.width, height: sc.height },
      deviceScaleFactor: sc.deviceScaleFactor,
      userAgent: LINUX_CHROME
    };
    const fam = await as('family', { path: '/', context: ctx });
    await fam.context().addCookies(
      board.editorCookie.split('; ').map(c => {
        const [name, ...v] = c.split('=');
        return { name, value: v.join('='), url: board.url };
      })
    );
    await fam.goto(board.url + '/');
    await expect(fam).toHaveURL(/\/edit$/);
    // ---------------------------------- //
    // | The cork, and arrows that work | //
    // ---------------------------------- //
    await expect(fam.locator('#addBtn')).toBeVisible();
    const month = await fam.locator('#monthName').textContent();
    await fam.getByRole('button', { name: 'Next month' }).click();
    await expect(fam.locator('#monthName')).not.toHaveText(month!);
    await fam.getByRole('button', { name: 'Previous month' }).click();
    await expect(fam.locator('#monthName')).toHaveText(month!);
    // -------------------------------------------- //
    // | The ☰ button: its drawer fits the screen | //
    // -------------------------------------------- //
    await fam.evaluate(() =>
      fetch('/api/menustyle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Chalk': '1' },
        body: JSON.stringify({ style: 'right' })
      })
    );
    await fam.reload();
    await fam.locator('#menuFab').click();
    const panel = fam.locator('#menuPanel');
    await expect(panel).toBeVisible();
    const w = (await panel.boundingBox())!.width;
    expect(w / sc.width).toBeLessThanOrEqual(0.27);
    await expect(panel.locator('#reloadBtn')).toBeVisible();
    if (process.env.SHOTS) await fam.screenshot({ path: `test-results/kiosk-${sc.name}.png` });
    await panel.locator('.closex').click();
    await fam.evaluate(() =>
      fetch('/api/menustyle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Chalk': '1' },
        body: JSON.stringify({ style: 'cork' })
      })
    );
  });
