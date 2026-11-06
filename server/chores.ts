// Chores: the family's checklist, kept on the server so every screen and phone shows the same list.
// A chore repeats every day, week or month, and a check-off only counts for the current period,
// so the lists reset by themselves. A chore for several people is either shared (done once, by any
// of them: "load the dishwasher") or "each" (everyone checks off their own: "make your bed").
//
//   kv 'chores'      { people, chores }
//   kv 'chore_done'  { [choreId] or [choreId:personId]: { p: period key, n: count, by, at } }
import type { Express, Request } from 'express';
import type { Chore, ChoreList, ChoreProgress, ChoresView, Every, Periods, Person } from '../shared/chores.ts';

const EVERY: Every[] = ['day', 'week', 'month'];
const MAX = { people: 8, chores: 120, title: 60, name: 20, times: 7 };

interface DoneRecord {
  p: string; // period key
  n: number;
  by?: string | null;
  at?: number;
}
type DoneMap = Record<string, DoneRecord>;

// A typical family's cleaning schedule to start from (rename the people, change anything)
type ExampleRow = [Every, string, string, number?, boolean?];
const EXAMPLE_ROWS: ExampleRow[] = [
  ['day', 'dad mom', 'Load/unload dishwasher'],
  ['day', 'dad mom', 'Wipe kitchen counters'],
  ['day', 'dad mom', 'Quick living room pickup'],
  ['day', 'dad', 'Start and switch laundry as needed'],
  ['day', 'kid1 kid2', 'Put dirty clothes in hampers', 1, true],
  ['day', 'kid1 kid2', 'Put away toys and belongings', 1, true],
  ['day', 'kid1 kid2', 'Help feed the cats (with a grown-up)'],
  ['week', 'dad', 'Clean bathroom 1'],
  ['week', 'dad', 'Clean bathroom 2'],
  ['week', 'dad', 'Vacuum carpeted rooms'],
  ['week', 'dad', 'Vacuum hard floors'],
  ['week', 'dad', 'Mop kitchen and bathroom floors'],
  ['week', 'dad', 'Wash bedding'],
  ['week', 'mom', 'Dust living room and common areas'],
  ['week', 'mom', 'Clean kitchen surfaces and appliances'],
  ['week', 'mom', 'Wipe mirrors'],
  ['week', 'mom', 'Fold laundry', 3],
  ['week', 'dad mom', 'Change bed linens'],
  ['week', 'dad mom', 'Put away our own laundry', 1, true],
  ['week', 'kid1', 'Tidy bedroom'],
  ['week', 'kid1', 'Put away clean clothes'],
  ['week', 'kid1', 'Empty bedroom trash'],
  ['week', 'kid2', 'Tidy bedroom'],
  ['week', 'kid2', 'Put away clean clothes'],
  ['week', 'kid2', 'Organize toys and belongings'],
  ['month', 'dad', 'Clean refrigerator shelves'],
  ['month', 'dad', 'Dust baseboards'],
  ['month', 'dad', 'Clean interior windows'],
  ['month', 'dad', 'Vacuum lower-level office'],
  ['month', 'dad', 'Vacuum under furniture'],
  ['month', 'mom', 'Wipe kitchen cabinet fronts'],
  ['month', 'mom', 'Clean microwave'],
  ['month', 'mom', 'Wipe doors and light switches']
];
export const EXAMPLE: ChoreList = {
  people: [
    { id: 'dad', name: 'Dad' },
    { id: 'mom', name: 'Mom' },
    { id: 'kid1', name: 'Kid 1', kid: true },
    { id: 'kid2', name: 'Kid 2', kid: true }
  ],
  chores: EXAMPLE_ROWS.map(([every, who, title, times, each], i) => ({
    id: 'c' + (i + 1),
    title,
    who: who.split(' '),
    every,
    times: times || 1,
    ...(each ? { each: true } : {})
  }))
};

const isId = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9]{1,16}$/.test(v);
const text = (v: unknown, max: number) =>
  String(v ?? '')
    .replace(/[\r\n<>]/g, ' ')
    .trim()
    .slice(0, max);

