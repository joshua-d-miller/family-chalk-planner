/*
===============================================================================
 Family Chalk Planner | Screens | Helpers | uiLook.ts
===============================================================================
 Version:   1.1.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-17
 Updated:   2026-11-17

 Purpose:
     The look of this screen's cards (popups), ☰ menu and Settings: chalk
     (as before), light, dark or high contrast, an accent color for
     headings and what's picked, and a larger text size. The calendar
     itself keeps its own style (🎨). Each screen picks its own; it's kept
     on the board (kv 'uilook', per screen, or per person on a computer),
     so clearing the browser doesn't lose it.

 Used by:
     web/src/ui/Shell.tsx (puts it on the page)
     web/src/ui/LookCard.tsx (changes it)

 Known limitations:
     A copy is kept in the browser too, only so the screen opens with the
     right look instead of flashing chalk first; the board's answer always
     wins.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.1.0    2026-11-17   joshua    New file.
                        claude
===============================================================================
*/

import { post } from './api.ts';
import { tellThisScreen, useLive } from './live.ts';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------------------- //
// | The looks and sizes | //
// ----------------------- //
export type Look = 'chalk' | 'light' | 'dark' | 'contrast';
export type UiSize = 'normal' | 'large' | 'larger';
export const LOOKS: [Look, string][] = [
  ['chalk', 'Chalk'],
  ['light', 'Light'],
  ['dark', 'Dark'],
  ['contrast', 'High contrast']
];
export const SIZES: [UiSize, string][] = [
  ['normal', 'Normal'],
  ['large', 'Large'],
  ['larger', 'Larger']
];
export interface UiLook {
  look: Look;
  accent: string | null; // headings and what's picked; null = the look's own
  size: UiSize;
}
const HINT = 'chalkUiLook'; // the browser's copy (only for opening the screen without a flash)
const CHALK: UiLook = { look: 'chalk', accent: null, size: 'normal' };
const clean = (v: unknown): UiLook => {
  const o = (v || {}) as Partial<Record<keyof UiLook, unknown>>;
  return {
    look: LOOKS.some(([k]) => k === o.look) ? (o.look as Look) : 'chalk',
    accent: typeof o.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(o.accent) ? o.accent : null,
    size: SIZES.some(([k]) => k === o.size) ? (o.size as UiSize) : 'normal'
  };
};
const same = (a: UiLook, b: UiLook) => a.look === b.look && a.accent === b.accent && a.size === b.size;

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------------- //
// | The browser's copy | //
// ---------------------- //
function hint(): UiLook {
  try {
    return clean(JSON.parse(localStorage.getItem(HINT) || 'null'));
  } catch {
    return CHALK;
  }
}
function keepHint(p: UiLook) {
  try {
    if (same(p, CHALK)) localStorage.removeItem(HINT);
    else localStorage.setItem(HINT, JSON.stringify(p));
  } catch {
    /* (private browsing): the board still has it */
  }
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------ //
// | This screen's choice | //
// ------------------------ //
// The board's answer once it's here (and when it changes); until then the   //
// browser's copy.                                                           //
export function useUiLook(): UiLook {
  const live = useLive<UiLook & { saved: boolean }>('api/uilook', ['uilook']);
  if (!live.data) return hint();
  const p = clean(live.data);
  if (!same(p, hint())) keepHint(p);
  return p;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------------------- //
// | Putting it on the page | //
// -------------------------- //
// data-look and data-uisize on <html>, and the accent as --accent: the      //
// styles in looks.css do the rest.                                          //
export function applyUiLook(p: UiLook) {
  const html = document.documentElement;
  if (p.look === 'chalk') delete html.dataset.look;
  else html.dataset.look = p.look;
  if (p.size === 'normal') delete html.dataset.uisize;
  else html.dataset.uisize = p.size;
  if (p.accent) html.style.setProperty('--accent', p.accent);
  else html.style.removeProperty('--accent');
  html.classList.toggle('has-accent', !!p.accent);
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------------- //
// | Changing it | //
// --------------- //
// Saved on the board; this screen changes at once (and the board tells      //
// the other screens, so a person's computers follow too).                   //
export async function setUiLook(change: Partial<UiLook>) {
  const now = clean(await post<UiLook>('api/uilook', change));
  keepHint(now);
  applyUiLook(now);
  tellThisScreen('uilook');
  return now;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
