/*
===============================================================================
 Family Chalk Planner | Build | playwright.homeassistant.config.ts
===============================================================================
 Version:   1.0.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-14
 Updated:   2026-11-14

 Purpose:
     The board as the Home Assistant app, against a real Home Assistant
     (test/real-homeassistant). Needs one running at HA_URL (default
     http://127.0.0.1:8123), brand new (not yet onboarded); CI starts one:
       docker run -d --network host -v $PWD/ha:/config ghcr.io/home-assistant/home-assistant:stable
       npm run test:homeassistant
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.0.0     2026-11-14   joshua    New file.
                        claude
===============================================================================
*/

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'test/real-homeassistant',
  workers: 1, // one Home Assistant, set up once
  fullyParallel: false,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-ha' }]] : 'list',
  outputDir: 'test-results-ha',
  use: {
    viewport: { width: 1280, height: 800 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
  }
});
