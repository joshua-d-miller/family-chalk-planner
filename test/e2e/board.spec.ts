/*
===============================================================================
 Family Chalk Planner | Tests | Browser | board.spec.ts
===============================================================================
 Version:   1.3.0
 Author:    Joshua D. Miller, Claude
 Updated:   2026-11-26

 Purpose:
     The board itself: this month on the tablet, moving between months,
     the strip of buttons.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-06   joshua    Browser tests for the board as each screen
                        claude    sees it (Playwright).

                                  Server and tests are all TypeScript (ES
                                  modules).

 0.14.0    2026-11-07   joshua    A family screen's cork fits, drawer open or
                        claude    closed.

 0.15.0    2026-11-08   joshua    Week view; the switch at the bottom of Notes.
                        claude

                                  Decorating a week; the bottom of Notes on
                                  this screen.

 0.15.1    2026-11-10   joshua    Art over events: the question, and leftover
                        claude    days.

 0.16.0    2026-11-11   joshua    The cork stays put between the calendar and a
                        claude    page.

 1.1.1    2026-11-18   joshua    A swipe down never reloads a wall screen.
                        claude

 1.2.0    2026-11-21   joshua    🗓️ Week from today, and every week after it
                        claude    has all its events (across two months too).
                                  Hiding the − / + / Fit buttons; a tap on the
                                  month's name reloads (not on the wall); a ✕
                                  on every page. Split View; ⚙️ Week.

 1.2.4    2026-11-22   joshua    Split View shows the week's own Notes
                        claude    pages, less what's under the week.

 1.2.6    2026-11-22   joshua    The art on a layer of its own, and never a
                        claude    stretched copy.

 1.2.7    2026-11-23   joshua    An answer that's cut short doesn't crash
                        claude    the screen.

 1.3.0    2026-11-26   joshua    The month arrows fading on a family screen;
                        claude    the month picker; what a screen does
                                  overnight.
===============================================================================
*/

import { test, expect, thisMonth, longPress } from './fixtures.ts';

test('the tablet opens on this month, with weather, countdowns and no errors', async ({ as }) => {
  const page = await as('tablet');
  await expect(page.locator('#monthName')).toContainText(thisMonth().name);
  await expect(page.locator(`[data-date="${thisMonth().date}"]`)).toBeVisible();
  await expect(page.locator('#wNow')).toContainText('58°');
  expect(page.errors).toEqual([]);
});

