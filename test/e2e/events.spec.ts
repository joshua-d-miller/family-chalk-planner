// Events on the tablet: add one, see it on its day, tap the day for the list, change it, delete it.
import { test, expect, thisMonth } from './fixtures.ts';

const day = (page, date) => page.locator(`#grid [data-date="${date}"]`);

test('add, open from the day list, change and delete an event', async ({ as }) => {
  const page = await as('tablet');
  const { date } = thisMonth();
  // an empty day goes straight to Add; this one may have events, so use the button
  await page.locator('#addBtn').click();
  await expect(page.locator('#modal')).toHaveClass(/open/);
  await page.locator('#evTitle').fill('Dentist for Nora');
  await page.locator('#evDate').fill(date);
  await page.locator('#evTime').fill('15:30');
  await page.locator('#evSave').click();
  await expect(page.locator('#modal')).not.toHaveClass(/open/);
  await expect(day(page, date)).toContainText('Dentist for Nora');

  // tap the day: its events, with Add at the bottom; tap the event to change it
  // (the bottom corner of the day, clear of its events)
  const box = await day(page, date).boundingBox();
  await day(page, date).click({ position: { x: 6, y: box!.height - 5 } });
  await expect(page.locator('#dmodal')).toHaveClass(/open/);
  await page.locator('#dList button', { hasText: 'Dentist for Nora' }).click();
  await expect(page.locator('#modal')).toHaveClass(/open/);
  await expect(page.locator('#mTitle')).toHaveText('Change this event');
  await page.locator('#evTitle').fill('Dentist for Nora and Theo');
  await page.locator('#evSave').click();
  await expect(day(page, date)).toContainText('Dentist for Nora and Theo');

  // delete
  await day(page, date).locator('.ev', { hasText: 'Dentist for Nora and Theo' }).click();
  await page.locator('#evDelete').click();
  await expect(day(page, date)).not.toContainText('Dentist for Nora');
  expect(page.errors).toEqual([]);
});

test('an all-day event, larger on the board', async ({ as }) => {
  const page = await as('tablet');
  const { date } = thisMonth();
  await page.locator('#addBtn').click();
  await page.locator('#evTitle').fill('Grandma visits');
  await page.locator('#evDate').fill(date);
  await page.locator('#evAllDay').check();
  await page
    .locator('#evSize button, #evSize .seg')
    .filter({ hasText: /^Large$/ })
    .click();
  await page.locator('#evSave').click();
  const ev = day(page, date).locator('.ev', { hasText: 'Grandma visits' });
  await expect(ev).toHaveClass(/allday/);
  await expect(ev).toHaveClass(/sz-l/);
});

test('a new event shows up on the wall without reloading', async ({ as, board }) => {
  const wall = await as('wall');
  const { date } = thisMonth();
  await board.admin.post('/api/events', { title: 'Pizza night', date, allDay: true });
  await expect(wall.locator(`#grid [data-date="${date}"]`)).toContainText('Pizza night', { timeout: 10_000 });
});
