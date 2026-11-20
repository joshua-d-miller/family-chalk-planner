/*
===============================================================================
 Family Chalk Planner | Screens | Lib | weekStyle.ts
===============================================================================
 Version:   1.2.0
 Author:    Colby Way, Claude
 Created:   2026-11-19
 Updated:   2026-11-19

 Purpose:
     Whether the Week page starts on today (a rolling 7-day outlook, today on
     the far left) instead of on the first day of the calendar week. Kept on
     this device (localStorage) and configured in Settings → This screen.
     Defaults to the calendar week (false).
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.2.0     2026-11-19   colby     The Week page can start on today and always
                        claude    show the next 7 days.
===============================================================================
*/

import { useEffect, useState } from 'react';
import { subscribe, tellThisScreen } from './live.ts';

const KEY = 'fcp:rollingWeek';
const EVENT = 'weekstyle';

export function rollingWeekHere(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setRollingWeekHere(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    /* (private browsing) */
  }
  tellThisScreen(EVENT);
}

export function useRollingWeek(): boolean {
  const [on, setOn] = useState(rollingWeekHere);
  useEffect(() => {
    const unsub = subscribe(EVENT, () => setOn(rollingWeekHere()));
    return () => {
      unsub();
    };
  }, []);
  return on;
}
