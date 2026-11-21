/*
===============================================================================
 Family Chalk Planner | Screens | Helpers | weekFrom.ts
===============================================================================
 Version:   1.2.0
 Author:    Joshua D. Miller, Claude
 Updated:   2026-11-21

 Purpose:
     Where this screen's 🗓️ Week starts: on the board's first day of the
     week ('board', nothing saved), or on today ('today': today and the
     next 6 days). Kept on the board (kv 'weekfrom'), per screen or per
     person; the admin console sets any screen's.

 Used by:
     web/src/board/Board.tsx
     web/src/pages/Settings.tsx
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.2.0    2026-11-21   joshua    New file.
                        claude
===============================================================================
*/

import { post } from './api.ts';
import { tellThisScreen, useLive } from './live.ts';

export type WeekFrom = 'board' | 'today';

export function useWeekFrom(): WeekFrom {
  return useLive<{ from: string }>('api/weekfrom', ['weekfrom']).data?.from === 'today' ? 'today' : 'board';
}
export async function setWeekFrom(from: WeekFrom) {
  await post('api/weekfrom', { from });
  tellThisScreen('weekfrom');
}
