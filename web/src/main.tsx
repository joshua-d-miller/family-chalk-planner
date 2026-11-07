/*
===============================================================================
 Family Chalk Planner | Screens | main.tsx
===============================================================================
 Version:   0.14.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Updated:   2026-11-07

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
===============================================================================
*/

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { Oops } from './ui/Oops.tsx';
import './ui/theme.css';
import './ui/ui.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Oops>
      <App />
    </Oops>
  </StrictMode>
);
