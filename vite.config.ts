/*
===============================================================================
 Family Chalk Planner | Build | vite.config.ts
===============================================================================
 Version:   0.13.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Updated:   2026-11-07

 Purpose:
     The screens (React), built into web/dist. The board's server serves
     them; releases ship them built, so a board never builds anything.
     Every address in the app is relative to the page's <base>, so it
     works wherever the board is served from (a Home Assistant sidebar
     puts it under a long path).
       npm run build        build web/dist
       npm run dev:web      the screens with live reload, using a board
           running on port 3002
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    The new screens (React + TypeScript): meal
                        colby     plan, reminders, timers, pantry, jars and
                        claude    chores.
===============================================================================
*/

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const board = process.env.BOARD || 'http://127.0.0.1:3002';
export default defineConfig({
  root: 'web',
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // the wall tablets' browsers (Android System WebView, Fully Kiosk): Chrome 100 and newer
    target: ['chrome100', 'safari15', 'firefox100'],
    assetsDir: 'assets',
    sourcemap: true
  },
  server: {
    proxy: Object.fromEntries(
      ['/api', '/fonts.css', '/fonts', '/icons'].map(p => [p, { target: board, changeOrigin: false }])
    )
  }
});
