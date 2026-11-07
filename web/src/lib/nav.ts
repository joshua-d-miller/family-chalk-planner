/*
===============================================================================
 Family Chalk Planner | Screens | Helpers | nav.ts
===============================================================================
 Version:   0.14.0
 Author:    Joshua D. Miller, Claude
 Updated:   2026-11-07

 Purpose:
     Moving between the pages without loading a new one: the address
     changes (so back, forward and a reload all work), the bar at the
     bottom stays, and only the page in the middle changes.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.14.0    2026-11-07   joshua    New file.
                        claude
===============================================================================
*/

import { useSyncExternalStore } from 'react';

// the pages this app draws; anything else (the admin console, /classic) is a real page load
export const APP_IDS = new Set([
  'board',
  'edit',
  'chores',
  'meals',
  'reminders',
  'timers',
  'pantry',
  'jars',
  'settings'
]);

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------------------- //
// | Which page an address is | //
// ---------------------------- //
// Relative to the board's <base>: '' is the board.                          //
export function pageOf(u: URL | Location = location): string {
  const base = new URL(document.baseURI).pathname;
  let p = u.pathname.startsWith(base) ? u.pathname.slice(base.length) : u.pathname.replace(/^\//, '');
  p = p.replace(/\/+$/, '');
  return p || 'board';
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------- //
// | Going somewhere | //
// ------------------- //
// One of this app's pages: in place. Anything else: a normal page load.     //
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(f => f());
export function navigate(to: string, opts: { replace?: boolean } = {}) {
  const u = new URL(to, document.baseURI);
  if (u.origin !== location.origin || !APP_IDS.has(pageOf(u))) {
    if (opts.replace) location.replace(u.href);
    else location.assign(u.href);
    return;
  }
  if (u.href === location.href) return;
  const samePage = pageOf(u) === pageOf();
  history[opts.replace ? 'replaceState' : 'pushState'](null, '', u.href);
  if (!samePage) scrollTo(0, 0);
  emit();
  if (u.hash) requestAnimationFrame(() => document.getElementById(u.hash.slice(1))?.scrollIntoView());
}

// links to this app's pages go in place too (the menu, the bar, links inside pages)
let started = false;
function start() {
  if (started) return;
  started = true;
  addEventListener('popstate', emit);
  document.addEventListener('click', e => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!a || a.target || a.hasAttribute('download')) return;
    const u = new URL(a.href, document.baseURI);
    if (u.origin !== location.origin || !APP_IDS.has(pageOf(u))) return;
    e.preventDefault();
    navigate(u.href);
  });
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------ //
// | The page shown | //
// ------------------ //
// Changes when the address does (navigate, back, forward).                  //
export function useHere() {
  start();
  return useSyncExternalStore(
    f => (listeners.add(f), () => listeners.delete(f)),
    () => pageOf()
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
