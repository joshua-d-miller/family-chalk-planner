// Chores as the server stores them and the screens show them.

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

// The current day / week / month, as keys: '2026-10-28', the date the week starts, '2026-10'
export type Periods = Record<Every, string>;

// What GET /api/chores sends: each chore with how far along it is this period
export type ChoreProgress = Chore & ({ done: number; by: string | null } | { doneEach: Record<string, number> });

export interface ChoresView {
  people: Person[];
  periods: Periods;
  chores: ChoreProgress[];
  mine: string | null; // on a kid's tablet: whose it is
}
