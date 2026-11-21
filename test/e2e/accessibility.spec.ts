/*
===============================================================================
 Family Chalk Planner | Tests | Browser | accessibility.spec.ts
===============================================================================
 Version:   1.2.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-21
 Updated:   2026-11-21

 Purpose:
     Every screen checked with axe (WCAG 2 A and AA): every button and field
     has a name a screen reader can say, and so on. The ☰ menu and Settings
     also pass color contrast in each look (the calendar's own chalk is
     left out: chalk on a chalkboard is the family's choice of style, which
     🎨 Board style warns about when it's hard to read).
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.2.0    2026-11-21   joshua    New file.
                        claude
===============================================================================
*/

import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures.ts';

const LINUX = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
// what axe finds (without color contrast: see above), as lines that say where
async function problems(p: Page) {
  const r = await new AxeBuilder({ page: p })
    .withTags(['wcag2a', 'wcag2aa'])
    .disableRules(['color-contrast'])
    .analyze();
  return r.violations.flatMap(v => v.nodes.map(n => `${v.id}: ${n.target.join(' ')}`));
}
async function contrast(p: Page, inside: string) {
  const r = await new AxeBuilder({ page: p }).include(inside).withRules(['color-contrast']).analyze();
  return r.violations.flatMap(v => v.nodes.map(n => `${v.id}: ${n.target.join(' ')}`));
}

test('every screen has names a screen reader can say (axe, WCAG 2 AA)', async ({ as, board }) => {
  await board.admin.post('/api/jars', { jars: [{ id: 'nora', name: 'Nora', pieces: ['star'], count: 3, goal: 10 }] });
  const fam = await as('family', { context: { userAgent: LINUX } });
  expect(await problems(fam), 'family screen').toEqual([]);
  await fam.locator('#menuBtn').click();
  expect(await problems(fam), 'the ☰ menu').toEqual([]);
  await fam.locator('#thisScreenBtn').click();
  expect(await problems(fam), 'Settings').toEqual([]);
  await fam.locator('#settingsCard .shead .closex').click();
  await fam.locator('#addBtn').click();
  expect(await problems(fam), 'the event card').toEqual([]);
  await fam.keyboard.press('Escape');
  await fam.locator('.notes .jar[data-id="nora"]').click();
  expect(await problems(fam), 'the big jar').toEqual([]);
  const wall = await as('wall');
  expect(await problems(wall), 'the wall').toEqual([]);
  const tab = await as('tablet');
  expect(await problems(tab), 'a tablet').toEqual([]);
  const phone = await as('phone');
  expect(await problems(phone), 'a phone').toEqual([]);
  for (const page of ['/meals', '/reminders', '/timers', '/pantry', '/jars', '/settings']) {
    await tab.goto(board.url + page);
    await tab.waitForTimeout(400);
    expect(await problems(tab), page).toEqual([]);
  }
  await board.admin.post('/api/jars', { jars: [] });
});

test('the ☰ menu and Settings are easy to read in every look (color contrast)', async ({ as }) => {
  const fam = await as('family', { context: { userAgent: LINUX } });
  const look = (l: string) =>
    fam.evaluate(
      l =>
        fetch('api/uilook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Chalk': '1' },
          body: JSON.stringify({ look: l })
        }),
      l
    );
  for (const l of ['chalk', 'light', 'dark', 'contrast']) {
    await look(l);
    await fam.reload();
    await fam.locator('#menuBtn').click();
    await fam.waitForTimeout(300); // (the drawer slides in)
    expect(await contrast(fam, '#menuPanel'), `${l}: the ☰ menu`).toEqual([]);
    await fam.locator('#thisScreenBtn').click();
    expect(await contrast(fam, '#settingsCard'), `${l}: Settings`).toEqual([]);
    await fam.locator('#settingsCard .shead .closex').click();
  }
  await look('chalk');
});
