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
     drawer out from that side, with or without a ✏️ Draw button beside
     it. Each screen picks its own from the bottom of the ☰ menu; it's kept
     on the board (kv 'menustyle', per screen, or per person on a
     computer), so clearing the browser doesn't lose it.

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
export interface MenuPref {
  style: MenuStyle;
  draw: boolean; // a ✏️ Draw button beside the ☰ (the ☰ button only)
}
const HINT = 'chalkMenuStyle'; // the browser's copy (only for opening the screen without a flash)
const CORK: MenuPref = { style: 'cork', draw: false };
const clean = (v: unknown): MenuPref => {
  const o = (v || {}) as { style?: unknown; draw?: unknown };
  const style = o.style === 'right' || o.style === 'left' ? o.style : 'cork';
  return { style, draw: style !== 'cork' && o.draw === true };
};

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------ //
// | The browser's copy | //
// ------------------------ //
function hint(): MenuPref {
  try {
    return clean(JSON.parse(localStorage.getItem(HINT) || 'null'));
  } catch {
    return CORK;
  }
}
function keepHint(p: MenuPref) {
  try {
    if (p.style === 'cork') localStorage.removeItem(HINT);
    else localStorage.setItem(HINT, JSON.stringify(p));
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
export function useMenuPref(): MenuPref {
  const live = useLive<{ style: string; draw: boolean; saved: boolean }>('api/menustyle', ['menustyle']);
  if (!live.data) return hint();
  const p = clean(live.data);
  const h = hint();
  if (p.style !== h.style || p.draw !== h.draw) keepHint(p);
  return p;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------------- //
// | Changing it | //
// --------------- //
// Saved on the board (either half on its own); everything on this screen  //
// that shows it changes at once (other screens signed in as the same      //
// person follow too).                                                     //
export async function setMenuPref(change: Partial<MenuPref>) {
  const now = await post<{ style: string; draw: boolean }>('api/menustyle', change);
  keepHint(clean(now));
  tellThisScreen('menustyle'); // (the board tells the other screens)
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
