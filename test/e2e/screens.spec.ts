// The other kinds of screen: the wall (view only), a family touch screen, and a new screen being paired.
import { test, expect, thisMonth } from './fixtures.ts';

test('the wall: no buttons, a tapped day shows its events, and it can’t change anything', async ({ as, board }) => {
  const { date } = thisMonth();
  await board.admin.post('/api/events', { title: 'Wall test event', date, allDay: true });
  const wall = await as('wall');
  await expect(wall.locator('body')).toHaveClass(/display/);
  await expect(wall.locator('#addBtn')).toBeHidden();
  await expect(wall.locator('#drawBtn')).toBeHidden();
  await wall.locator(`#grid [data-date="${date}"]`).click({ position: { x: 10, y: 60 } });
  await expect(wall.locator('#dmodal')).toHaveClass(/open/);
  await expect(wall.locator('#dList')).toContainText('Wall test event');
  await wall.locator('#dmodal').click({ position: { x: 5, y: 5 } });
  await expect(wall.locator('#dmodal')).not.toHaveClass(/open/);
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

test('a family screen edits on the board but has no settings, account or freehand drawing', async ({ as }) => {
  const fam = await as('family');
  await expect(fam.locator('body')).toHaveClass(/family/);
  await expect(fam.locator('#drawLabel')).toHaveText('Decorate');
  await expect(fam.locator('#settingsBtn')).toBeHidden();
  await expect(fam.locator('#acctBtn')).toBeHidden();
  await fam.locator('#drawBtn').click();
  await expect(fam.locator('#chalkBtn')).toBeHidden();
  await expect(fam.locator('#poscaBtn')).toBeHidden();
  await expect(fam.locator('#stampsBtn')).toBeVisible();
  await fam.locator('#drawBtn').click();
  // events: yes (on a day of its own; today fills up with the other tests' events)
  const date = thisMonth().ym + '-22';
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
  await expect(page.locator('#pairpad')).toHaveClass(/open/);
  await expect(page.locator('#pairCode')).toHaveText(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  const code = await page.locator('#pairCode').innerText();
  expect((await board.admin.post('/api/devices/approve', { code, name: 'Test wall', role: 'view' })).status).toBe(200);
  await expect(page.locator('#pairpad')).not.toHaveClass(/open/, { timeout: 10_000 });
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
