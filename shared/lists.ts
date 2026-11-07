// Lists the screens show and change: meals, jars, reminders, timers, pantry.

// Meal plan: each meal on a day of the week, or on none ('')
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

export type JarPiece = 'heart' | 'rainbow' | 'star' | 'bolt' | 'critter';
export interface Jar {
  id: string;
  name: string;
  pieces: JarPiece[]; // what goes in, in turn
  count: number;
  items: JarPiece[]; // what's in it, in order
  goal: number;
}

// 'always': shown until ticked off. 'time': pops up at a time, every day or once.
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

// Shared by every screen: running (endsAt), paused (left) or done (doneAt)
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

export type PantryLoc = 'pantry' | 'fridge' | 'freezer' | 'basement' | 'other';
export interface PantryItem {
  id: string;
  name: string;
  loc: PantryLoc;
  qty: string;
  date: string; // bought or logged, YYYY-MM-DD
  notes: string;
}
