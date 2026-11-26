/*
===============================================================================
 Family Chalk Planner | Screens | Helpers | swipePages.ts
===============================================================================
 Version:   1.3.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-26
 Updated:   2026-11-26

 Purpose:
     Swiping between pages: from the calendar a swipe to the left goes to
     this screen's first pinned page (Chores when nothing is pinned), the
     next swipe to the left to the next pin, and a swipe to the right back
     again, the last one back to the calendar. It doesn't go round from the
     end. A page opened from the menu keeps still: swipes only work once
     you've swiped off the calendar.

 Used by:
     web/src/board/Board.tsx
     web/src/ui/Shell.tsx
     web/src/pages/Chores.tsx
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.3.0     2026-11-26   joshua    New file (the swipe to Chores, from
                        claude    Board.tsx, now through the pinned pages).
===============================================================================
*/

import { useEffect } from 'react';
import { navigate } from './nav.ts';

const KEY = 'chalkFromBoard'; // where the swiping started (the calendar's address on this screen)
export const swipedFrom = () => {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
};
const remember = (home: string | null) => {
  try {
    if (home) sessionStorage.setItem(KEY, home);
    else sessionStorage.removeItem(KEY);
  } catch {
    /* (private browsing: the menu still goes back) */
  }
};

// the pages a swipe goes through after the calendar
export const pagesAfter = (pins: string[]) => (pins.length ? pins : ['chores']);
// across, not up and down: at least 120 px, and at most half as much up or down
export const isSwipe = (dx: number, dy: number) => Math.abs(dx) > 120 && Math.abs(dy) < Math.abs(dx) / 2;

// the calendar: a swipe to the left goes to the first page
export function swipeOffBoard(home: string, pins: string[]) {
  remember(home);
  navigate(pagesAfter(pins)[0]);
}
// back to the calendar the swiping started from (also 📅 Calendar on a page it opened)
export function backToBoard(fallback = './') {
  const home = swipedFrom();
  remember(null);
  navigate(home || fallback);
}

// a page: swipes go on through the pages, or back
export function useSwipePages(here: string, pins: string[]) {
  const key = pins.join();
  useEffect(() => {
    const order = pagesAfter(key ? key.split(',') : []);
    const i = order.indexOf(here);
    if (i < 0 || !swipedFrom()) return;
    let s: [number, number] | null = null;
    const down = (e: PointerEvent) => {
      s = e.isPrimary ? [e.clientX, e.clientY] : null;
      // words a mouse swipe selected: the next swipe would drag them instead (and never end); not in a field
      if (!(e.target as Element).closest?.('input, textarea, [contenteditable]')) getSelection()?.removeAllRanges();
    };
    const up = (e: PointerEvent) => {
      if (!s) return;
      const dx = e.clientX - s[0];
      const dy = e.clientY - s[1];
      s = null;
      if (!isSwipe(dx, dy)) return;
      if (dx < 0) {
        if (order[i + 1]) navigate(order[i + 1]);
      } else if (i === 0) backToBoard();
      else navigate(order[i - 1]);
    };
    addEventListener('pointerdown', down);
    addEventListener('pointerup', up);
    return () => {
      removeEventListener('pointerdown', down);
      removeEventListener('pointerup', up);
    };
  }, [here, key]);
}
