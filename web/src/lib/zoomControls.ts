/*
===============================================================================
 Family Chalk Planner | Screens | Helpers | zoomControls.ts
===============================================================================
 Version:   1.2.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-16
 Updated:   2026-11-21

 Purpose:
     Whether the − / + / Fit zoom buttons at the board's top right show on
     this screen: shown unless hidden in ⚙️ Settings → This screen. Kept on
     the board (kv 'nozoom'), per person (only a screen someone is signed
     in on has them), so a cleared browser keeps it.

 Used by:
     web/src/board/Board.tsx
     web/src/pages/Settings.tsx
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.2.0    2026-11-21   colby     Hide the − / + / Fit buttons on this screen.
                        joshua    Kept on the board.
                        claude
===============================================================================
*/

import { post } from './api.ts';
import { tellThisScreen, useLive } from './live.ts';

export function useHideZoom(): boolean {
  return useLive<{ hide: boolean }>('api/nozoom', ['nozoom']).data?.hide === true;
}
export async function setHideZoom(hide: boolean) {
  await post('api/nozoom', { hide });
  tellThisScreen('nozoom');
}
