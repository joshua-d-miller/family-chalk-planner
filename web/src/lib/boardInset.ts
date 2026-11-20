/*
===============================================================================
 Family Chalk Planner | Screens | Lib | boardInset.ts
===============================================================================
 Version:   1.2.0
 Author:    Colby Way, Claude
 Created:   2026-11-19
 Updated:   2026-11-19

 Purpose:
     The space kept around the whole board on this screen, in pixels.
     0 fits the board to the screen (the default); more leaves room around
     it; less (down to -50) makes it bigger than the screen, trimming the
     edges, to take up the bands above and below. Kept on this device
     (localStorage) and configured in Settings → This screen.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.2.0     2026-11-19    colby    Adjust the padding around the board.
                         claude
===============================================================================
*/

import { useEffect, useState } from 'react';
import { subscribe, tellThisScreen } from './live.ts';

const KEY = 'fcp:boardInset';
const EVENT = 'boardinset';
export const INSET_MIN = -50;
export const INSET_MAX = 100;

export function boardInsetHere(): number {
  try {
    const n = Number(localStorage.getItem(KEY));
    return Number.isFinite(n) ? Math.max(INSET_MIN, Math.min(INSET_MAX, Math.round(n))) : 0;
  } catch {
    return 0;
  }
}

export function setBoardInsetHere(px: number) {
  try {
    if (px) localStorage.setItem(KEY, String(px));
    else localStorage.removeItem(KEY);
  } catch {
    /* (private browsing) */
  }
  tellThisScreen(EVENT);
}

export function useBoardInset(): number {
  const [px, setPx] = useState(boardInsetHere);
  useEffect(() => {
    const unsub = subscribe(EVENT, () => setPx(boardInsetHere()));
    return () => {
      unsub();
    };
  }, []);
  return px;
}
