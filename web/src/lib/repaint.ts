/*
===============================================================================
 Family Chalk Planner | Screens | Helpers | repaint.ts
===============================================================================
 Version:   1.2.5
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-22
 Updated:   2026-11-22

 Purpose:
     The board drawn again from scratch now and then, when nobody's
     looking. A screen that's been up for hours can keep a few stray
     pixels from an earlier paint (tiny blue or green dots at the edges of
     art) until the page is reloaded; this does what a reload does for
     them, without the reload: a fresh board, so the browser draws all of
     it again.

     - A few seconds into the slideshow (it covers the whole screen by
       then), so the board is fresh when the photos go away.
     - Otherwise once an hour, if nobody has touched the screen for 10
       minutes and nothing is open (no card, no drawing, not zoomed in).

 Used by:
     web/src/board/Board.tsx

 Known limitations:
     It works around the screen's own drawing, it doesn't fix it: a dot
     can show up again until the next fresh board.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.2.5    2026-11-22   joshua    New file. Stray dots at the edges of art on
                        claude    a screen that's been up a while, gone
                                  without reloading.
===============================================================================
*/

import { useEffect, useRef, useState } from 'react';

const UNDER_SLIDES = 5000; // the slideshow fades in over 2.5s: by then it covers the board
const EVERY = 60 * 60 * 1000;
const UNTOUCHED = 10 * 60 * 1000;

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------------- //
// | A fresh board, when | //
// ---------------------- //
// A number that goes up each time the board should be drawn afresh: the   //
// board uses it as its key. quiet: nothing open on it right now.          //
export function useRepaint(quiet: boolean, slidesOn: boolean): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!slidesOn) return;
    const t = setTimeout(() => setN(k => k + 1), UNDER_SLIDES);
    return () => clearTimeout(t);
  }, [slidesOn]);
  const touched = useRef(Date.now());
  const ok = useRef(quiet && !slidesOn);
  ok.current = quiet && !slidesOn;
  useEffect(() => {
    const on = () => (touched.current = Date.now());
    addEventListener('pointerdown', on, true);
    addEventListener('keydown', on, true);
    const t = setInterval(() => {
      if (ok.current && !document.hidden && Date.now() - touched.current > UNTOUCHED) setN(k => k + 1);
    }, EVERY);
    return () => {
      removeEventListener('pointerdown', on, true);
      removeEventListener('keydown', on, true);
      clearInterval(t);
    };
  }, []);
  return n;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
