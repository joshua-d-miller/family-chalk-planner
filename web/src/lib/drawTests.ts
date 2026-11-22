/*
===============================================================================
 Family Chalk Planner | Screens | Helpers | drawTests.ts
===============================================================================
 Version:   1.2.5
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-22
 Updated:   2026-11-22

 Purpose:
     Drawing tests, for a screen that shows stray dots or seams the board
     doesn't draw (⚙️ Settings → This screen → Drawing tests). Each one
     changes one thing about how the board is drawn on this screen, so
     trying them one at a time shows which part of the drawing the dots
     come from; and the screen's own details (its browser, its graphics,
     its size and the board's scale) to go with what's seen.

     - still: pictures stay on their still frame (no GIF playing now and
       then, and so no picture swapped for its moving one and back).
     - layer: the art on a layer of its own, drawn apart from the
       calendar's lines under it.
     - plain: the chalk colors in art drawn flat, without the chalk grain.

 Used by:
     web/src/board/Art.tsx
     web/src/pages/Settings.tsx

 Known limitations:
     Kept in this browser only (they're for trying things out), and a
     change reloads the board.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.2.5    2026-11-22   joshua    New file. Finding where the stray dots on
                        claude    the Apolosign come from.
===============================================================================
*/

export interface DrawTests {
  still?: boolean;
  layer?: boolean;
  plain?: boolean;
}
const KEY = 'chalkDrawTests';

let mine: DrawTests | null = null;
export function drawTests(): DrawTests {
  if (mine) return mine;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}') as DrawTests;
    mine = v && typeof v === 'object' ? v : {};
  } catch {
    mine = {};
  }
  return mine;
}
// a change: kept, and the board drawn again from the start with it
export function setDrawTests(change: DrawTests) {
  const next = { ...drawTests(), ...change };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* (a private window: just this time) */
  }
  mine = next;
  location.reload();
}
// the art on its own layer: a class on <html> (board.css)
export function applyDrawTests() {
  document.documentElement.classList.toggle('dt-layer', !!drawTests().layer);
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------ //
// | This screen's details | //
// ------------------------ //
// What the browser says about itself and its graphics, and how big the    //
// board is drawn: to go with what's seen on the screen.                   //
export function screenDetails(): [string, string][] {
  const ua = navigator.userAgent;
  const chrome = ua.match(/Chrome\/([\d.]+)/)?.[1];
  const android = ua.match(/Android ([\d.]+)/)?.[1];
  let gpu = 'unknown';
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    if (gl && ext) gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
    else if (gl) gpu = String(gl.getParameter(gl.RENDERER));
    else gpu = 'no WebGL';
  } catch {
    /* unknown */
  }
  const slate = document.getElementById('slate')?.getBoundingClientRect();
  const scale = slate && slate.width ? (slate.width / 1252).toFixed(3) : '?';
  return [
    ['Browser', chrome ? `Chrome ${chrome}${/; wv\)/.test(ua) ? ' (WebView)' : ''}` : ua],
    ['Android', android || '—'],
    ['Graphics', gpu],
    [
      'Screen',
      `${screen.width}×${screen.height}, window ${innerWidth}×${innerHeight}, pixel ratio ${devicePixelRatio}`
    ],
    ['Board scale', scale + '×']
  ];
}
