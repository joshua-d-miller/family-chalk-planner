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

     And whether it's Split View: the week as a band across the top, and
     one or two spaces under it (kv 'weekview').

 Used by:
     web/src/board/Board.tsx
     web/src/pages/Settings.tsx
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.2.0    2026-11-21   joshua    New file. Split View and its spaces too.
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

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------- //
// | Split View | //
// -------------- //
// What can go under the week: photos (one at a time, as they are), room to //
// draw, or one of the Notes column's pages.                                 //
export type Space = 'photos' | 'draw' | 'meals' | 'pantry' | 'jars' | 'chores' | 'reminders' | 'upnext';
export const SPACES: [Space, string][] = [
  ['photos', '📷 Photos'],
  ['draw', '✏️ Room to draw'],
  ['meals', '🍽️ Meal plan'],
  ['pantry', '🥫 Pantry'],
  ['jars', '🫙 Reward jars'],
  ['chores', '🧹 Chores'],
  ['reminders', '🔔 Reminders'],
  ['upnext', '📅 Up next']
];
export interface WeekView {
  split: boolean;
  a: Space;
  b: Space | 'none';
}
const ALL_WEEK: WeekView = { split: false, a: 'photos', b: 'draw' };
export function useWeekView(): WeekView {
  return useLive<WeekView>('api/weekview', ['weekview']).data || ALL_WEEK;
}
export async function setWeekView(change: Partial<WeekView>) {
  await post('api/weekview', change);
  tellThisScreen('weekview');
}
