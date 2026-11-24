/*
===============================================================================
 Family Chalk Planner | Screens | Helpers | menuStyle.ts
===============================================================================
 Version:   1.2.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-12
 Updated:   2026-11-21

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

 1.2.0    2026-11-21   joshua    The menu in the Notes column: the ☰ and up
                        colby     to 3 buttons this screen picks (Colby Way's
                        claude    dock).
===============================================================================
*/

import { post } from './api.ts';
import { tellThisScreen, useLive } from './live.ts';

// 'cork': the bar along the bottom; 'right' / 'left': the ☰ button in that corner, and its drawer;
// 'notes': the ☰ and up to 3 buttons in the Notes column's last row (from Colby Way's board)
export type MenuStyle = 'cork' | 'right' | 'left' | 'notes';
export const MENU_STYLES: [MenuStyle, string][] = [
  ['cork', 'Cork along the bottom'],
  ['right', 'Button, drawer on the right'],
  ['left', 'Button, drawer on the left'],
  ['notes', 'Buttons in the Notes column']
];
// what can go beside the ☰ in the Notes column
export type DockBtn =
  | 'add' | 'slides' | 'week' | 'draw' | 'today' | 'chores' | 'meals' | 'reminders' | 'timers' | 'pantry'
  | 'jars' | 'settings' | 'fullscreen' | 'reload';
export const DOCK_BTNS: [DockBtn, string, string][] = [
  ['add', '＋', 'Add event'],
  ['slides', '▶️', 'Slideshow'],
  ['week', '🗓️', 'Week / month'],
  ['draw', '✏️', 'Decorate'],
  ['today', '📍', 'Back to today'],
  ['chores', '🧹', 'Chores'],
  ['meals', '🍽️', 'Meal plan'],
  ['reminders', '🔔', 'Reminders'],
  ['timers', '⏲️', 'Timers'],
  ['pantry', '🥫', 'Pantry'],
  ['jars', '🫙', 'Reward jars'],
  ['settings', '⚙️', 'Settings'],
  ['fullscreen', '⛶', 'Full screen'],
  ['reload', '↻', 'Reload']
];
export const DOCK_MAX = 3; // in the Notes column
export const QUICK_MAX = 6; // beside the ☰ in a corner (a row of up to 4, or two rows of 3)
export interface MenuPref {
  style: MenuStyle;
  draw: boolean; // (kept for older boards) quick includes 'draw'
  dock: DockBtn[]; // 'notes': the buttons beside the ☰
  quick: DockBtn[]; // 'right' / 'left': the quick buttons beside the ☰
}
const HINT = 'chalkMenuStyle'; // the browser's copy (only for opening the screen without a flash)
const DOCK_DEFAULT: DockBtn[] = ['add', 'slides', 'week'];
const CORK: MenuPref = { style: 'cork', draw: false, dock: DOCK_DEFAULT, quick: [] };
const known = (v: unknown, max: number) =>
  (v as unknown[]).filter(d => DOCK_BTNS.some(([b]) => b === d)).slice(0, max) as DockBtn[];
const clean = (v: unknown): MenuPref => {
  const o = (v || {}) as { style?: unknown; draw?: unknown; dock?: unknown; quick?: unknown };
  const style = o.style === 'right' || o.style === 'left' || o.style === 'notes' ? o.style : 'cork';
  const dock = Array.isArray(o.dock) ? known(o.dock, DOCK_MAX) : DOCK_DEFAULT;
  const corner = style === 'right' || style === 'left';
  const quick = Array.isArray(o.quick) ? known(o.quick, QUICK_MAX) : o.draw === true ? (['draw'] as DockBtn[]) : [];
  return { style, draw: corner && quick.includes('draw'), dock, quick: corner ? quick : [] };
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
  const live = useLive<{ style: string; draw: boolean; dock: string[]; quick?: string[]; saved: boolean }>('api/menustyle', [
    'menustyle'
  ]);
  if (!live.data) return hint();
  const p = clean(live.data);
  const h = hint();
  if (p.style !== h.style || p.draw !== h.draw || p.dock.join() !== h.dock.join() || p.quick.join() !== h.quick.join())
    keepHint(p);
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
  const now = await post<{ style: string; draw: boolean; dock: string[]; quick?: string[] }>('api/menustyle', change);
  keepHint(clean(now));
  tellThisScreen('menustyle'); // (the board tells the other screens)
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
