/*
===============================================================================
 Family Chalk Planner | Shared types | lists.ts
===============================================================================
 Version:   0.13.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Updated:   2026-11-07

 Purpose:
     The household lists, as the server stores them and the screens show
     them: meals, reward jars, reminders, timers and the pantry. Shared by
     both, so a change on one side that the other doesn't expect fails the
     build instead of the wall.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    Database migrations; chores, meals and jars
                        colby     in their own tables.
                        claude
===============================================================================
*/

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------- //
// | Meal plan | //
// ------------- //
// Meal plan: each meal on a day of the week, or on none ('')                //
export type MealDay = '' | 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';
export interface Meal {
  id: string;
  t: string; // what's for dinner
  day: MealDay;
  done: boolean;
}
export interface Meals {
  items: Meal[];
  updated?: number;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------------- //
// | Reward jars | //
// --------------- //
export type JarPiece = 'heart' | 'rainbow' | 'star' | 'bolt' | 'critter';
export interface Jar {
  id: string;
  name: string;
  pieces: JarPiece[]; // what goes in, in turn
  count: number;
  items: JarPiece[]; // what's in it, in order
  goal: number;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------- //
// | Reminders | //
// ------------- //
// 'always': shown until ticked off. 'time': pops up at a time, every day or //
// once.                                                                     //
export interface Reminder {
  id: string;
  title: string;
  mode: 'always' | 'time';
  time: string; // HH:MM
  repeat: 'daily' | 'once';
  important: boolean;
  done: boolean;
  ackDate: string | null; // the day it was last seen to / ticked off
}
export interface RemindersView {
  items: Reminder[];
  today: string;
  nowHm: string;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------- //
// | Timers | //
// ---------- //
// Shared by every screen: running (endsAt), paused (left) or done (doneAt)  //
export interface Timer {
  id: string;
  name: string;
  duration: number; // ms
  state: 'running' | 'paused' | 'done';
  endsAt?: number;
  left?: number;
  doneAt?: number;
}
export interface TimersView {
  items: Timer[];
  now: number; // the server's clock, so screens can correct theirs
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------- //
// | Pantry | //
// ---------- //
export type PantryLoc = 'pantry' | 'fridge' | 'freezer' | 'basement' | 'other';
export interface PantryItem {
  id: string;
  name: string;
  loc: PantryLoc;
  qty: string;
  date: string; // bought or logged, YYYY-MM-DD
  notes: string;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
