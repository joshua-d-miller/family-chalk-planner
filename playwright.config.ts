/*
===============================================================================
 Family Chalk Planner | Build | playwright.config.ts
===============================================================================
 Version:   0.14.2
 Author:    Joshua D. Miller, Claude
 Updated:   2026-11-08

 Purpose:
     Browser tests: the board as each screen sees it (tablet, wall, family
     screen, kid's tablet, phone). They describe what the board does, not
     how it's built, so the React version has to pass them too.
       npx playwright install chromium   (once)
       npm run test:e2e
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-06   joshua    Browser tests for the board as each screen
                        claude    sees it (Playwright).

                                  Server and tests are all TypeScript (ES
                                  modules).

 0.14.0    2026-11-07   joshua    CHROMIUM_PATH: use a Chromium already on the
                        claude    machine.

 0.14.2    2026-11-08   joshua    Two workers, each with its own board.
                        claude
===============================================================================
*/

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'test/e2e',
  // two at a time, each with its own board; the tests in one file share theirs, so they stay in order
  workers: 2,
  fullyParallel: false,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    viewport: { width: 1180, height: 820 }, // an iPad in landscape
    hasTouch: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    // another Chromium than Playwright's own (a machine that has one installed already)
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
  }
});
