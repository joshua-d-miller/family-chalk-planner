/*
===============================================================================
 Family Chalk Planner | Tests | Browser | languages.spec.ts
===============================================================================
 Version:   1.2.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-21
 Updated:   2026-11-21

 Purpose:
     The board in Spanish: a screen picks its language (⚙️ Settings → This
     screen), and the board, Settings, the app pages and the admin console
     come up in it, with no English left in the words the board wrote
     (what the family wrote stays as they wrote it). Back to English the
     same way.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.2.0    2026-11-21   joshua    New file.
                        claude
===============================================================================
*/

import { test, expect } from './fixtures.ts';

const setLang = (p, lang: string | null) =>
  p.evaluate(
    l =>
      fetch('api/lang', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Chalk': '1' },
        body: JSON.stringify({ lang: l })
      }),
    lang
  );

// English words still on the page (outside translate="no"), leaving out names, brands and addresses
const english = p =>
  p.evaluate(() => {
    const EN =
      /\b(the|to|and|your|this|that|tap|add|with|from|until|days|sleeps|done|pick|change|show|hide|screen|board|photos|calendar|week|month|today|tomorrow|events|settings|save|cancel|close)\b/i;
    const KEEP = /Family Chalk Planner|Google Calendar|https?:|webcal:|\/|@/;
    const out: string[] = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const el = n.nodeType === 1 ? (n as Element) : n.parentElement!;
      if (el.closest('script,style,svg,textarea,[translate="no"]')) continue;
      if ((el as HTMLElement).offsetParent === null && getComputedStyle(el).position !== 'fixed') continue;
      const vals =
        n.nodeType === 3
          ? [(n as Text).data]
          : ['placeholder', 'title', 'aria-label'].map(a => (n as Element).getAttribute(a) || '');
      for (const v of vals) {
        const t = v.trim();
        if (t && EN.test(t) && !KEEP.test(t) && !/[áéíóúñ¿¡]/i.test(t)) out.push(t);
      }
    }
    return out;
  });

test('a screen in Spanish: the board, Settings and the menu', async ({ as, board }) => {
  await board.admin.post('/api/jars', { jars: [{ id: 'nora', name: 'Nora', pieces: ['star'], count: 3, goal: 10 }] });
  const f = await as('family', { context: { viewport: { width: 1920, height: 1080 } } });
  await setLang(f, 'es'); // (the screen reloads itself in its new language)
  await expect(f.locator('html')).toHaveAttribute('lang', 'es');
  await expect(f.locator('#editBtn')).toBeVisible();
  expect(await english(f)).toEqual([]);
  await f.locator('#menuBtn').click();
  await expect(f.getByText('Ajustes', { exact: true }).first()).toBeVisible();
  expect(await english(f)).toEqual([]);
  await f.locator('#tile-settings').click();
  for (const t of ['holidays', 'photos', 'week', 'screen']) {
    await f.locator('#setTab-' + t).click();
    expect(await english(f), t).toEqual([]);
  }
  // what the family wrote stays as it is
  await expect(f.locator('.notes').getByText('Nora').first()).toBeVisible();
  await setLang(f, null);
  await expect(f.locator('html')).toHaveAttribute('lang', 'en');
  await board.admin.post('/api/jars', { jars: [] });
  expect(f.errors).toEqual([]);
});

test('a tablet in Spanish: the app pages', async ({ as, board }) => {
  const t = await as('tablet');
  await setLang(t, 'es');
  await expect(t.locator('html')).toHaveAttribute('lang', 'es');
  for (const page of ['/chores', '/meals', '/reminders', '/timers', '/pantry']) {
    await t.goto(board.url + page);
    await expect(t.locator('html')).toHaveAttribute('lang', 'es');
    await t.waitForTimeout(300);
    expect(await english(t), page).toEqual([]);
  }
  await setLang(t, null);
  expect(t.errors).toEqual([]);
});

test('the admin console in Spanish', async ({ as }) => {
  const a = await as('admin', { path: '/admin' });
  await setLang(a, 'es');
  await a.reload(); // (the console doesn't follow along live: it's read when it opens)
  await expect(a.locator('html')).toHaveAttribute('lang', 'es');
  for (const tab of ['screens', 'people', 'security', 'board']) {
    await a.locator(`[data-t="${tab}"]`).click();
    await a.waitForTimeout(300);
    expect(await english(a), tab).toEqual([]);
  }
  await setLang(a, null);
  expect(a.errors).toEqual([]);
});
