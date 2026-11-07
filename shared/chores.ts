/*
===============================================================================
 Family Chalk Planner | Shared types | chores.ts
===============================================================================
 Version:   0.13.0
 Author:    Joshua D. Miller, Claude
 Updated:   2026-11-06

 Purpose:
     Chores as the server stores them and the screens show them. Shared by
     both, so a change on one side that the other doesn't expect fails the
     build instead of the wall.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-06   joshua    TypeScript groundwork: type-check, lint and
                        claude    format in CI; chores is the first TypeScript
                                  module.
===============================================================================
*/

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------ //
// | The list | //
// ------------ //
export type Every = 'day' | 'week' | 'month';

export interface Person {
  id: string;
  name: string;
  kid?: boolean;
}

export interface Chore {
  id: string;
  title: string;
  who: string[]; // person ids
  every: Every;
  times: number; // how many times per day / week / month (1-7)
  each?: boolean; // with several people: everyone does their own
}

export interface ChoreList {
  people: Person[];
  chores: Chore[];
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------------- //
// | This period | //
// --------------- //
// The current day / week / month, as keys: '2026-10-28', the date the week  //
// starts, '2026-10'                                                         //
export type Periods = Record<Every, string>;

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------ //
// | What the screens get | //
// ------------------------ //
// What GET /api/chores sends: each chore with how far along it is this      //
// period                                                                    //
export type ChoreProgress = Chore & ({ done: number; by: string | null } | { doneEach: Record<string, number> });

export interface ChoresView {
  people: Person[];
  periods: Periods;
  chores: ChoreProgress[];
  mine: string | null; // on a kid's tablet: whose it is
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