test('an answer from the board that’s cut short (the photos, here) doesn’t crash the screen', async ({ as }) => {
  const page = await as('family');
  const crashed: string[] = [];
  page.on('request', r => r.url().includes('api/screen-error') && crashed.push(r.postData() || ''));
  // a 200 that isn't the board's answer: cut off while the board restarted, or a page from something in between
  await page.route('**/api/photos', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabl' }));
  await page.reload();
  await expect(page.locator('#monthName')).toContainText(thisMonth().name);
  await page.locator('#editBtn').click();
  await page.waitForTimeout(500);
  await expect(page.locator('#monthName')).toBeVisible();
  expect(crashed).toEqual([]);
  expect(page.errors).toEqual([]);
});

test('a wall screen: a swipe down never reloads it (no pull-to-refresh)', async ({ as }) => {
  const wall = await as('wall');
  for (const el of ['html', 'body'])
    expect(await wall.locator(el).evaluate(e => getComputedStyle(e).overscrollBehaviorY)).toBe('none');
});

test('next and previous month', async ({ as }) => {
  const page = await as('tablet');
  const start = await page.locator('#monthName').innerText();
  await page.locator('#next').click();
  await expect(page.locator('#monthName')).not.toHaveText(start);
  await page.locator('#prev').click();
  await expect(page.locator('#monthName')).toHaveText(start);
});

test('every button in the strip fits on an iPad', async ({ as }) => {
  const page = await as('tablet');
  const off = await page.evaluate(() => {
    const strip = document.querySelector('.cork').getBoundingClientRect();
    return [...document.querySelectorAll('.cork > *')]
      .filter(e => (e as HTMLElement).offsetWidth)
      .filter(e => {
        const r = e.getBoundingClientRect();
        return r.left < strip.left - 1 || r.right > strip.right + 1;
      })
      .map(e => e.id || e.className);
  });
  expect(off).toEqual([]);
});

test('a family screen: the pages and the calendar tools both fit on the cork', async ({ as }) => {
  const page = await as('family', { context: { viewport: { width: 1024, height: 600 } } });
  const off = (sel: string) =>
    page.evaluate(sel => {
      const cork = document.querySelector('.cork')!.getBoundingClientRect();
      return [...document.querySelectorAll(sel)]
        .filter(e => (e as HTMLElement).offsetWidth)
        .filter(e => {
          const r = e.getBoundingClientRect();
          return r.left < cork.left - 1 || r.right > cork.right + 1;
        })
        .map(e => e.id || e.className);
    }, sel);
  expect(await off('.cork .corknav > *, .cork > #addBtn')).toEqual([]);
  await page.locator('#editBtn').click();
  await page.waitForTimeout(400);
  expect(await off('.cork .drawer > *')).toEqual([]);
});

test('🗓️ Week: its own page in the menu, pinnable; the wall shows it at /week', async ({ as }) => {
  const { day } = thisMonth();
  const page = await as('family', { context: { viewport: { width: 1280, height: 800 } } });
  await page.locator('#menuBtn').click();
  await longPress(page, '#tile-week'); // press and hold: pinned
  await expect(page.locator('#tile-week .pinned')).toBeVisible();
  await page.locator('#tile-calendar').click(); // closes the menu
  const cork = page.locator('.cork .corknav');
  await cork.locator('a.pill', { hasText: 'Week' }).click();
  await expect(page).toHaveURL(/\/week$/);
  await expect(page.locator('#grid .week')).toHaveCount(1);
  await expect(cork.locator('a.pill', { hasText: 'Week' })).toHaveAttribute('aria-current', 'page');
  expect(await page.locator('#grid .day .num').allInnerTexts()).toContain(String(day));
  // the arrows go a week at a time
  const first = await page.locator('#grid .day').first().getAttribute('data-date');
  await page.locator('.titlerow button').last().click();
  await expect
    .poll(() => page.locator('#grid .day').first().getAttribute('data-date'))
    .toBe(new Date(Date.parse(first + 'T12:00:00Z') + 7 * 864e5).toISOString().slice(0, 10));
  // 📅 Calendar is still the month
  await cork.locator('a.pill', { hasText: 'Calendar' }).click();
  await expect(page).toHaveURL(/\/edit$/);
  await expect.poll(() => page.locator('#grid .week').count()).toBeGreaterThan(3);
  expect(page.errors).toEqual([]);

  const wall = await as('wall', { path: '/week' });
  await expect(wall.locator('#grid .week')).toHaveCount(1);
  await expect(wall.locator('.cork')).toHaveCount(0); // the wall changes nothing
});

test('the bottom of Notes: a switch between today, up next and photos', async ({ as }) => {
  const wall = await as('wall');
  const sw = wall.locator('.notes .bslide');
  await expect(sw).toBeVisible();
  await sw.getByRole('tab', { name: 'Up next' }).click();
  await expect(wall.locator('.notes .hasswitch .mh')).toHaveText('Up Next');
  await expect(sw.getByRole('tab', { name: 'Up next' })).toHaveAttribute('aria-selected', 'true');
  await sw.getByRole('tab', { name: 'Today' }).click();
  await expect(wall.locator('.notes .hasswitch .mh')).toHaveText('Today');
  await wall.waitForTimeout(600);
  await expect(wall.locator('#slides.on')).toHaveCount(0); // two taps on the switch aren't a double tap
});

test('🗒️ Notes on this screen: its pages, the bottom’s switch, and off (the month and the week each)', async ({
  as
}) => {
  const page = await as('family');
  const sheet = page.locator('#notesSheet');
  await page.locator('#editBtn').click();
  await page.locator('#notesBtn').click();
  await expect(sheet.getByRole('heading', { name: 'Notes on the month' })).toBeVisible();
  await sheet.getByRole('button', { name: /Reward jars/ }).click();
  await sheet.getByRole('button', { name: /Up next/ }).click();
  for (const name of ['🫙 Jars', '📷 Photos'])
    await sheet.locator('.tick', { hasText: name }).locator('input').uncheck();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.notes .hasswitch .mh')).toHaveText('Up Next');
  await expect(page.locator('.notes .bslide button')).toHaveCount(2); // up next and today
  // just one: no switch
  await page.locator('#notesBtn').click();
  await sheet.locator('.tick', { hasText: '☀️ Today' }).locator('input').uncheck();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.notes .bslide')).toHaveCount(0);
  await expect(page.locator('.notes .nslot').last().locator('.mh')).toHaveText('Up Next');
  // off on the month: the calendar takes the whole board; the week still has it
  await page.locator('#notesBtn').click();
  await sheet.locator('#notesShow').uncheck();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.slate .notes')).toHaveCount(0);
  const wall = await as('wall');
  await expect(wall.locator('.slate .notes')).toBeVisible(); // (another screen: the board's)
  const wk = await as('family', { path: '/week' }); // (this screen, on the week)
  await expect(wk.locator('.slate .cal')).toBeVisible();
  await expect(wk.locator('.slate .notes')).toBeVisible();
  await page.locator('#notesBtn').click();
  await sheet.getByRole('button', { name: 'Like the rest of the board' }).click();
  await expect(page.locator('.notes .bslide')).toBeVisible();
});

test('🗓️ Week from today: today and the next 6 days, a week at a time, with every event', async ({ as }) => {
  const page = await as('family', { path: '/week', context: { viewport: { width: 1280, height: 800 } } });
  const today = await page.evaluate(async () => (await (await fetch('api/today')).json()).today as string);
  const plus = (ds: string, n: number) =>
    new Date(Date.parse(ds + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const firstDay = () => page.locator('#grid .day').first().getAttribute('data-date');
  await expect.poll(firstDay).not.toBe(null);
  const sunday = await firstDay();
  // the board's own week first (Sunday), then from today
  await page.locator('#editBtn').click();
  await page.locator('#weekSetBtn').click(); // ⚙️ Week: Settings → Week
  const card = page.locator('#settingsCard');
  await expect(card.getByRole('radio', { name: 'Sunday' })).toHaveAttribute('aria-checked', 'true');
  await card.getByRole('radio', { name: /Today/ }).click();
  await expect(card.getByRole('radio', { name: /Today/ })).toHaveAttribute('aria-checked', 'true');
  await card.locator('.shead .closex').click();
  await expect.poll(firstDay).toBe(today);
  const names = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  await expect(page.locator('.weekdays div').first()).toHaveText(names[new Date(today + 'T12:00:00Z').getUTCDay()]);
  // every week from here has its Saturday soccer and Tuesday piano, even one that starts in the month before
  // (from a Saturday, the week of Sat 28 Nov goes past the start of December's own grid)
  for (let w = 0; w < 8; w++) {
    const start = plus(today, 7 * w);
    await expect.poll(firstDay).toBe(start);
    for (let d = 0; d < 7; d++) {
      const ds = plus(start, d);
      const dow = new Date(ds + 'T12:00:00Z').getUTCDay();
      if (dow !== 6 && dow !== 2) continue;
      await expect(page.locator(`#grid .day[data-date="${ds}"]`)).toContainText(dow === 6 ? 'Soccer' : 'Piano');
    }
    await page.locator('.titlerow button').last().click(); // (quick taps: no photo frame)
  }
  await expect(page.locator('#slides.on')).toHaveCount(0);
  // back to the board's week (and the wall's can be set from the admin console)
  if (!(await page.locator('#weekSetBtn').isVisible())) await page.locator('#editBtn').click();
  await page.locator('#weekSetBtn').click();
  await card.getByRole('radio', { name: 'Sunday' }).click();
  await card.locator('.shead .closex').click();
  await expect.poll(firstDay).toBe(sunday);
  expect(page.errors).toEqual([]);
});

test('⚙️ Settings → This screen hides the − / + / Fit buttons, and brings them back', async ({ as }) => {
  const page = await as('tablet');
  await expect(page.locator('.zoom')).toBeVisible();
  await page.goto(page.url().replace(/edit$/, 'settings'));
  await page.locator('#hideZoomBox').click(); // (ticked once the board has it)
  await expect(page.locator('#hideZoomBox')).toBeChecked();
  await page.goto(page.url().replace(/settings$/, 'edit'));
  await expect(page.locator('#grid')).toBeVisible();
  await expect(page.locator('.zoom')).toHaveCount(0);
  await page.goto(page.url().replace(/edit$/, 'settings'));
  await page.locator('#hideZoomBox').click();
  await expect(page.locator('#hideZoomBox')).not.toBeChecked();
  await page.goto(page.url().replace(/settings$/, 'edit'));
  await expect(page.locator('.zoom')).toBeVisible();
  expect(page.errors).toEqual([]);
});

test('the month arrows: on a family screen they fade when nobody touches it, and a tap brings them back', async ({
  as
}) => {
  const fam = await as('family');
  const next = fam.locator('#next');
  const arrows = (value: string | null) =>
    fam.evaluate(
      v =>
        fetch('api/arrows', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Chalk': '1' },
          body: JSON.stringify({ value: v })
        }).then(r => r.status),
      value
    );
  try {
    expect(await arrows(null)).toBe(200); // the family screen's usual: fading (the tests keep it always there)
    await expect(next).not.toHaveClass(/faded/);
    await expect(next).toHaveClass(/faded/, { timeout: 14_000 }); // quiet for 10 s
    // a tap anywhere brings them back
    await fam.mouse.click(600, 400);
    await expect(next).not.toHaveClass(/faded/);
    expect(await arrows('sideways')).toBe(400);
    // ⚙️ Settings → This screen: always there
    expect(await arrows('always')).toBe(200);
    await fam.waitForTimeout(11_000);
    await expect(next).not.toHaveClass(/faded/);
    // none: the month's name picks the month instead
    expect(await arrows('never')).toBe(200);
    await expect(next).toHaveCount(0);
  } finally {
    await arrows('always'); // (as the other tests expect it)
  }
  // a wall has no arrows at all
  const wall = await as('wall');
  await expect(wall.locator('#next')).toHaveCount(0);
});

test('overnight a screen can show the slideshow, dim the calendar, go black, or do nothing', async ({ as }) => {
  const fam = await as('family');
  const call = (url: string, body: unknown) =>
    fam.evaluate(
      ([u, b]) =>
        fetch(u as string, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Chalk': '1' },
          body: JSON.stringify(b)
        }).then(r => r.status),
      [url, body] as const
    );
  const was = await fam.evaluate(() =>
    fetch('api/photos')
      .then(r => r.json())
      .then(d => d.cfg)
  );
  // overnight hours from an hour ago to an hour from now (the screen's clock)
  const [from, to] = await fam.evaluate(() =>
    [-1, 1].map(h => new Date(Date.now() + h * 3600e3).toTimeString().slice(0, 5))
  );
  try {
    expect(await call('api/photos/settings', { night: true, from, to })).toBe(200);
    expect(await call('api/offhours', { value: 'sideways' })).toBe(400);
    expect(await call('api/offhours', { value: 'black' })).toBe(200);
    await fam.reload();
    const cover = fam.locator('.offCover');
    await expect(cover).toHaveClass(/black/);
    await cover.click(); // a tap: the calendar for 5 minutes
    await expect(cover).toHaveCount(0);
    expect(await call('api/offhours', { value: 'dim' })).toBe(200);
    await fam.reload();
    await expect(cover).toHaveClass(/dim/);
    expect(await call('api/offhours', { value: 'none' })).toBe(200);
    await fam.reload();
    await fam.waitForTimeout(800);
    await expect(cover).toHaveCount(0);
    await expect(fam.locator('#slides.on')).toHaveCount(0);
  } finally {
    await call('api/offhours', { value: null }); // the slideshow, as the other tests expect
    await call('api/photos/settings', { night: was.night, from: was.from, to: was.to });
  }
});

test('a tap on the month’s name picks any month on a screen that edits (or starts it again), not on the wall', async ({
  as
}) => {
  const fam = await as('family');
  const name = await fam.locator('#monthName .mn').textContent();
  await fam.locator('#monthName').click();
  const pick = fam.locator('#monthPicker');
  await expect(pick).toBeVisible();
  await pick.getByRole('button', { name: 'Next year' }).click();
  await pick.getByRole('button', { name: 'Mar', exact: true }).click();
  await expect(pick).toHaveCount(0);
  await expect(fam.locator('#monthName .mn')).toHaveText('March');
  await expect(fam.locator('#monthName small')).toHaveText(String(new Date().getFullYear() + 1));
  await fam.locator('#monthName').click();
  await fam.locator('#monthPicker').getByRole('button', { name: 'This month' }).click();
  await expect(fam.locator('#monthName .mn')).toHaveText(name!);
  // ↻ Start the board again: what the tap used to do
  await fam.evaluate(() => ((window as unknown as { stay: number }).stay = 1));
  await fam.locator('#monthName').click();
  await Promise.all([fam.waitForEvent('load'), fam.locator('#mpReload').click()]);
  expect(await fam.evaluate(() => (window as unknown as { stay?: number }).stay)).toBeUndefined();
  const wall = await as('wall');
  await wall.locator('#monthName').click();
  await wall.waitForTimeout(600);
  await expect(wall.locator('#monthPicker')).toHaveCount(0);
});

test('every page has a ✕ back to the calendar, like the cards; a kid’s own Chores doesn’t', async ({ as, board }) => {
  const page = await as('tablet', { path: '/settings' });
  await page.getByRole('button', { name: 'Back to the calendar' }).click();
  await expect(page).toHaveURL(/\/edit$/);
  await page.goto(board.url + '/meals');
  await page.getByRole('button', { name: 'Back to the calendar' }).click();
  await expect(page).toHaveURL(/\/edit$/);
  expect(page.errors).toEqual([]);
});

test('🗓️ Split View: the week as a band and what the screen picks under it; the Notes column has the weather', async ({
  as,
  board
}) => {
  await board.admin.post('/api/jars', { jars: [{ id: 'nora', name: 'Nora', pieces: ['star'], count: 3, goal: 10 }] });
  const page = await as('family', { path: '/week', context: { viewport: { width: 1280, height: 800 } } });
  await expect(page.locator('#grid .week')).toHaveCount(1);
  // Split View is a choice: a screen that hasn't picked it has the week in the whole height
  await expect(page.locator('.slate .under')).toHaveCount(0);
  const fullH = (await page.locator('#grid').boundingBox())!.height;
  // ⚙️ Week, in the Week page's tools: Settings → Week
  await page.locator('#editBtn').click();
  await page.locator('#weekSetBtn').click();
  const card = page.locator('#settingsCard');
  await expect(card.locator('#setTab-week')).toHaveAttribute('aria-selected', 'true');
  await card.getByRole('radio', { name: 'Split View' }).click();
  await card
    .getByRole('radiogroup', { name: 'Under the week, on the right' })
    .getByRole('radio', { name: /Reward jars/ })
    .click();
  await card.locator('.shead .closex').click();
  // the week is a band; under it the photos and the jars, side by side
  await expect(page.locator('.slate .under .space')).toHaveCount(2);
  await expect(page.locator('.space-photos .sphoto img')).toBeVisible();
  await expect(page.locator('.space-jars .jar[data-id="nora"]')).toBeVisible();
  // a tap on a jar there opens the big jar, as in the Notes column
  await page.locator('.space-jars .jar[data-id="nora"]').click();
  await expect(page.locator('#jarZoom #jzTitle')).toHaveText('Nora’s Jar');
  await page.locator('#jarZoom .jzx .closex').click();
  await expect(page.locator('#jarZoom.open')).toHaveCount(0);
  expect((await page.locator('#grid').boundingBox())!.height).toBeLessThan(fullH * 0.6);
  // the Notes column: the weather, trash day and countdowns, nothing to switch
  await expect(page.locator('.slate .notes #wNow')).toBeVisible();
  await expect(page.locator('.slate .notes .nslot')).toHaveCount(1);
  // pages picked for this screen's week show there too, less what's already under the week (the jars)
  const col = (pages: string[] | null) =>
    page.evaluate(
      c =>
        fetch('api/notescol', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Chalk': '1' },
          body: JSON.stringify({ view: 'week', col: c && { on: true, pages: c } })
        }).then(r => r.status),
      pages
    );
  expect(await col(['info', 'upnext', 'pantry'])).toBe(200);
  await expect(page.locator('.slate .notes .nslot')).toHaveCount(3);
  for (const p of ['info', 'upnext', 'pantry']) await expect(page.locator('.slate .notes .nslot-' + p)).toHaveCount(1);
  expect(await col(['jars', 'upnext'])).toBe(200);
  await expect(page.locator('.slate .notes .nslot')).toHaveCount(1);
  await expect(page.locator('.slate .notes .nslot-upnext')).toHaveCount(1);
  await expect(page.locator('.slate .notes .jar')).toHaveCount(0); // (the jars are under the week, not twice)
  expect(await col(['jars'])).toBe(200); // all of them under the week: the weather
  await expect(page.locator('.slate .notes .nslot')).toHaveCount(1);
  await expect(page.locator('.slate .notes #wNow')).toBeVisible();
  expect(await col(null)).toBe(200); // like the rest of the board
  await expect(page.locator('.slate .notes #wNow')).toBeVisible();
  // a photo alone: centered in the whole width, its own shape
  await page.evaluate(() =>
    fetch('api/weekview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Chalk': '1' },
      body: JSON.stringify({ b: 'none' })
    })
  );
  await expect(page.locator('.slate .under .space')).toHaveCount(1);
  const sp = (await page.locator('.space-photos').boundingBox())!;
  const im = (await page.locator('.space-photos img').boundingBox())!;
  expect(Math.abs(im.x + im.width / 2 - (sp.x + sp.width / 2))).toBeLessThan(2); // centered
  // the month is still the month
  await page.goto(board.url + '/edit');
  await expect.poll(() => page.locator('#grid .week').count()).toBeGreaterThan(3);
  await expect(page.locator('.slate .under')).toHaveCount(0);
  await page.evaluate(() =>
    fetch('api/weekview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Chalk': '1' },
      body: JSON.stringify({ split: false, a: 'photos', b: 'draw' })
    })
  );
  await board.admin.post('/api/jars', { jars: [] });
  expect(page.errors).toEqual([]);
});

