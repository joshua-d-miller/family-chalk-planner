/*
===============================================================================
 Family Chalk Planner | Screens | main.tsx
===============================================================================
 Version:   1.3.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Updated:   2026-11-28

 Purpose:
     Where the screens start: the fonts, the shared styles, and the App,
     which picks the page for this address.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    The new screens (React + TypeScript): meal
                        colby     plan, reminders, timers, pantry, jars and
                        claude    chores.

 0.14.0    2026-11-07   joshua    A crash shows a message instead of a blank
                        claude    page.

 1.1.0    2026-11-17   joshua    The looks of cards and menus (looks.css).
                        claude

 1.2.0    2026-11-21   joshua    The board's language, before it's drawn.
                        claude

 1.3.0    2026-11-26   joshua    Pages' code downloaded when they're opened:
                        claude    one from before an update starts the screen
                                  again with the new version. ?perf.
===============================================================================
*/

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { Oops } from './ui/Oops.tsx';
import { startLanguage } from './lib/lang.ts';
import './ui/theme.css';
import './ui/ui.css';
import './ui/looks.css';

// a page's code from an older version, gone since the board updated: start again with the new one
// (at most once a minute, so a screen that's offline doesn't keep reloading; else Oops says so)
addEventListener('vite:preloadError', e => {
  try {
    if (Date.now() - Number(sessionStorage.getItem('chalkReloaded') || 0) < 60_000) return;
    sessionStorage.setItem('chalkReloaded', String(Date.now()));
  } catch {
    return;
  }
  e.preventDefault();
  location.reload();
});

// ?perf: how this screen is keeping up (ui/perf.ts; downloaded only then)
if (new URLSearchParams(location.search).has('perf')) void import('./ui/perf.ts').then(m => m.showPerf());

// the board's language (or this screen's), before it's drawn
void startLanguage().then(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Oops>
        <App />
      </Oops>
    </StrictMode>
  )
);
