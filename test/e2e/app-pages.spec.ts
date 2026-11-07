// The new screens (React): the meal plan, reminders, timers, the pantry, reward jars and chores, on a phone,
// a family screen and the wall; the ☰ menu and favorites.
import { test, expect, thisMonth } from './fixtures.ts';

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
  // and back, for the other tests
  await phone.locator('.chitem', { hasText: 'Quick living room pickup' }).click();
  await expect(phone.locator('.chitem', { hasText: 'Quick living room pickup' })).not.toHaveClass(/done/);
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

test('settings (new screen): hide a holiday and bring it back; the slideshow; the right-hand column', async ({
  as,
  board
}) => {
  const page = await as('tablet', { path: '/next/settings' });
  await expect(page.locator('h2')).toHaveText('Settings');
  const hol = page.locator('.hols .seg', { hasText: 'Thanksgiving' });
  await hol.click();
  await expect(hol).toHaveAttribute('aria-pressed', 'false');
  await expect
    .poll(
      async () =>
        (await (await board.admin.api('/api/holidays')).json()).holidays.find(h => h.title === 'Thanksgiving').off
    )
    .toBe(true);
  await hol.click();
  await expect(hol).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Show photos overnight on the wall (a slideshow)').check();
  await page.getByLabel('With the temperature').check();
  await expect.poll(async () => (await (await board.admin.api('/api/photos')).json()).cfg.showTemp).toBe(true);
  await page.getByRole('button', { name: /Reward jars/ }).click();
  await page.getByRole('button', { name: /Reminders/ }).click();
  await expect
    .poll(async () => (await (await board.admin.api('/api/extras')).json()).notes.pages)
    .toEqual(['info', 'meals', 'reminders']);
  // put things back for the other tests (the night slideshow would cover the screens)
  await page.getByLabel('Show photos overnight on the wall (a slideshow)').uncheck();
  await expect.poll(async () => (await (await board.admin.api('/api/photos')).json()).cfg.night).toBe(false);
  await page.getByRole('button', { name: /Reminders/ }).click();
  await page.getByRole('button', { name: /Reward jars/ }).click();
  await expect
    .poll(async () => (await (await board.admin.api('/api/extras')).json()).notes.pages)
    .toEqual(['info', 'meals', 'jars']);
  expect(page.errors).toEqual([]);
});

test('settings for an admin: the calendar and trash day', async ({ as, board }) => {
  const page = await as('admin', { path: '/next/settings' });
  await expect(page.locator('section', { hasText: 'Calendar' })).toContainText('Showing “Family”');
  await page.getByLabel('Trash pickup').selectOption('4');
  await expect.poll(async () => (await (await board.admin.api('/api/extras')).json()).bins.day).toBe(4);
  await page.getByLabel('Trash pickup').selectOption('2');
});

test('the board (new screen, wall): the month, its events and art, sharp on a 4K wall', async ({ as, board }) => {
  const { ym, date } = thisMonth();
  const added = (title: string) =>
    board.admin
      .post('/api/events', { title, date, allDay: true })
      .then(r => r.json())
      .then(j => j.href as string);
  const hrefs = [await added('Piano recital')];
  const { id: artId } = await (
    await board.admin.post('/api/art', { ym, stroke: { c: '#F6B3CB', w: 6, p: [300, 300, 340, 260, 380, 300] } })
  ).json();
  for (const size of [
    { viewport: { width: 1920, height: 1080 } },
    { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 }
  ]) {
    const wall = await as('wall', { path: '/next/board', context: size });
    await expect(wall.locator(`#grid [data-date="${date}"]`)).toContainText('Piano recital');
    await expect(wall.locator('.artSvg .lines g')).toHaveCount(1);
    const box = await wall.locator('#board').boundingBox();
    expect(Math.round(box!.width)).toBe(1920); // fills the screen (as wide as it can go)
    // the surface is painted for the screen: 2 board pixels per screen pixel... times the pixel ratio
    const w = await wall.evaluate(async () => {
      const m = /url\("?(.*?)"?\)$/.exec(getComputedStyle(document.getElementById('stage')!).backgroundImage);
      const img = new Image();
      img.src = m![1];
      await img.decode();
      return img.naturalWidth;
    });
    expect(w).toBeGreaterThanOrEqual(1252 * 1.5 * (size.deviceScaleFactor || 1));
    expect(wall.errors).toEqual([]);
  }
  // live: a change shows up without reloading
  const wall = await as('wall', { path: '/next/board' });
  hrefs.push(await added('Book fair'));
  await expect(wall.locator(`#grid [data-date="${date}"]`)).toContainText('Book fair');
  // tidy up: today stays free for the other tests
  for (const href of hrefs) await board.admin.post('/api/events/delete', { ref: { href }, origDate: date });
  await board.admin.post('/api/art/delete', { ym, ids: [artId] });
  await expect(wall.locator(`#grid [data-date="${date}"]`)).not.toContainText('Book fair');
});

