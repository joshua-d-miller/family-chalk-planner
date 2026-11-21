/*
===============================================================================
 Family Chalk Planner | Screens | Helpers | boardFit.ts
===============================================================================
 Version:   1.2.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Updated:   2026-11-21

 Purpose:
     How this screen's board fits it: filling the screen (a taller
     calendar on a 16:9 or 16:10 screen, instead of bands above and
     below), and whether the wooden frame is left off (a screen in a
     frame of its own), and whether it's a low-power screen (a slow wall
     screen: no moving weather, GIFs or fades, and plainer chalk). Kept on
     the board (kv 'boardfit'), per screen or
     per person; the admin console sets any screen's.

 Used by:
     web/src/board/Board.tsx
     web/src/board/editors/StyleEditor.tsx
     web/src/pages/Settings.tsx
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.2.0    2026-11-21   joshua    New file (in place of Colby Way's padding
                        colby     slider and frame setting, which this
                        claude    screen kept in the browser).
===============================================================================
*/

import { post } from './api.ts';
import { tellThisScreen, useLive } from './live.ts';

export interface BoardFit {
  fill: boolean;
  noFrame: boolean;
  low: boolean; // a low-power screen: no moving weather, GIFs or fades, and plainer chalk
}
export function useBoardFit(): BoardFit {
  const d = useLive<BoardFit>('api/boardfit', ['boardfit']).data;
  return { fill: !!d?.fill, noFrame: !!d?.noFrame, low: !!d?.low };
}
export async function setBoardFit(change: Partial<BoardFit>) {
  await post('api/boardfit', change);
  tellThisScreen('boardfit');
}
