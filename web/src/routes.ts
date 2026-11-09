/*
===============================================================================
 Family Chalk Planner | Screens | routes.ts
===============================================================================
 Version:   0.15.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Updated:   2026-11-08

 Purpose:
     Every page, for the router and the ☰ menu. `href` is relative to the
     board's address.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    The new screens (React + TypeScript): meal
                        colby     plan, reminders, timers, pantry, jars and
                        claude    chores.

                                  The new screens take over: /, /edit and
                                  /chores are the React board; the old one
                                  stays at /classic.

 0.14.0    2026-11-07   joshua    Where 📅 Calendar goes on each screen.
                        claude

 0.15.0    2026-11-08   joshua    🗓️ Week, a page you can pin.
                        claude
===============================================================================
*/

import { RANK, kidOf } from './lib/who.ts';
import type { Who } from './lib/who.ts';
import { pageOf } from './lib/nav.ts';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------- //
// | Every page | //
// -------------- //
// For the router and the ☰ menu: its title, icon, address (relative to the  //
// board's address), who may open it, and its group in the menu.             //
export interface PageDef {
  id: string;
  title: string;
  icon: string;
  href: string;
  need: number; // who may open it (RANK)
  group: 'pages' | 'board' | 'account';
}
export const PAGES: PageDef[] = [
  { id: 'board', title: 'The board', icon: '🗓️', href: './', need: RANK.view, group: 'board' },
  { id: 'edit', title: 'Edit the board', icon: '✏️', href: 'edit', need: RANK.family, group: 'board' },
  { id: 'week', title: 'Week', icon: '🗓️', href: 'week', need: RANK.view, group: 'pages' },
  { id: 'chores', title: 'Chores', icon: '🧹', href: 'chores', need: RANK.view, group: 'pages' },
  { id: 'meals', title: 'Meal plan', icon: '🍽️', href: 'meals', need: RANK.view, group: 'pages' },
  { id: 'reminders', title: 'Reminders', icon: '🔔', href: 'reminders', need: RANK.view, group: 'pages' },
  { id: 'timers', title: 'Timers', icon: '⏲️', href: 'timers', need: RANK.view, group: 'pages' },
  { id: 'pantry', title: 'Pantry', icon: '🥫', href: 'pantry', need: RANK.view, group: 'pages' },
  { id: 'jars', title: 'Reward jars', icon: '🫙', href: 'jars', need: RANK.view, group: 'pages' },
  { id: 'settings', title: 'Settings', icon: '⚙️', href: 'settings', need: RANK.editor, group: 'account' },
  { id: 'admin', title: 'Admin console', icon: '🛡️', href: 'admin', need: RANK.admin, group: 'account' }
];

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------- //
// | The Calendar tab | //
// ------------------- //
// Where Calendar goes on this screen: the board it may change, the board it //
// shows, or (a kid's tablet) their own chores.                              //
export function homeHref(who: Who | null) {
  if (kidOf(who)) return 'chores';
  return (who?.rank || 0) >= RANK.family ? 'edit' : './';
}
export const isHome = (here: string, who: Who | null) =>
  kidOf(who) ? here === 'chores' : here === 'board' || here === 'edit';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------------ //
// | Which page this address is | //
// ------------------------------ //
// Which page this address is (relative to the board's <base>)               //
export const pageHere = (): string => pageOf();

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