test('the board (new screen): the style, the month’s title and border, the jars, all live', async ({ as, board }) => {
  const { ym } = thisMonth();
  const wall = await as('wall', { path: '/next/board' });
  await expect(wall.locator('#monthName .mn')).toBeVisible();
  // the family picks a style: today's mark and the lines change on the wall without reloading
  await board.admin.post('/api/theme', { p: 'pastel', o: {} });
  await expect(wall.locator('.ringAt .ring path')).toHaveAttribute('d', /^M23 38.5/); // the heart
  // the month's own title and a holiday border
  await board.admin.post('/api/meta', { ym, title: { f: 3, c: '#9CC9E6', o: null, z: 80 } });
  await expect
    .poll(() => wall.locator('#monthName .mn').evaluate(e => getComputedStyle(e).fontFamily))
    .toContain('Pacifico');
  await expect(wall.locator('#monthName')).toHaveClass(/noout/);
  await board.admin.post('/api/border', { ym, border: { items: ['gi-pumpkin'], color: '#E8A35C', size: 'm' } });
  await expect.poll(() => wall.locator('.borderLayer img').count()).toBeGreaterThan(20);
  // a jar, drawn
  const jars = await (await board.admin.api('/api/jars')).json();
  await board.admin.post('/api/jars', {
    jars: [{ id: 'j1', name: 'Stars', pieces: ['star'], items: ['star', 'star', 'star'], count: 3, goal: 10 }]
  });
  await expect(wall.locator('.jars .jar svg.jarart .pc')).toHaveCount(3);
  expect(wall.errors).toEqual([]);
  // put things back
  await board.admin.post('/api/jars', { jars });
  await board.admin.post('/api/border', { ym, border: null });
  await board.admin.post('/api/meta', { ym, title: null });
  await board.admin.post('/api/theme', { p: 'classic', o: {} });
  await expect(wall.locator('.borderLayer')).toHaveCount(0);
});

test('the board (new screen, wall): a tap shows the day, the photo frame, the slideshow, reminders and timers', async ({
  as,
  board
}) => {
  const { date } = thisMonth();
  // no reminders left from other tests popping up over the board
  for (const r of (await (await board.admin.api('/api/reminders')).json()).items)
    await board.admin.post('/api/reminders/item/delete', { id: r.id });
  const wall = await as('wall', { path: '/next/board' });
  // tap a day: everything on it, big; any tap closes it
  const href = (await (await board.admin.post('/api/events', { title: 'Dentist', date, allDay: true })).json())
    .href as string;
  await expect(wall.locator(`#grid [data-date="${date}"]`)).toContainText('Dentist');
  const cell = await wall.locator(`#grid [data-date="${date}"]`).boundingBox();
  await wall.mouse.click(cell!.x + cell!.width / 2, cell!.y + cell!.height - 6);
  await expect(wall.locator('#dayView')).toContainText('Dentist');
  await wall.mouse.click(10, 10);
  await expect(wall.locator('#dayView')).toHaveCount(0);
  await board.admin.post('/api/events/delete', { ref: { href }, origDate: date });
  // a double tap: the photo frame; a tap on it goes back to the calendar
  await wall.waitForTimeout(1000);
  await wall.mouse.dblclick(cell!.x + 20, cell!.y + 40);
  await expect(wall.locator('#slides')).toHaveClass(/on/);
  await expect(wall.locator('#slides .sl.on .tile img.fg').first()).toBeVisible();
  await expect(wall.locator('#slides .clock b')).toHaveText(/^\d{1,2}:\d\d/);
  await wall.waitForTimeout(1600);
  await wall.mouse.click(400, 400);
  await expect(wall.locator('#slides')).not.toHaveClass(/on/);
  // a reminder whose time has come pops up; a timer that's done shows a banner
  const rem = await (
    await board.admin.post('/api/reminders/item', {
      reminder: { title: 'Take out the recycling', mode: 'time', time: '00:00', repeat: 'once' }
    })
  ).json();
  await expect(wall.locator('#remAlert')).toContainText('Take out the recycling', { timeout: 15000 });
  await wall.locator('#remAlert').getByRole('button', { name: 'OK' }).click();
  await expect(wall.locator('#remAlert')).toHaveCount(0);
  const tm = await (
    await board.admin.post('/api/timers/item', {
      timer: { name: 'Cookies', duration: 60000, state: 'done', doneAt: Date.now() }
    })
  ).json();
  await expect(wall.locator('.timerdone')).toContainText('Cookies is done!');
  await wall.locator('.timerdone button', { hasText: 'Cookies' }).click({ force: true }); // it pulses, so it's never "stable"
  await expect(wall.locator('.timerdone button', { hasText: 'Cookies' })).toHaveCount(0);
  expect(wall.errors).toEqual([]);
  for (const r of rem.items) await board.admin.post('/api/reminders/item/delete', { id: r.id });
  for (const t of tm.items) await board.admin.post('/api/timers/item/delete', { id: t.id });
});

