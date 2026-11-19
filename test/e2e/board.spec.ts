/*
===============================================================================
 Family Chalk Planner | Tests | Browser | board.spec.ts
===============================================================================
 Version:   1.1.1
 Author:    Joshua D. Miller, Claude
 Updated:   2026-11-18

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
===============================================================================
*/

import { test, expect, thisMonth } from './fixtures.ts';

test('the tablet opens on this month, with weather, countdowns and no errors', async ({ as }) => {
  const page = await as('tablet');
  await expect(page.locator('#monthName')).toContainText(thisMonth().name);
  await expect(page.locator(`[data-date="${thisMonth().date}"]`)).toBeVisible();
  await expect(page.locator('#wNow')).toContainText('58°');
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
  await page.locator('#menuPanel').getByRole('button', { name: 'Pin Week' }).click();
  await page.locator('#menuPanel').getByRole('link', { name: 'Calendar' }).click(); // closes the menu
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

test('the bottom of Notes on this screen: what it shows and what the switch can flip to', async ({ as }) => {
  const page = await as('family');
  await page.locator('#editBtn').click();
  await page.locator('#notesBtn').click();
  await page.locator('#notesSheet').getByRole('radio', { name: '📅 Up next' }).click();
  for (const name of ['🫙 Jars', '📷 Photos'])
    await page.locator('#notesSheet .tick', { hasText: name }).locator('input').uncheck();
  await page.locator('#notesSheet').getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.notes .hasswitch .mh')).toHaveText('Up Next');
  await expect(page.locator('.notes .bslide button')).toHaveCount(2); // up next and today
  // just one: no switch
  await page.locator('#notesBtn').click();
  await page.locator('#notesSheet .tick', { hasText: '☀️ Today' }).locator('input').uncheck();
  await page.locator('#notesSheet').getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.notes .bslide')).toHaveCount(0);
  await expect(page.locator('.notes .nslot').last().locator('.mh')).toHaveText('Up Next');
  await page.locator('#notesBtn').click();
  await page.locator('#notesSheet').getByRole('button', { name: 'Like the rest of the board' }).click();
  await expect(page.locator('.notes .bslide')).toBeVisible();
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
