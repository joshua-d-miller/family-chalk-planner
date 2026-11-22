/*
===============================================================================
 Family Chalk Planner | Tests | Browser | screens.spec.ts
===============================================================================
 Version:   1.2.3
 Author:    Joshua D. Miller, Colby Way, Claude
 Updated:   2026-11-22

 Purpose:
     The other kinds of screen: the wall (view only), a family touch
     screen, and a new screen being paired.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    Browser tests for the board as each screen
                        claude    sees it (Playwright).
                        colby
                                  Browser tests: no overnight slideshow over
                                  the tests; a test for it with a night-time
                                  clock.

                                  Server and tests are all TypeScript (ES
                                  modules).

                                  The new screens take over: /, /edit and
                                  /chores are the React board; the old one
                                  stays at /classic.

 1.1.1    2026-11-18   joshua    A family screen with someone signed in still
                        claude    edits; the wall has no dead month arrows.

 1.2.0    2026-11-21   joshua    A family screen sets month titles too
                        claude    (everything but freehand drawing).

 1.2.3    2026-11-22   joshua    The family screen's event goes on the 21st
                        claude    when today is the 22nd (today fills up).
===============================================================================
*/

import { test, expect, thisMonth } from './fixtures.ts';

test('the wall: no buttons, a tapped day shows its events, and it can’t change anything', async ({ as, board }) => {
  const { date } = thisMonth();
  await board.admin.post('/api/events', { title: 'Wall test event', date, allDay: true });
  const wall = await as('wall');
  await expect(wall.locator('body')).toHaveClass(/display/);
  await expect(wall.locator('#addBtn')).toBeHidden();
  await expect(wall.locator('#drawBtn')).toBeHidden();
  await wall.locator(`#grid [data-date="${date}"]`).click({ position: { x: 10, y: 60 } });
  await expect(wall.locator('#dayView')).toContainText('Wall test event');
  await wall.mouse.click(5, 5);
  await expect(wall.locator('#dayView')).toHaveCount(0);
  const status = await wall.evaluate(
    d =>
      fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Chalk': '1' },
        body: JSON.stringify({ title: 'nope', date: d, allDay: true })
      }).then(r => r.status),
    date
  );
  expect([401, 403]).toContain(status);
  expect(wall.errors).toEqual([]);
});

test('the wall: the overnight slideshow comes on at night', async ({ as, board }) => {
  await board.admin.post('/api/photos/settings', { night: true, from: '21:00', to: '06:00' });
  try {
    const now = new Date(),
      ny = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const at = new Date(now.getTime() + ((23 - ny.getHours()) * 60 - ny.getMinutes()) * 60e3); // 11 PM in New York, today
    const wall = await as('wall', { time: at });
    await expect(wall.locator('#sTime')).toBeVisible({ timeout: 15_000 });
    await expect(wall.locator('#sTime')).toContainText('11:');
  } finally {
    await board.admin.post('/api/photos/settings', { night: false });
  }
});

test('the wall: the slideshow shows the clock and photos', async ({ as }) => {
  const wall = await as('wall', { path: '/?slides' });
  await expect(wall.locator('#sTime')).toBeVisible({ timeout: 10_000 });
  await expect(wall.locator('#sTime')).toHaveText(/\d{1,2}:\d{2}/);
});

test('a family screen does everything on the board but freehand drawing (month titles too)', async ({ as }) => {
  const fam = await as('family');
  await expect(fam.locator('body')).toHaveClass(/family/);
  await expect(fam.locator('#drawBtn')).toContainText('Decorate');
  await fam.locator('#editBtn').click(); // the tools are in the drawer on the cork
  await expect(fam.locator('#titleBtn')).toBeVisible();
  await fam.locator('#drawBtn').click();
  await expect(fam.locator('#chalkBtn')).toBeHidden();
  await expect(fam.locator('#poscaBtn')).toBeHidden();
  await expect(fam.locator('#stampsBtn')).toBeVisible();
  await fam.locator('#drawBtn').click();
  // events: yes (on a day of its own; today fills up with the other tests' events)
  const { ym, date: today } = thisMonth();
  const date = ym + (today.endsWith('-22') ? '-21' : '-22'); // (not today, even on the 22nd)
  await fam.locator('#addBtn').click();
  await fam.locator('#evTitle').fill('Family screen event');
  await fam.locator('#evDate').fill(date);
  await fam.locator('#evAllDay').check();
  await fam.locator('#evSave').click();
  await expect(fam.locator(`#grid [data-date="${date}"]`)).toContainText('Family screen event');
});

test('a new screen shows a pairing code; once approved it becomes the wall', async ({ browser, board }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await page.goto(board.url + '/');
  await expect(page.locator('#pairpad')).toBeVisible();
  await expect(page.locator('#pairCode')).toHaveText(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  const code = await page.locator('#pairCode').innerText();
  expect((await board.admin.post('/api/devices/approve', { code, name: 'Test wall', role: 'view' })).status).toBe(200);
  await expect(page.locator('#pairpad')).toHaveCount(0, { timeout: 10_000 });
  await expect(page.locator('body')).toHaveClass(/display/);
  await ctx.close();
});

test('the admin console asks for password and authenticator code', async ({ browser, board }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(board.url + '/admin');
  await expect(page.locator('#liUser')).toBeVisible();
  await expect(page.locator('#liCode')).toBeVisible();
  await ctx.close();
});

test('a family screen with someone also signed in still opens the board to edit (Colby’s kitchen screen)', async ({
  as,
  board
}) => {
  const fam = await as('family', { path: '/' });
  // the family screen's pairing plus a person's sign-in, on the same browser
  await fam.context().addCookies(
    board.editorCookie.split('; ').map(c => {
      const [name, ...v] = c.split('=');
      return { name, value: v.join('='), url: board.url };
    })
  );
  await fam.goto(board.url + '/');
  await expect(fam).toHaveURL(/\/edit$/);
  await expect(fam.locator('#addBtn')).toBeVisible();
  await expect(fam.getByRole('button', { name: 'Next month' })).toBeVisible();
});

test('the wall: no month arrows that do nothing', async ({ as }) => {
  const wall = await as('wall');
  await expect(wall.locator('#monthName')).toBeVisible();
  await expect(wall.getByRole('button', { name: 'Next month' })).toHaveCount(0);
  await expect(wall.getByRole('button', { name: 'Previous month' })).toHaveCount(0);
});