test('the board (new screen, wall): the slideshow with today’s extras, in the side panel', async ({ as, board }) => {
  await board.admin.post('/api/photos/settings', { showTemp: true, showEvents: true, sidePanel: true });
  const wall = await as('wall', { path: '/next/board?slides' });
  await expect(wall.locator('#slides')).toHaveClass(/sidepanel-on/);
  await expect(wall.locator('#slides .slide-sidebar .sinfo')).toContainText('Today’s weather');
  await expect(wall.locator('#slides .slide-sidebar .sinfo')).toContainText('Today’s events');
  await expect(wall.locator('#slides .sl.on .tile').first()).toBeVisible();
  expect(wall.errors).toEqual([]);
  await board.admin.post('/api/photos/settings', { showTemp: false, showEvents: false, sidePanel: false });
});

test('the board (new screen, tablet): add an event, change it, delete it', async ({ as, board }) => {
  const { date, ym } = thisMonth();
  const t = await as('tablet', { path: '/next/edit' });
  await t.locator('#addBtn').click();
  await t.locator('#evTitle').fill('Field trip');
  await t.locator('#evDate').fill(date);
  await t.locator('#evAllDay').check();
  await t.locator('#evSize').getByRole('radio', { name: 'Large', exact: true }).click();
  await t.locator('#evSheet').getByRole('radio', { name: '#F6B3CB' }).click();
  await t.locator('#evSave').click();
  const ev = t.locator(`#grid [data-date="${date}"] .ev`, { hasText: 'Field trip' });
  await expect(ev).toHaveClass(/sz-l/);
  await expect(ev).toHaveClass(/allday/);
  // change it: tap it on the board
  await ev.click();
  await expect(t.locator('#evTitle')).toHaveValue('Field trip');
  await t.locator('#evTitle').fill('Field trip (zoo)');
  await t.locator('#evSave').click();
  await expect(t.locator(`#grid [data-date="${date}"]`)).toContainText('Field trip (zoo)');
  // the day list: everything on the day; the event opens from it
  const cell = await t.locator(`#grid [data-date="${date}"]`).boundingBox();
  await t.mouse.click(cell!.x + 20, cell!.y + cell!.height - 6);
  await t
    .locator('#dayView')
    .getByRole('button', { name: /Field trip \(zoo\)/ })
    .click();
  await t.locator('#evDelete').click();
  await expect(t.locator(`#grid [data-date="${date}"]`)).not.toContainText('Field trip');
  // the months go back and forth
  await t.locator('#next').click();
  await expect(t.locator('#monthName .mn')).not.toHaveText(thisMonth().name);
  await t.locator('#prev').click();
  await expect(t.locator('#monthName .mn')).toHaveText(thisMonth().name);
  expect(t.errors).toEqual([]);
  void board;
  void ym;
});

test('the board (new screen, tablet): the month’s title, its border and the board style', async ({ as, board }) => {
  const { ym } = thisMonth();
  const t = await as('tablet', { path: '/next/edit' });
  await t.locator('#titleBtn').click();
  await t.locator('#titleSheet .fontpick .seg').nth(3).click(); // Pacifico, shown on the board at once
  await expect
    .poll(() => t.locator('#monthName .mn').evaluate(e => getComputedStyle(e).fontFamily))
    .toContain('Pacifico');
  await t.locator('#titleSheet').getByRole('button', { name: 'Save' }).click();
  await expect.poll(async () => (await (await board.admin.api(`/api/meta?ym=${ym}`)).json()).title?.f).toBe(3);
  await t.locator('#borderBtn').click();
  await t
    .locator('#borderSheet')
    .getByRole('button', { name: /Thanksgiving/ })
    .click();
  await expect.poll(() => t.locator('.borderLayer img').count()).toBeGreaterThan(20);
  await t.locator('#borderSheet').getByRole('button', { name: 'Save' }).click();
  await expect
    .poll(async () => (await (await board.admin.api(`/api/meta?ym=${ym}`)).json()).border?.items.length)
    .toBeGreaterThan(0);
  await t.locator('#styleBtn').click();
  await t
    .locator('#styleSheet')
    .getByRole('button', { name: /Pastel/ })
    .click();
  await t.locator('#styleSheet').getByRole('button', { name: 'Save' }).click();
  await expect.poll(async () => (await (await board.admin.api('/api/theme')).json()).p).toBe('pastel');
  expect(t.errors).toEqual([]);
  await board.admin.post('/api/theme', { p: 'classic', o: {} });
  await board.admin.post('/api/border', { ym, border: null, yearly: true });
  await board.admin.post('/api/border', { ym, border: null });
  await board.admin.post('/api/meta', { ym, title: null });
});
