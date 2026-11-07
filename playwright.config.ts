/*
===============================================================================
 Family Chalk Planner | Build | playwright.config.ts
===============================================================================
 Version:   0.13.0
 Author:    Joshua D. Miller, Claude
 Updated:   2026-11-06

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
===============================================================================
*/

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'test/e2e',
  // one board per worker; tests share it, so keep them in order
  workers: 1,
  fullyParallel: false,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    viewport: { width: 1180, height: 820 }, // an iPad in landscape
    hasTouch: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  }
});
