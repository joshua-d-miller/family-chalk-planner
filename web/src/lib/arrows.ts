/*
===============================================================================
 Family Chalk Planner | Screens | Helpers | arrows.ts
===============================================================================
 Version:   1.3.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-26
 Updated:   2026-11-26

 Purpose:
     The month (and week) arrows on this screen: always there, or fading
     when nobody's touching the screen, coming back with any tap. Set in
     ⚙️ Settings → This screen, kept on the board (kv 'arrows') per person
     or screen; or none, where a tap on the month's name picks the month
     (the week keeps its arrows). Nothing picked: fading on a family screen (a shared touch
     screen, where they're mostly in the way), always anywhere else.

 Used by:
     web/src/board/Board.tsx
     web/src/pages/Settings.tsx
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.3.0     2026-11-26   joshua    New file.
                        claude
===============================================================================
*/

import { post } from './api.ts';
import { tellThisScreen, useLive } from './live.ts';
import type { Who } from './who.ts';

export type Arrows = 'always' | 'fade' | 'never'; // never: the month's name picks the month (the week keeps them)
export const ARROWS_FADE_MS = 10_000; // quiet this long, and they fade

export const arrowsDefault = (w: Who | null): Arrows => (!w?.user && w?.device?.role === 'family' ? 'fade' : 'always');

// what this screen picked (null: the default)
export function useMyArrows(): Arrows | null {
  return useLive<{ mine: Arrows | null }>('api/arrows', ['arrows']).data?.mine ?? null;
}
export async function setArrows(value: Arrows | null) {
  await post('api/arrows', { value });
  tellThisScreen('arrows');
}