// Check a list sent by a screen; anything unusable is reported, the rest is kept
export function clean(input: unknown): ChoreList & { errs: string[] } {
  const src = (input || {}) as Partial<Record<'people' | 'chores', unknown>>;
  const errs: string[] = [];
  const people: Person[] = [];
  const personIds = new Set<string>();
  for (const raw of (Array.isArray(src.people) ? src.people : []).slice(0, MAX.people)) {
    const p = (raw || {}) as Record<string, unknown>;
    const name = text(p.name, MAX.name);
    if (!isId(p.id) || personIds.has(p.id) || !name) {
      errs.push('each person needs a name');
      continue;
    }
    personIds.add(p.id);
    people.push({ id: p.id, name, ...(p.kid ? { kid: true } : {}) });
  }
  const chores: Chore[] = [];
  const choreIds = new Set<string>();
  for (const raw of (Array.isArray(src.chores) ? src.chores : []).slice(0, MAX.chores)) {
    const c = (raw || {}) as Record<string, unknown>;
    const title = text(c.title, MAX.title);
    const who = [...new Set((Array.isArray(c.who) ? c.who : []).filter((id): id is string => personIds.has(id)))];
    const every = c.every as Every;
    if (!isId(c.id) || choreIds.has(c.id) || !title || !who.length || !EVERY.includes(every)) {
      errs.push('each chore needs a name, someone and how often');
      continue;
    }
    choreIds.add(c.id);
    const times = Math.min(Math.max(Math.round(Number(c.times)) || 1, 1), MAX.times);
    chores.push({ id: c.id, title, who, every, times, ...(c.each && who.length > 1 ? { each: true } : {}) });
  }
  return { people, chores, errs };
}

// The current period keys for a date (YYYY-MM-DD) and the first day of the week (0 = Sunday)
export function periods(today: string, weekStart: number): Periods {
  const [y, m, d] = today.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d);
  const dow = new Date(t).getUTCDay();
  const weekStarts = new Date(t - ((dow - weekStart + 7) % 7) * 864e5).toISOString().slice(0, 10);
  return { day: today, week: weekStarts, month: today.slice(0, 7) };
}

export interface ChoresDeps {
  app: Express;
  kvGet: (key: string) => unknown;
  kvSet: (key: string, value: unknown) => void;
  broadcast: (event: string, data: unknown) => void;
  today: () => string;
  weekStart: number;
  kidOf: (req: Request) => string | null; // on a kid's tablet: which kid
  who: (req: Request) => string | null; // a name for "done by"
}

export function setup({ app, kvGet, kvSet, broadcast, today, weekStart, kidOf, who }: ChoresDeps) {
  const load = () => (kvGet('chores') as ChoreList | null) || { people: [], chores: [] };
  const doneMap = () => (kvGet('chore_done') as DoneMap | null) || {};

  function view(): Omit<ChoresView, 'mine'> {
    const data = load();
    const per = periods(today(), weekStart);
    const done = doneMap();
    const current = (key: string, c: Chore) => {
      const r = done[key];
      return r && r.p === per[c.every] ? r : null;
    };
    return {
      people: data.people,
      periods: per,
      chores: data.chores.map((c): ChoreProgress => {
        if (c.each) {
          const doneEach: Record<string, number> = {};
          for (const id of c.who) doneEach[id] = current(c.id + ':' + id, c)?.n ?? 0;
          return { ...c, doneEach };
        }
        const r = current(c.id, c);
        return { ...c, done: r ? r.n : 0, by: r?.by ?? null };
      })
    };
  }
  const changed = () => broadcast('chores', { at: Date.now() });

  app.get('/api/chores', (req, res) => {
    res.json({ ...view(), mine: kidOf(req) || null });
  });

  // Tick one off (or undo): family screens and signed-in people, anyone's; a kid's tablet, only their own
  app.post('/api/chores/check', (req, res) => {
    const { id, undo, person } = (req.body || {}) as { id?: string; undo?: boolean; person?: string };
    const c = load().chores.find(x => x.id === id);
    if (!c) return res.status(404).json({ error: 'That chore was removed' });
    const kid = kidOf(req);
    if (kid && !c.who.includes(kid)) return res.status(403).json({ error: 'That one isn’t yours' });
    let key = c.id;
    if (c.each) {
      const whose = kid || person; // a kid's tablet is always its own kid
      if (!whose || !c.who.includes(whose)) return res.status(400).json({ error: 'Whose is it?' });
      key = c.id + ':' + whose;
    }
    const period = periods(today(), weekStart)[c.every];
    const all = doneMap();
    const r: DoneRecord = all[key] && all[key].p === period ? all[key] : { p: period, n: 0 };
    r.n = undo ? Math.max(0, r.n - 1) : Math.min(c.times, r.n + 1);
    r.by = who(req);
    r.at = Date.now();
    all[key] = r;
    kvSet('chore_done', all);
    changed();
    res.json(view());
  });

  // The whole list (signed-in people only); check-offs of removed chores are dropped
  app.post('/api/chores/save', (req, res) => {
    const body = (req.body || {}) as { example?: boolean };
    const { people, chores, errs } = clean(body.example ? EXAMPLE : body);
    if (errs.length) return res.status(400).json({ error: errs[0] });
    kvSet('chores', { people, chores });
    const all = doneMap();
    const keep = new Set(chores.map(c => c.id));
    for (const k of Object.keys(all)) if (!keep.has(k.split(':')[0])) delete all[k];
    kvSet('chore_done', all);
    changed();
    res.json(view());
  });

  return { people: () => load().people };
}
