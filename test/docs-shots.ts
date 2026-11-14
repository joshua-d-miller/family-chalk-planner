/*
===============================================================================
 Family Chalk Planner | Tests | docs-shots.ts
===============================================================================
 Version:   0.17.1
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-14
 Updated:   2026-11-14

 Purpose:
     The screenshots in docs/getting-started.md, from a brand-new board:
     the setup code, the authenticator app, ⚙️ Board and its calendar, a
     wall showing its pairing code, pairing it, and an invite. Made-up
     names and accounts only. Writes docs/images/start-*.jpg.

       CHROMIUM_PATH=/usr/bin/google-chrome node test/docs-shots.ts
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.17.1    2026-11-14   joshua    New file.
                        claude
===============================================================================
*/

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { totpAt } from '../server/access/secrets.ts';
import * as mockCaldav from './mock-caldav.ts';

const OUT = path.resolve(import.meta.dirname, '..', 'docs', 'images') + '/start-';
const ROOT = path.resolve(import.meta.dirname, '..');
const port = 4900,
  dav = 4901;
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fcp-docs-'));
const davServer = await mockCaldav.start(dav);
const proc = spawn(process.execPath, [path.join(ROOT, 'server', 'chalkboard.js')], {
  env: {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(port),
    BIND: '127.0.0.1',
    DATA_DIR: data,
    TIMEZONE: 'America/New_York'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});
let log = '';
proc.stdout.on('data', d => (log += d));
proc.stderr.on('data', d => (log += d));
const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 100; i++) {
  try {
    if ((await fetch(base + '/api/today')).ok) break;
  } catch {}
  await new Promise(r => setTimeout(r, 150));
}
for (let i = 0; i < 50 && !fs.existsSync(path.join(data, 'setup-code.txt')); i++)
  await new Promise(r => setTimeout(r, 100));
const code = fs.readFileSync(path.join(data, 'setup-code.txt'), 'utf8').trim();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const ctx = await browser.newContext({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 1.5 });
const p = await ctx.newPage();
const shot = async (n: string, sel?: string) => {
  await p.waitForTimeout(500);
  if (sel) await p.locator(sel).screenshot({ path: OUT + n + '.jpg', quality: 85 });
  else await p.screenshot({ path: OUT + n + '.jpg', quality: 85 });
};
await p.goto(base + '/admin');
await p.locator('#suCode').fill(code);
await p.locator('#suUser').fill('alex');
await p.locator('#suName').fill('Alex');
await p.locator('#suPw').fill('correct horse battery');
await p.locator('#suPw2').fill('correct horse battery');
await shot('1-setup', 'main');
await p.locator('#suGo').click();
await p.locator('#vEnroll').waitFor();
await shot('2-authenticator', 'main');
const secret = (await p.locator('#enSecret').innerText()).replace(/\s/g, '');
await p.locator('#enCode').fill(totpAt(secret, Math.floor(Date.now() / 30000)));
await p.locator('#enGo').click();
await p.waitForTimeout(1500);
if (await p.locator('#offerSkip').isVisible()) await p.locator('#offerSkip').click();
await p.locator('#vConsole').waitFor();
await p.locator('[data-t="board"]').click();
await p.waitForTimeout(800);
await shot('3-board-settings');
// the calendar card, filled in for iCloud (a made-up account)
const cal = p.locator('.card', { has: p.locator('h2', { hasText: /^Calendar$/ }) });
await cal.scrollIntoViewIfNeeded();
await cal.locator('input').first().fill('https://caldav.icloud.com/');
await cal.locator('input').nth(1).fill('you@icloud.com');
await cal.locator('input[type="password"]').first().fill('abcd-efgh-ijkl-mnop');
await p.waitForTimeout(300);
await cal.screenshot({ path: OUT + '3b-calendar.jpg', quality: 85 });
// the wall: a new screen shows its pairing code
const wallCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const wall = await wallCtx.newPage();
await wall.goto(base + '/');
await wall.waitForTimeout(2500);
await wall.screenshot({ path: OUT + '4-wall-code.jpg', quality: 85 });
const wallCode = (await wall.locator('body').innerText()).match(/[A-Z0-9]{4}-[A-Z0-9]{4}/)?.[0] || '';
await p.locator('[data-t="screens"]').click();
await p.locator('#dvCode').fill(wallCode);
await p.locator('#dvName').fill('Kitchen wall');
await shot('5-pair', 'main');
await p.locator('#dvGo').click();
await p.locator('[data-t="people"]').click();
await p.locator('#ivUser').fill('sam');
await p.locator('#ivName').fill('Sam');
await shot('7-invite', 'main');
await browser.close();
proc.kill();
davServer.close();
