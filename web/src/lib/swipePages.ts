/*
===============================================================================
 Family Chalk Planner | Screens | Helpers | swipePages.ts
===============================================================================
 Version:   1.3.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-26
 Updated:   2026-11-28

 Purpose:
     Swiping between pages: from the calendar a swipe to the left goes to
     this screen's first pinned page (Chores when nothing is pinned), the
     next swipe to the left to the next pin, and a swipe to the right back
     again, the last one back to the calendar. It doesn't go round from the
     end. A page opened from the menu keeps still: swipes only work once
     you've swiped off the calendar. A page swiped to goes back to the
     calendar after 2 quiet minutes.

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
                        claude    Board.tsx, now through the pinned pages);
                                  2 quiet minutes back; the dots coming back.
                                  The quiet minutes set for each screen.
===============================================================================
*/

import { useEffect } from 'react';
import { post } from './api.ts';
import { tellThisScreen, useLive } from './live.ts';
import { navigate } from './nav.ts';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------------- //
// | Where a swipe goes | //
// ---------------------- //
// From the calendar through the pinned pages, one at a time, and back;      //
// never round. A page opened from the menu doesn't swipe.                   //
export const BACK_AFTER = [0, 1, 2, 5, 10]; // the quiet minutes a screen can pick (0: the page stays)
const DOTS = 'chalkDots';
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
// (not 🗓️ Week: that's the calendar itself, with its own swipe and drawing)
export const pagesAfter = (pins: string[]) => {
  const pages = pins.filter(p => p !== 'week');
  return pages.length ? pages : ['chores'];
};
// across, not up and down: at least 120 px, and at most half as much up or down
export const isSwipe = (dx: number, dy: number) => Math.abs(dx) > 120 && Math.abs(dy) < Math.abs(dx) / 2;

// the calendar: a swipe to the left goes to the first page
export function swipeOffBoard(home: string, pins: string[]) {
  remember(home);
  navigate(pagesAfter(pins)[0]);
}
// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------ //
// | Back to the calendar | //
// ------------------------ //
// After a swipe back, or 2 quiet minutes on a page; the calendar then shows //
// its chalk dots once.                                                      //
// back to the calendar the swiping started from (also 📅 Calendar on a page it opened); dots: how many the
// calendar shows as it comes back (after a swipe, not after the 2 quiet minutes)
export function backToBoard(dots = 0) {
  const home = swipedFrom();
  remember(null);
  try {
    if (dots) sessionStorage.setItem(DOTS, String(dots));
  } catch {
    /* (no dots, then) */
  }
  navigate(home || './');
}
// the calendar, swiped back to: how many dots to show (once)
export function backDots() {
  try {
    const n = Number(sessionStorage.getItem(DOTS) || 0);
    sessionStorage.removeItem(DOTS);
    return n;
  } catch {
    return 0;
  }
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------- //
// | On a page | //
// ------------- //
// A page swiped to listens for the next swipe, and goes back to the        //
// calendar after the quiet minutes this screen picked (2 unless it did).   //
export function useBackAfter(): number {
  return useLive<{ mine: number | null }>('api/backafter', ['backafter']).data?.mine ?? 2;
}
export async function setBackAfter(value: number | null) {
  await post('api/backafter', { value });
  tellThisScreen('backafter');
}
// a page: swipes go on through the pages, or back
export function useSwipePages(here: string, pins: string[]) {
  const key = pins.join();
  const mins = useBackAfter();
  useEffect(() => {
    const order = pagesAfter(key ? key.split(',') : []);
    const i = order.indexOf(here);
    if (i < 0 || !swipedFrom()) return;
    let s: [number, number] | null = null;
    // quiet a while: back to the calendar by itself (a shared screen isn't left on a page)
    const wait = () => (mins ? setTimeout(() => backToBoard(), mins * 60e3) : undefined);
    let idle = wait();
    const down = (e: PointerEvent) => {
      clearTimeout(idle);
      idle = wait();
      // a drag in a field, on a slider or in an open card is that, not a swipe
      const busy = (e.target as Element).closest?.(
        'input, textarea, select, [contenteditable], [role="slider"], [role="dialog"]'
      );
      s = e.isPrimary && !busy ? [e.clientX, e.clientY] : null;
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
      } else if (i === 0) backToBoard(order.length + 1);
      else navigate(order[i - 1]);
    };
    addEventListener('pointerdown', down);
    addEventListener('pointerup', up);
    return () => {
      clearTimeout(idle);
      removeEventListener('pointerdown', down);
      removeEventListener('pointerup', up);
    };
  }, [here, key, mins]);
}