test('week view: decorating a week keeps it to that week', async ({ as }) => {
  const page = await as('family', { context: { viewport: { width: 1280, height: 800 } } });
  await page.goto(page.url().replace(/edit$/, 'week'));
  await expect(page.locator('#grid .week')).toHaveCount(1);
  await page.locator('#editBtn').click();
  await expect(page.locator('#drawBtn')).toBeVisible();
  await page.evaluate(async () => {
    const wk = document.querySelector('#grid .day')!.getAttribute('data-date');
    await fetch('api/art/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Chalk': '1' },
      body: JSON.stringify({ ym: wk, items: [{ k: 't', s: 'Busy week!', x: 300, y: 300, z: 30, c: '#ffffff' }] })
    });
  });
  await page.reload();
  await expect.poll(() => page.locator('#grid .week').count()).toBe(1);
  await expect.poll(() => page.locator('#slate').evaluate(e => e.innerHTML.includes('Busy week!'))).toBe(true);
  await page.goto(page.url().replace(/week$/, 'edit'));
  await expect.poll(() => page.locator('#grid .week').count()).toBeGreaterThan(3);
  expect(await page.locator('#slate').evaluate(e => e.innerHTML.includes('Busy week!'))).toBe(false);
});

test('art over events: asks once, then hides them; leftover days hide on their own', async ({ as, board }) => {
  const { ym } = thisMonth();
  const page = await as('family', { context: { viewport: { width: 1280, height: 800 } } });
  // where an event of this month and one on a leftover day are, in board pixels
  const spots = await page.evaluate(() => {
    const s = document.querySelector('#slate')!.getBoundingClientRect();
    const z = s.width / 1252;
    const at = (sel: string) => {
      const el = [...document.querySelectorAll<HTMLElement>(sel)].find(e => e.textContent!.trim());
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: (r.left + r.width / 2 - s.left) / z, y: (r.top + r.height / 2 - s.top) / z, text: el.textContent };
    };
    return { mine: at('.day:not(.other) .ev'), other: at('.day.other .ev') };
  });
  expect(spots.mine).toBeTruthy();
  const pic = (p: { x: number; y: number }) => ({
    k: 'g',
    src: '/api/clip/gi-mummy-head.svg',
    x: p.x,
    y: p.y,
    w: 150,
    h: 150
  });
  const items = [pic(spots.mine!), ...(spots.other ? [pic(spots.other)] : [])];
  const r = await (await board.admin.post('/api/art/bulk', { ym, items })).json();
  try {
    await page.reload();
    const hidden = (t: string) =>
      page.evaluate(
        t =>
          [...document.querySelectorAll('.day .ev')]
            .filter(e => e.textContent === t)
            .some(e => e.classList.contains('underart')),
        t
      );
    if (spots.other) await expect.poll(() => hidden(spots.other!.text!)).toBe(true); // a leftover day: no question
    expect(await hidden(spots.mine!.text!)).toBe(false); // this month's: not until she says so
    await page.locator('#editBtn').click();
    await page.locator('#drawBtn').click();
    await expect(page.locator('.status.ask')).toContainText('This covers');
    await page.locator('#coverHide').click();
    await expect.poll(() => hidden(spots.mine!.text!)).toBe(true);
    await expect(page.locator('.status.ask')).toHaveCount(0);
    // saved with the art, for every screen
    const art = await (await board.admin.api(`/api/art?ym=${ym}`)).json();
    expect(art.filter((x: { cv?: string }) => x.cv === 'hide').length).toBeGreaterThan(0);
  } finally {
    await board.admin.post('/api/art/delete', { ym, ids: r.ids });
  }
});

