/*
===============================================================================
 Family Chalk Planner | Screens | Helpers | who.ts
===============================================================================
 Version:   0.13.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Updated:   2026-11-07

 Purpose:
     Who is looking: a paired screen (wall, family, a kid's tablet), a
     signed-in person, or nobody yet.
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
===============================================================================
*/

import { useLive } from './live.ts';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------ //
// | Who is looking | //
// ------------------ //
export interface Who {
  device: { id: string; name: string; role: string } | null;
  user: { username: string; name: string; role: 'editor' | 'admin' } | null;
  editor: boolean;
  admin: boolean;
  rank: number; // 0 nobody, 1 view, 2 family, 3 editor, 4 admin
  passkeys: boolean;
  homeSignin: boolean;
  openView: boolean;
  firstRun?: boolean; // no admin yet: the admin console sets the board up
}
export const RANK = { view: 1, family: 2, editor: 3, admin: 4 };

export function useWho() {
  return useLive<Who>('api/whoami', ['devices']);
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------ //
// | A kid's tablet | //
// ------------------ //
// A kid's tablet: whose                                                     //
export const kidOf = (w: Who | null) => (!w?.user && /^kid:(.+)$/.exec(w?.device?.role || '')?.[1]) || null;

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
