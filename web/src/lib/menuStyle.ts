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
     drawer out from that side. Each screen picks its own (kept on this
     device), from the bottom of the ☰ menu.

 Used by:
     web/src/ui/Shell.tsx
     web/src/ui/Menu.tsx
     web/src/board/Board.tsx
     web/src/board/Strip.tsx

 Known limitations:
     Kept in this browser's storage: clearing the browser (or private
     browsing) puts the screen back on the cork.
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

import { useSyncExternalStore } from 'react';

// 'cork': the bar along the bottom; 'right' / 'left': the ☰ button in that corner, and its drawer
export type MenuStyle = 'cork' | 'right' | 'left';
export const MENU_STYLES: [MenuStyle, string][] = [
  ['cork', 'Cork along the bottom'],
  ['right', 'Button, drawer on the right'],
  ['left', 'Button, drawer on the left']
];
const KEY = 'chalkMenuStyle';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------ //
// | This screen's choice | //
// ------------------------ //
// Read from this device; anything unknown (or no storage) is the cork.      //
export function menuStyle(): MenuStyle {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'right' || v === 'left' ? v : 'cork';
  } catch {
    return 'cork';
  }
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------------- //
// | Changing it, live | //
// ---------------------- //
// Every part of the screen that cares changes at once: no reload. Another   //
// tab of the same browser follows along too (the storage event).           //
const listeners = new Set<() => void>();
export function setMenuStyle(s: MenuStyle) {
  try {
    if (s === 'cork') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, s);
  } catch {
    /* (private browsing): stays the cork */
  }
  listeners.forEach(f => f());
}
function subscribe(f: () => void) {
  listeners.add(f);
  const onStorage = (e: StorageEvent) => e.key === KEY && f();
  addEventListener('storage', onStorage);
  return () => {
    listeners.delete(f);
    removeEventListener('storage', onStorage);
  };
}
export function useMenuStyle(): MenuStyle {
  return useSyncExternalStore(subscribe, menuStyle);
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
