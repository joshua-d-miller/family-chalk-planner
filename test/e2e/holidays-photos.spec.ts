// Holidays (hide one, bring it back), ⚙️ Settings for editors, and the photos beside the month name.
import { test, expect } from './fixtures.ts';

// a month with a holiday on it (August has none)
async function monthWithHoliday(page) {
  for (let i = 0; i < 3 && !(await page.locator('#grid .ev.holiday').count()); i++) {
    await page.locator('#next').click();
    await page.waitForTimeout(700);
  }
  return page.locator('#grid .ev.holiday').first();
}

test('tap a holiday to hide it every year, then bring it back from Settings', async ({ as, board }) => {
  const page = await as('tablet');
  const hol = await monthWithHoliday(page);
  const name = (await hol.innerText()).replace(/^\S+\s/, '').trim(); // without its icon
  await hol.click();
  await expect(page.locator('#hmodal')).toHaveClass(/open/);
  await expect(page.locator('#modal')).not.toHaveClass(/open/); // not "Add event"
  const row = page.locator('.hrow.mark');
  await expect(row).toContainText(name);
  await row.click();
  await expect(row).toHaveClass(/off/);
  await page.locator('#hClose').click();
  await expect(page.locator('#grid .ev.holiday', { hasText: name })).toHaveCount(0);
  expect((await (await board.admin.api('/api/holidays')).json()).holidays.find(h => h.title === name).off).toBe(true);

  // back again from ⚙️ Settings (editors have it too)
  await page.locator('#settingsBtn').click();
  await expect(page.locator('#setHolN')).toHaveText('1 hidden');
  await page.locator('#setHol').click();
  await page.locator('.hrow', { hasText: name }).click();
  await page.locator('#hClose').click();
  await expect(page.locator('#setHolN')).toHaveText('All shown');
  await page.locator('#setClose').click();
  await expect(page.locator('#grid .ev.holiday', { hasText: name })).toHaveCount(1);
});

test('an editor sees Holidays in Settings but not the admin settings', async ({ as }) => {
  const page = await as('tablet');
  await page.locator('#settingsBtn').click();
  await expect(page.locator('#setHol')).toBeVisible();
  await expect(page.locator('#tDay')).toBeHidden(); // trash day: admins only
  await expect(page.locator('#nBottom')).toBeHidden(); // Notes column: admins only
});

test('photos beside the month name, and the Title photos switch', async ({ as }) => {
  const page = await as('tablet');
  await expect(page.locator('#ptitle .tp').first()).toBeVisible();
  const n = await page.locator('#ptitle .tp').count();
  expect(n).toBeGreaterThan(0);
  // frames sit above the calendar, not over it
  const ok = await page.evaluate(() => {
    const cal = document.getElementById('calbody').getBoundingClientRect();
    return [...document.querySelectorAll('#ptitle .tp')].every(f => {
      const r = f.getBoundingClientRect();
      return r.height > 20 && r.bottom <= cal.top + 6;
    });
  });
  expect(ok).toBe(true);
  await page.locator('#sideBtn').click();
  await expect(page.locator('#ptitle .tp')).toHaveCount(0);
  await expect(page.locator('#sideBtn')).not.toHaveClass(/on/);
  await page.locator('#sideBtn').click();
  await expect(page.locator('#ptitle .tp')).toHaveCount(n);
});

test('the month title fits above the calendar, even extra large', async ({ as, board }) => {
  const page = await as('tablet');
  const mid = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('#grid [data-date]')][15].dataset.date.slice(0, 7)
  );
  await board.admin.post('/api/meta', { ym: mid, title: { f: 3, c: '#F3A35E', o: '#FFFFFF', z: 90 } });
  await page.reload();
  await page.waitForTimeout(1500);
  const box = await page.evaluate(() => {
    const s = document.getElementById('slate').getBoundingClientRect(),
      t = document.querySelector('#monthName .mn').getBoundingClientRect(),
      k = s.width / 1252;
    return { top: (t.top - s.top) / k };
  });
  expect(box.top).toBeGreaterThan(-25); // the letters sit lower than their box; the box isn't pushed off the top
  await board.admin.post('/api/meta', { ym: mid, title: null });
});
