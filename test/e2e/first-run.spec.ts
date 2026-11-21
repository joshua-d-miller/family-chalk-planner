/*
===============================================================================
 Family Chalk Planner | Tests | Browser | first-run.spec.ts
===============================================================================
 Version:   1.2.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-14
 Updated:   2026-11-21

 Purpose:
     docs/getting-started.md, done by a browser on a brand-new board, the
     way a new family does it: the setup code, the admin account and its
     authenticator code, ⚙️ Board → the calendar (Find my calendars) →
     Save and restart, a wall screen paired with its code, and the wall
     showing the family's events. The board runs through the container's
     start script (deploy/docker-entrypoint.sh), so Save and restart
     starts it again the way Docker and the Home Assistant app do.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.17.1    2026-11-14   joshua    New file.
                        claude

 0.17.2    2026-11-14   joshua    A password manager filling the admin's
                        claude    sign-in into the calendar's fields doesn't
                                  end up saved as the calendar's.

 1.2.0    2026-11-21   joshua    Through the setup guide, one step at a
                        claude    time; the 🧭 Setup guide runs again.
===============================================================================
*/

import { expect, test } from '@playwright/test';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { totpAt } from '../../server/access/secrets.ts';
import * as mockCaldav from '../mock-caldav.ts';

const ROOT = path.join(import.meta.dirname, '..', '..');
const PORT = 4950,
  DAV = 4951;
const base = `http://127.0.0.1:${PORT}`;
let board: ChildProcess, dav: Server, data: string;
let log = '';

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

