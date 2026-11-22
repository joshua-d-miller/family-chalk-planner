/*
===============================================================================
 Family Chalk Planner | Screens | Helpers | notesCol.ts
===============================================================================
 Version:   1.2.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-21
 Updated:   2026-11-21

 Purpose:
     🗒️ This screen's Notes column, on the month and on the week: whether
     it shows, its pages (up to 3, from the top) and what the bottom's
     little switch can flip to. Each screen (or the person signed in) can
     set its own for each view (kv 'notescol'); a view it hasn't set shows
     the board's (⚙️ Settings → Notes column → Every screen).

 Used by:
     web/src/board/Board.tsx
     web/src/board/Notes.tsx
     web/src/board/editors/NotesEditor.tsx
     web/src/pages/Settings.tsx
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.2.0    2026-11-21   joshua    New file.
                        claude
===============================================================================
*/

import { post } from './api.ts';
import { tellThisScreen, useLive } from './live.ts';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------- //
// | What the column holds | //
// ------------------------- //
export type NotesView = 'month' | 'week';
export type Bottom = { def: string; can: string[] };
export interface Col {
  on: boolean;
  pages: string[];
  bottom?: Bottom;
}
// the board's (every screen's unless it sets its own)
export interface BoardNotes {
  pages: string[];
  week?: string[];
  on?: { month: boolean; week: boolean };
}
export const NOTES_PAGES: [string, string][] = [
  ['info', '🌤️ Weather, trash, countdowns'],
  ['meals', '🍽️ Meal plan'],
  ['jars', '🫙 Reward jars'],
  ['upnext', '📅 Up next'],
  ['today', '☀️ Today'],
  ['reminders', '🔔 Reminders'],
  ['chores', '🧹 Chores'],
  ['timers', '⏲️ Timers'],
  ['pantry', '🥫 Pantry'],
  ['photos', '📷 Photos']
];
export const DEFAULT_PAGES = ['info', 'meals', 'jars'];

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------------------------------- //
// | This screen's, or the board's | //
// ----------------------------------- //
export type MyCols = { month: Col | null; week: Col | null };
export function useMyCols() {
  return useLive<MyCols>('api/notescol', ['notescol']);
}
export const boardCol = (b: BoardNotes | undefined, view: NotesView): Col => ({
  on: b?.on?.[view] ?? true,
  pages: (view === 'week' ? b?.week : null) || b?.pages || DEFAULT_PAGES
});
// what this screen shows on a view: its own (if it set one), else the board's; `own` says which
export function useNotesCol(view: NotesView): Col & { own: boolean; ready: boolean } {
  const board = useLive<{ notes?: BoardNotes }>('api/extras', ['extras']).data;
  const mine = useMyCols().data;
  const own = mine?.[view] || null;
  return { ...(own || boardCol(board?.notes, view)), own: !!own, ready: !!board };
}
export async function setMyCol(view: NotesView, col: Col | null): Promise<MyCols> {
  const r = await post<MyCols>('api/notescol', { view, col });
  tellThisScreen('notescol');
  return r;
}
