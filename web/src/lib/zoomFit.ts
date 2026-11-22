/*
===============================================================================
 Family Chalk Planner | Screens | Helpers | zoomFit.ts
===============================================================================
 Version:   1.2.5
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-22
 Updated:   2026-11-22

 Purpose:
     How the board is sized to the screen. The board keeps one layout
     (1252 board pixels across, so art drawn on a day is on that day on
     every screen), and is drawn at the screen's own resolution:

     - CSS zoom, in Chromium (Chrome, Edge, Android's browser and
       WebView, the Apolosign) and Firefox, when a zoomed box measures
       the standard way (checked on the screen itself): the board is laid out at its real
       size on the screen, so its lines and boxes land on the screen's own
       pixels, and nothing is a stretched layer the browser draws in tiles.
       (A stretch by a fraction, 1.53 on a 1080p screen, could leave seams
       and smears at the edges of boxes as parts of it were drawn again.)
     - A CSS transform everywhere else (Safari and the iPad, older
       browsers), as before.

 Used by:
     web/src/board/Board.tsx
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.2.1    2026-11-22   joshua    New file.
                        claude

 1.2.5    2026-11-22   joshua    Drawing tests: stretched as before, if this
                        claude    screen asks.
===============================================================================
*/

import { drawTests } from './drawTests.ts';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------------------------------- //
// | Can this browser zoom the board? | //
// ----------------------------------- //
// Only Chromium or Firefox (WebKit's zoom measures things differently, and //
// every browser on an iPad is WebKit), and only if a zoomed box measures   //
// the way the board's taps and drawing expect.                            //
function zoomWorks(): boolean {
  try {
    if (typeof document === 'undefined' || !CSS.supports('zoom', '2')) return false;
    const ua = navigator.userAgent;
    const ios = /\b(iPad|iPhone|iPod)\b/.test(ua) || (/\bMacintosh\b/.test(ua) && navigator.maxTouchPoints > 1);
    if (ios || !/Chrom(e|ium)\/|\bFirefox\//.test(ua)) return false; // (Safari: its own older zoom)
    // a 10 x 10 box zoomed 2x, with a child 5px in: on screen 20 wide, the child 10 in, and 5 to itself
    const outer = document.createElement('div');
    outer.style.cssText = 'position:absolute;left:0;top:0;width:10px;height:10px;zoom:2;visibility:hidden';
    const inner = document.createElement('div');
    inner.style.cssText = 'position:absolute;left:5px;top:0;width:1px;height:1px';
    outer.appendChild(inner);
    document.body.appendChild(outer);
    const o = outer.getBoundingClientRect();
    const i = inner.getBoundingClientRect();
    const ok = Math.abs(o.width - 20) < 0.5 && Math.abs(i.left - o.left - 10) < 0.5 && inner.offsetLeft === 5;
    outer.remove();
    return ok;
  } catch {
    return false;
  }
}
let known: boolean | null = null;
export function canZoomBoard(): boolean {
  if (drawTests().stretch) return false; // (⚙️ Settings → This screen → Drawing tests: stretched, as before)
  if (known === null) known = zoomWorks();
  return known;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------------- //
// | The board's style | //
// -------------------- //
// fit: the board's scale to fill the screen; z, x, y: zoomed in to draw    //
// (z times, moved x, y screen pixels from the middle)                      //
export function boardScaleStyle(fit: number, z: number, x: number, y: number): Record<string, string | number> {
  if (!canZoomBoard()) return { transform: `translate(${x}px, ${y}px) scale(${fit * z})` };
  // (a transform inside a zoomed box is zoomed too: moved in board pixels)
  const moved = z !== 1 || x || y;
  return moved ? { zoom: fit, transform: `translate(${x / fit}px, ${y / fit}px) scale(${z})` } : { zoom: fit };
}
