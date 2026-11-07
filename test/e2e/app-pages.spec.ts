// The new screens (React): the meal plan, reminders, timers, the pantry, reward jars and chores, on a phone,
// a family screen and the wall; the ☰ menu and favorites.
import { test, expect } from './fixtures.ts';

const noSideScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

test('meal plan: plan a meal on a day, tick it off; the wall only shows it', async ({ as, board }) => {
  const phone = await as('phone', { path: '/meals' });
  await expect(phone.locator('h2')).toHaveText('Meal plan');
  await phone.getByRole('button', { name: '+ Meal' }).click();
  await phone.getByLabel('What’s for dinner').fill('Tacos');
  await phone.getByLabel('Day').selectOption('fri');
  await phone.getByRole('button', { name: 'Save' }).click();
  const friday = phone.locator('section', { has: phone.locator('h3', { hasText: 'Friday' }) });
  await expect(friday.getByRole('button', { name: 'Tacos', exact: true })).toBeVisible();
  await friday.getByRole('button', { name: 'Tacos', exact: true }).click();
  await expect(friday.getByRole('button', { name: 'Tacos', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const meals = await (await board.admin.api('/api/meals')).json();
  expect(meals.items.find(m => m.t === 'Tacos')).toMatchObject({ day: 'fri', done: true });
  expect(await noSideScroll(phone)).toBe(true);
  // the wall sees it, live, but can't change it
  const wall = await as('wall', { path: '/meals' });
  await expect(wall.getByRole('button', { name: 'Tacos', exact: true })).toBeDisabled();
  await expect(wall.getByRole('button', { name: '+ Meal' })).toHaveCount(0);
  await board.admin.post('/api/meals/item', { meal: { t: 'Soup', day: 'mon' } });
  await expect(wall.getByText('Soup')).toBeVisible();
  expect(phone.errors.concat(wall.errors)).toEqual([]);
});

test('reminders: one until it’s done, and one at a time every day', async ({ as }) => {
  const fam = await as('family', { path: '/reminders' });
  await fam.getByRole('button', { name: '+ Reminder' }).click();
  await fam.getByLabel('Remind us to…').fill('Library books');
  await fam.getByRole('button', { name: 'Save' }).click();
  await fam.getByRole('button', { name: '+ Reminder' }).click();
  await fam.getByLabel('Remind us to…').fill('Vitamins');
  await fam.getByRole('radio', { name: 'At a time' }).click();
  await fam.getByLabel('Time', { exact: true }).fill('07:30');
  await fam.getByRole('button', { name: 'Save' }).click();
  await expect(fam.getByText('7:30am · every day')).toBeVisible();
  await fam.locator('.check', { hasText: 'Library books' }).click();
  await expect(fam.locator('.check', { hasText: 'Library books' })).toHaveAttribute('aria-pressed', 'true');
  expect(fam.errors).toEqual([]);
});

test('timers: shared by every screen; one that ends is marked done', async ({ as, board }) => {
  const phone = await as('phone', { path: '/timers' });
  await phone.getByRole('button', { name: '+ Timer' }).click();
  await phone.getByLabel('What for').fill('Pasta');
  await phone.getByRole('button', { name: '10 min' }).click();
  await phone.getByRole('button', { name: 'Start' }).click();
  await expect(phone.locator('.timer', { hasText: 'Pasta' }).locator('.tleft')).toHaveText(/^(10:00|9:5\d)$/);
  const wall = await as('wall', { path: '/timers' });
  await expect(wall.locator('.timer', { hasText: 'Pasta' })).toBeVisible();
  await phone.getByRole('button', { name: 'Pause' }).click();
  await expect(phone.locator('.timer.paused')).toBeVisible();
  // a short one, started elsewhere: every open screen counts it down, and it ends
  await board.admin.post('/api/timers/item', {
    timer: { name: 'Eggs', duration: 60000, state: 'running', endsAt: Date.now() + 1500 }
  });
  await expect(wall.locator('.timer', { hasText: 'Eggs' }).locator('.tleft')).toHaveText('Done!', { timeout: 8000 });
  await expect
    .poll(async () => (await (await board.admin.api('/api/timers')).json()).items.find(t => t.name === 'Eggs').state)
    .toBe('done');
  expect(phone.errors.concat(wall.errors)).toEqual([]);
});

test('pantry: add, find, use up', async ({ as }) => {
  const fam = await as('family', { path: '/pantry' });
  for (const [name, loc] of [
    ['Rice', 'pantry'],
    ['Milk', 'fridge']
  ]) {
    await fam.getByRole('button', { name: '+ Add' }).click();
    await fam.getByLabel('What').fill(name);
    await fam.getByLabel('Where').selectOption(loc);
    await fam.getByRole('button', { name: 'Save' }).click();
  }
  await expect(fam.locator('section', { hasText: 'Fridge' }).getByText('Milk')).toBeVisible();
  await fam.getByLabel('Find').fill('ric');
  await expect(fam.getByText('Milk')).toHaveCount(0);
  await fam.getByRole('button', { name: /Rice/ }).click();
  await fam.getByRole('button', { name: 'Used it up' }).click();
  await expect(fam.getByText('Rice')).toHaveCount(0);
});

test('reward jars: pieces go in from a family screen', async ({ as, board }) => {
  await board.admin.post('/api/jars', {
    jars: [{ id: 'nora', name: 'Nora', pieces: ['heart', 'star'], count: 0, goal: 5 }]
  });
  const fam = await as('family', { path: '/jars' });
  await fam.getByRole('button', { name: 'Add a heart' }).click();
  await fam.getByRole('button', { name: 'Add a star' }).click();
  await expect(fam.locator('.jar h3')).toContainText('2 of 5');
  expect((await (await board.admin.api('/api/jars')).json())[0].items).toEqual(['heart', 'star']);
});

test('chores (new screen): a phone ticks one off; a kid’s tablet sees only theirs', async ({ as, board }) => {
  await board.admin.post('/api/chores/save', { example: true });
  const phone = await as('phone', { path: '/next/chores' });
  await expect(phone.locator('#chores h2')).toHaveText('Chores');
  await phone.locator('.chitem', { hasText: 'Quick living room pickup' }).click();
  await expect(phone.locator('.chitem', { hasText: 'Quick living room pickup' })).toHaveClass(/done/);
  expect(await noSideScroll(phone)).toBe(true);
  const kid = await as('kid:kid1', { path: '/next/chores' });
  await expect(kid.locator('#chores h2')).toHaveText('Kid 1’s chores');
  await expect(kid.locator('#chCols .chcol h3').first()).toContainText('Just me');
  await expect(kid.locator('.chitem', { hasText: 'Wipe kitchen counters' })).toHaveCount(0);
});

test('changing the chores (new screen): add one for the kids, each their own', async ({ as, board }) => {
  await board.admin.post('/api/chores/save', { example: true });
  const page = await as('tablet', { path: '/next/chores' });
  await page.locator('#chEdit').click();
  await expect(page.locator('#chedmodal')).toBeVisible();
  await page.getByRole('radio', { name: 'Every week' }).click();
  await page.locator('#chedAddC').click();
  await page.keyboard.type('Water the plants');
  const row = page.locator('#chedList .chedc').last();
  await row.locator('.who .seg', { hasText: 'Kid 1' }).click();
  await row.locator('.who .seg', { hasText: 'Kid 2' }).click();
  await row.locator('.who .seg', { hasText: 'Each does their own' }).click();
  await page.locator('#chedSave').click();
  await expect(page.locator('#chedmodal')).toHaveCount(0);
  const c = (await (await board.admin.api('/api/chores')).json()).chores.find(x => x.title === 'Water the plants');
  expect(c).toMatchObject({ every: 'week', who: ['kid1', 'kid2'], each: true });
});

test('the ☰ menu: every page; ☆ keeps one on the strip; signed out, a phone is asked to sign in', async ({ as }) => {
  const phone = await as('phone', { path: '/timers' });
  await phone.locator('#menuBtn').click();
  const menu = phone.locator('#menuPanel');
  await expect(menu.getByRole('link', { name: 'Timers' })).toHaveAttribute('aria-current', 'page');
  await menu.getByRole('button', { name: 'Keep Meal plan on the strip' }).click();
  await expect(menu.getByRole('button', { name: 'Take Meal plan off the strip' })).toBeVisible();
  await menu.getByRole('link', { name: 'Pantry' }).click();
  await expect(phone).toHaveURL(/\/pantry$/);
  const fav = await phone.evaluate(async () => (await fetch('api/favorites')).json());
  expect(fav.items).toEqual(['meals']);
  const out = await as('phone-signed-out', { path: '/meals' });
  await expect(out.locator('#signpad')).toBeVisible();
  await expect(out.getByRole('button', { name: 'Sign in' })).toBeVisible();
});
