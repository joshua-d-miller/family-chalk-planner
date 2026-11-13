/*
===============================================================================
 Family Chalk Planner | Screens | Helpers | menuStyle.ts
===============================================================================
 Version:   0.17.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-12
 Updated:   2026-11-12

 Purpose:
     How this screen gets to its pages and tools: the cork along the bottom
     (as before), or a round ☰ button in a bottom corner that slides a
     drawer out from that side. Each screen picks its own from the bottom
     of the ☰ menu; it's kept on the board (kv 'menustyle', per screen, or
     per person on a computer), so clearing the browser doesn't lose it.

 Used by:
     web/src/ui/Shell.tsx
     web/src/ui/Menu.tsx

 Known limitations:
     A copy is kept in the browser too, only so the screen opens with the
     right menu instead of flashing the cork first; the board's answer
     always wins.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.17.0    2026-11-12   joshua    New file. Colby's idea: a button in the
                        colby     corner instead of the cork.
                        claude
===============================================================================
*/

import { post } from './api.ts';
import { tellThisScreen, useLive } from './live.ts';

// 'cork': the bar along the bottom; 'right' / 'left': the ☰ button in that corner, and its drawer
export type MenuStyle = 'cork' | 'right' | 'left';
export const MENU_STYLES: [MenuStyle, string][] = [
  ['cork', 'Cork along the bottom'],
  ['right', 'Button, drawer on the right'],
  ['left', 'Button, drawer on the left']
];
const HINT = 'chalkMenuStyle'; // the browser's copy (only for opening the screen without a flash)
const clean = (v: unknown): MenuStyle => (v === 'right' || v === 'left' ? v : 'cork');

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------ //
// | The browser's copy | //
// ------------------------ //
function hint(): MenuStyle {
  try {
    return clean(localStorage.getItem(HINT));
  } catch {
    return 'cork';
  }
}
function keepHint(s: MenuStyle) {
  try {
    if (s === 'cork') localStorage.removeItem(HINT);
    else localStorage.setItem(HINT, s);
  } catch {
    /* (private browsing): the board still has it */
  }
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------ //
// | This screen's choice | //
// ------------------------ //
// The board's answer once it's here (and when it changes: the admin, or    //
// this screen, saving it); until then the browser's copy.                  //
export function useMenuStyle(): MenuStyle {
  const live = useLive<{ style: string; saved: boolean }>('api/menustyle', ['menustyle']);
  if (!live.data) return hint();
  const s = clean(live.data.style);
  if (s !== hint()) keepHint(s);
  return s;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------- //
// | Changing it | //
// ------------------- //
// Saved on the board; everything on this screen that shows it changes at  //
// once (other screens signed in as the same person follow too).           //
export async function setMenuStyle(s: MenuStyle) {
  await post('api/menustyle', { style: s });
  keepHint(s);
  tellThisScreen('menustyle'); // (the board tells the other screens)
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
