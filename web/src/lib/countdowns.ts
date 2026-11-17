/*
===============================================================================
 Family Chalk Planner | Screens | Helpers | countdowns.ts
===============================================================================
 Version:   1.1.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-17
 Updated:   2026-11-17

 Purpose:
     The countdowns as every screen sees them: the next few (or every one
     in the next 60 days, for the day badges), and how this screen counts
     them: in sleeps ("3 sleeps!") or days. A kid's tablet counts sleeps
     unless told otherwise; every other screen counts days. The choice is
     kept on the board (kv 'sleeps'), per screen or per person.

 Used by:
     web/src/board/Notes.tsx, Month.tsx, Countdown.tsx, Slideshow.tsx
     web/src/pages/Chores.tsx, Settings.tsx
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.1.0    2026-11-17   joshua    New file.
                        claude
===============================================================================
*/

import { post } from './api.ts';
import { tellThisScreen, useLive } from './live.ts';
import { kidOf, useWho } from './who.ts';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------ //
// | The countdowns | //
// ------------------ //
export interface Countdown {
  icon: string;
  title: string;
  date: string;
  days: number; // 0 = today
  starred?: boolean; // starred on an event (not a big holiday)
}
// the next 3 (Notes, the big card); every one in the next 60 days with all
export function useCountdowns(all = false): Countdown[] {
  return useLive<Countdown[]>(all ? 'api/countdowns?all=1' : 'api/countdowns', ['countdowns', 'calendar']).data || [];
}
// the pictures a countdown can have (the same list as server/calendar/routes.ts)
export const CD_ICONS = [
  '⭐',
  '🎉',
  '🎂',
  '🎁',
  '🎄',
  '🎃',
  '🦃',
  '🐰',
  '💝',
  '🎆',
  '🏖️',
  '🏕️',
  '✈️',
  '🎢',
  '⚽',
  '🎓',
  '🏫',
  '🎭'
];

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------- //
// | Sleeps, or days | //
// ------------------- //
// This screen's choice; nothing saved = sleeps on a kid's tablet, days      //
// everywhere else.                                                          //
export function useSleeps(): boolean {
  const who = useWho().data;
  const v = useLive<{ sleeps: boolean | null }>('api/sleeps', ['sleeps']).data?.sleeps;
  if (typeof v === 'boolean') return v;
  return !!kidOf(who || null);
}
export async function setSleeps(sleeps: boolean | null) {
  await post('api/sleeps', { sleeps });
  tellThisScreen('sleeps');
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------- //
// | Saying it | //
// ------------- //
// "3 sleeps", "1 sleep", "today"; or "3 days", "tomorrow", "today".         //
export function howLong(days: number, sleeps: boolean): string {
  if (days <= 0) return 'today';
  if (sleeps) return days === 1 ? '1 sleep' : `${days} sleeps`;
  return days === 1 ? 'tomorrow' : `${days} days`;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
