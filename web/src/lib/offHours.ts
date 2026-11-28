/*
===============================================================================
 Family Chalk Planner | Screens | Helpers | offHours.ts
===============================================================================
 Version:   1.3.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-26
 Updated:   2026-11-28

 Purpose:
     What this screen does in the board's overnight hours (⚙️ Settings →
     🌙 Overnight hours: on, and when): the slideshow (nothing picked, as
     before), the calendar dimmed, a night clock, a black screen, the screen
     turned off
     (lib/wallScreen.ts: Fully Kiosk, else the device's own sleep, black
     meanwhile), or nothing. A tap shows
     the calendar for 5 minutes, as with the slideshow. Kept on the board
     (kv 'offhours') per screen; the admin console sets the wall's.

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

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------------------------- //
// | What a screen does overnight | //
// -------------------------------- //
// Each screen's own choice (screenSetting 'offhours' on the server); none   //
// chosen: the slideshow, as before.                                         //
export type OffMode = 'slides' | 'dim' | 'clock' | 'black' | 'off' | 'none';
export const OFF_MODES: [OffMode, string][] = [
  ['slides', 'The slideshow'],
  ['dim', 'The calendar, dimmed'],
  ['clock', 'A night clock'],
  ['black', 'A black screen'],
  ['off', 'Turn the screen off (where it can)'],
  ['none', 'Nothing (the calendar as it is)']
];

// what this screen picked (the slideshow when it hasn't)
export function useOffHours(): OffMode {
  return useLive<{ mine: OffMode | null }>('api/offhours', ['offhours']).data?.mine || 'slides';
}
export async function setOffHours(value: OffMode) {
  await post('api/offhours', { value: value === 'slides' ? null : value });
  tellThisScreen('offhours');
}