test('a family screen: the cork stays put going from the calendar to a page and back', async ({ as }) => {
  for (const viewport of [
    { width: 1280, height: 900 }, // taller than the board: a gap under it
    { width: 1600, height: 800 } // wider: gaps at the sides
  ]) {
    const page = await as('family', { context: { viewport } });
    const where = () =>
      page.evaluate(() => {
        const c = document.querySelector('.cork')!.getBoundingClientRect();
        const pill = document.querySelector('.cork a.pill')!.getBoundingClientRect();
        return [c.left, c.top, c.width, c.height, pill.left, pill.top, pill.height].map(v => Math.round(v));
      });
    await page.waitForTimeout(500);
    const onBoard = await where();
    await page.locator('#menuBtn').click();
    await page.locator('#menuPanel').getByRole('link', { name: 'Pantry' }).click();
    await expect(page).toHaveURL(/\/pantry$/);
    const onPage = await where();
    // within 2 pixels: the board's cork is scaled as a picture, the page's is laid out at that size, and the
    // two round a button's width differently by a pixel or so (nothing anyone sees)
    for (let i = 0; i < onBoard.length; i++)
      expect(
        Math.abs(onPage[i] - onBoard[i]),
        `${['left', 'top', 'width', 'height', 'button left', 'button top', 'button height'][i]}: ${onBoard} → ${onPage}`
      ).toBeLessThanOrEqual(2);
  }
});