test.beforeAll(async () => {
  dav = await mockCaldav.start(DAV);
  data = fs.mkdtempSync(path.join(os.tmpdir(), 'fcp-first-'));
  fs.chmodSync(data, 0o777); // (run as root, the start script hands it to the board's user)
  board = spawn('sh', [path.join(ROOT, 'deploy', 'docker-entrypoint.sh'), process.execPath, 'server/chalkboard.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(PORT),
      BIND: '127.0.0.1',
      DATA_DIR: data,
      TIMEZONE: 'America/New_York',
      PUID: '1000',
      PGID: '1000'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  board.stdout!.on('data', d => (log += d));
  board.stderr!.on('data', d => (log += d));
  await expect.poll(() => /setup code ([A-Z0-9]{4}-[A-Z0-9]{4})/.exec(log)?.[1], { timeout: 30_000 }).toBeTruthy();
});
test.afterAll(() => {
  board?.kill('SIGTERM');
  dav?.close();
});

test('a new family: setup code → admin → calendar → wall', async ({ browser }) => {
  const code = /setup code ([A-Z0-9]{4}-[A-Z0-9]{4})/.exec(log)![1];
  const p = await (await browser.newContext({ viewport: { width: 900, height: 900 } })).newPage();
  const errors: string[] = [];
  p.on('pageerror', e => errors.push(e.message));

  // Step 2: the admin account
  await p.goto(base + '/admin');
  await p.locator('#suCode').fill(code);
  await p.locator('#suUser').fill('alex');
  await p.locator('#suName').fill('Alex');
  await p.locator('#suPw').fill('correct horse battery');
  await p.locator('#suPw2').fill('correct horse battery');
  await p.locator('#suGo').click();
  await expect(p.locator('#vEnroll')).toBeVisible();
  const secret = (await p.locator('#enSecret').innerText()).replace(/\s/g, '');
  await p.locator('#enCode').fill(totpAt(secret, Math.floor(Date.now() / 30000)));
  await p.locator('#enGo').click();
  const skip = p.locator('#offerSkip');
  await expect.poll(async () => (await skip.isVisible()) || (await p.locator('#vConsole').isVisible())).toBe(true);
  if (await skip.isVisible()) await skip.click(); // (offered a passkey: not now)
  await expect(p.locator('#vConsole')).toBeVisible();

  // The setup guide, one step at a time
  const step = p.locator('#wizStep');
  await expect(step).toHaveText(/step 1 of 5/);
  await expect(p.locator('#tabs')).toBeHidden();
  // 1. the board's name
  await p.locator('[data-k="BOARD_TITLE"]').pressSequentially('The Test Family');
  await p.locator('#wizNext').click();
  // 2. the weather: skipped
  await expect(step).toHaveText(/step 2 of 5/);
  await p.locator('#wizSkip').click();
  // 3. the calendar, typed in and found
  await expect(step).toHaveText(/step 3 of 5/);
  await expect(p.locator('#bfUrl')).toBeVisible();
  await expect(p.locator('[data-k="BOARD_TITLE"]')).toBeHidden(); // (just this step's part)
  await p.locator('#bfUrl').fill(`http://127.0.0.1:${DAV}/`);
  await p.locator('#bfUser').pressSequentially('u');
  await p.locator('#bfPass').pressSequentially('p');
  await p.locator('#bfFind').click();
  await expect(p.locator('#bfFindErr')).toContainText('Signed in');
  await p.locator('#bfCal').fill('Family');
  await p.locator('#wizNext').click();
  // 4. photos: skipped, but what the steps before filled in is saved (the board starts again by itself)
  await expect(step).toHaveText(/step 4 of 5/);
  await p.locator('#wizSkip').click();
  await expect.poll(() => log.split('starting again with the new settings').length - 1, { timeout: 30_000 }).toBe(1);
  await expect(step).toHaveText(/step 5 of 5/, { timeout: 30_000 });

  // 5. a wall screen shows a code; pairing it shows the family's calendar
  const wall = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  wall.on('pageerror', e => errors.push(e.message));
  await wall.goto(base + '/');
  await expect(wall.locator('body')).toContainText(/[A-Z0-9]{4}-[A-Z0-9]{4}/, { timeout: 20_000 });
  const wallCode = /[A-Z0-9]{4}-[A-Z0-9]{4}/.exec(await wall.locator('body').innerText())![0];
  await p.locator('#dvCode').fill(wallCode);
  await p.locator('#dvName').fill('Kitchen wall');
  await p.locator('#dvGo').click();
  await expect(p.locator('#dvList')).toContainText('paired');
  // the mock calendar's weekly Soccer (every Saturday), on the wall
  await expect(wall.locator('#grid')).toContainText('Soccer', { timeout: 20_000 });
  await p.locator('#wizNext').click(); // Done
  await expect(p.locator('#wizBar')).toBeHidden();
  await expect(p.locator('#tabs')).toBeVisible();

  // A password manager filling the admin's own sign-in into the calendar's fields (no typing): saving
  // the board's name must not make that sign-in the calendar's
  await p.locator('[data-t="board"]').click();
  await expect(p.locator('[data-k="BOARD_TITLE"]')).toHaveValue('The Test Family');
  await p.locator('#bfUser').fill('alex');
  await p.locator('#bfPass').fill('correct horse battery');
  await p.locator('[data-k="BOARD_TITLE"]').press('End');
  await p.locator('[data-k="BOARD_TITLE"]').pressSequentially('!');
  await p.locator('#bfSave').click();
  await expect.poll(() => log.split('starting again with the new settings').length - 1, { timeout: 30_000 }).toBe(2);
  await expect
    .poll(async () => (await fetch(base + '/api/whoami').catch(() => null))?.ok ?? false, { timeout: 30_000 })
    .toBe(true);
  await p.reload();
  if (await p.locator('#vLogin').isVisible()) throw new Error('the console asked to sign in again after the restart');
  await p.locator('[data-t="board"]').click();
  await expect(p.locator('[data-k="BOARD_TITLE"]')).toHaveValue('The Test Family!');
  await expect(p.locator('#bfUser')).toHaveValue('u'); // the calendar's own, not the admin's
  // the 🧭 Setup guide runs again
  await p.locator('#wizAgain').click();
  await expect(step).toHaveText(/step 1 of 5/);
  await p.locator('#wizSkip').click();
  await p.locator('#wizSkip').click();
  await p.locator('#wizSkip').click();
  await expect(step).toHaveText(/step 4 of 5/);
  expect(errors).toEqual([]);
});
