/*
===============================================================================
 Family Chalk Planner | Screens | Lib | zoomControls.ts
===============================================================================
 Version:   0.17.1
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-16
 Updated:   2026-11-16

 Purpose:
     Whether the − / + / Fit zoom buttons in the upper right of the board
     show on this screen. Kept on this device (localStorage) and configured
     in Settings → This screen. Defaults to shown (true).
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.17.1    2026-11-16   colby     Option to hide the − / + / Fit buttons on
                                  this screen.
===============================================================================
*/

import { useEffect, useState } from 'react';
import { subscribe, tellThisScreen } from './live.ts';

const HIDE_KEY = 'fcp:hideZoom';
const EVENT = 'zoomcontrols';

export function hideZoomHere(): boolean {
  try {
    return localStorage.getItem(HIDE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setHideZoomHere(hide: boolean) {
  try {
    if (hide) localStorage.setItem(HIDE_KEY, '1');
    else localStorage.removeItem(HIDE_KEY);
  } catch {
    /* (private browsing) */
  }
  tellThisScreen(EVENT);
}

export function useHideZoom(): boolean {
  const [hide, setHide] = useState(hideZoomHere);
  useEffect(() => {
    const unsub = subscribe(EVENT, () => setHide(hideZoomHere()));
    return () => {
      unsub();
    };
  }, []);
  return hide;
}
