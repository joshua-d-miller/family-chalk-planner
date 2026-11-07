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

test('tap a holiday: the day list sends it to Settings to hide it every year, and back', async ({ as, board }) => {
  const page = await as('tablet');
  const hol = await monthWithHoliday(page);
  const name = (await hol.innerText()).replace(/^\S+\s/, '').trim(); // without its icon
  await hol.click();
  await expect(page.locator('#dayView')).toBeVisible();
  await expect(page.locator('#evSheet')).toHaveCount(0); // not "Add event"
  await page.locator('#dayView .daylist button.holiday').first().click();
  await expect(page).toHaveURL(/\/settings#holidays$/);
  const seg = page.locator('#holidays .seg', { hasText: name });
  await seg.click();
  await expect(seg).toHaveAttribute('aria-pressed', 'false');
  expect((await (await board.admin.api('/api/holidays')).json()).holidays.find(h => h.title === name).off).toBe(true);
  await seg.click();
  await expect(seg).toHaveAttribute('aria-pressed', 'true');
});

test('an editor sees Holidays in Settings but not the admin settings', async ({ as }) => {
  const page = await as('tablet', { path: '/settings' });
  await expect(page.locator('#holidays')).toBeVisible();
  await expect(page.getByLabel('Trash pickup')).toHaveCount(0); // trash day: admins only
});

test('photos beside the month name, and room to draw instead', async ({ as, board }) => {
  const page = await as('tablet');
  await expect(page.locator('#ptitle .tp').first()).toBeVisible();
  const n = await page.locator('#ptitle .tp').count();
  expect(n).toBeGreaterThan(0);
  // frames sit above the calendar, not over it
  const ok = await page.evaluate(() => {
    const cal = document.getElementById('calbody')!.getBoundingClientRect();
    return [...document.querySelectorAll('#ptitle .tp')].every(f => {
      const r = f.getBoundingClientRect();
      return r.height > 20 && r.bottom <= cal.top + 6;
    });
  });
  expect(ok).toBe(true);
  await page.locator('#photosBtn').click();
  await page.locator('#photosSheet').getByRole('radio', { name: 'Room to draw' }).click();
  await page.locator('#photosSheet').getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#ptitle .tp')).toHaveCount(0);
  await page.locator('#photosBtn').click();
  await page.locator('#photosSheet').getByRole('radio', { name: 'Random photos' }).click();
  await page.locator('#photosSheet').getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#ptitle .tp')).toHaveCount(n);
  void board;
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