test('the art on a layer of its own over the calendar (not painted in with its lines), and never a stretched copy', async ({
  as,
  board
}) => {
  const { ym } = thisMonth();
  const stroke = await (
    await board.admin.post('/api/art', { ym, stroke: { c: '#F6B3CB', w: 6, p: [300, 300, 340, 260, 380, 300] } })
  ).json();
  const pic = await (
    await board.admin.post('/api/art/bulk', {
      ym,
      items: [{ k: 'g', x: 470, y: 330, w: 120, h: 120, src: '/api/clip/birthday-cake.svg', mode: 'still' }]
    })
  ).json();
  const t = await as('tablet', { path: '/edit' });
  const own = () =>
    t.evaluate(() =>
      [...document.querySelectorAll('.slate .artSvg, .slate .gifLayer')].map(
        el => el.classList.contains('own') && getComputedStyle(el).willChange === 'transform'
      )
    );
  try {
    await expect(t.locator('.gifLayer img').first()).toBeVisible();
    await expect.poll(own).toEqual([true, true]);
    // drawn at the screen's own resolution: the board is zoomed, not stretched as one layer
    expect(await t.locator('#board').evaluate(el => (el as HTMLElement).style.zoom)).not.toBe('');
    // zoomed in to draw: painted in again, so it's drawn sharp at 2x, not a stretched copy of the layer
    await t.getByRole('button', { name: 'Zoom in' }).click();
    await expect.poll(own).toEqual([false, false]);
    await t.getByRole('button', { name: 'Fit' }).click();
    await expect.poll(own).toEqual([true, true]);
    expect(t.errors).toEqual([]);
  } finally {
    await board.admin.post('/api/art/delete', { ym, ids: [stroke.id, ...pic.ids] });
  }
});
