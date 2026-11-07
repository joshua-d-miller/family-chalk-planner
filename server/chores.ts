/*
===============================================================================
 Family Chalk Planner | Server | chores.ts
===============================================================================
 Version:   0.13.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-06
 Updated:   2026-11-07

 Purpose:
     Chores: the family's checklist, kept on the server so every screen
     and phone shows the same list. A chore repeats every day, week or
     month, and a check-off only counts for the current period, so the
     lists reset by themselves. A chore for several people is either
     shared (done once, by any of them: "load the dishwasher") or "each"
     (everyone checks off their own: "make your bed").

     Saved in the people, chores and chore_checks tables; the screens can
     change one chore at a time.

 Routes:
     GET    /api/chores
     POST   /api/chores/check
     POST   /api/chores/save
     POST   /api/chores/item
     POST   /api/chores/item/delete
     POST   /api/chores/people

 Used by:
     server/main.ts
     test/access.test.ts
     test/time.test.ts
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    TypeScript groundwork: type-check, lint and
                        claude    format in CI; chores is the first TypeScript
                        colby     module.

                                  Database migrations; chores, meals and jars
                                  in their own tables.
===============================================================================
*/

import type { Express, Request } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import type { Chore, ChoreList, ChoreProgress, ChoresView, Every, Periods, Person } from '../shared/chores.ts';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------- //
// | Limits | //
// ---------- //
const EVERY: Every[] = ['day', 'week', 'month'];
const MAX = { people: 8, chores: 120, title: 60, name: 20, times: 7 };

interface DoneRecord {
  p: string; // period key
  n: number;
  by?: string | null;
  at?: number;
}
type DoneMap = Record<string, DoneRecord>;

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------------- //
// | The example list | //
// -------------------- //
// A typical family's cleaning schedule to start from (rename the people,    //
// change anything)                                                          //
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

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------------------------- //
// | Checking what a screen sends | //
// -------------------------------- //
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

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------------------------------- //
// | Which day, week and month it is | //
// ----------------------------------- //
// A check-off counts for its period only, so the lists start again by       //
// themselves: each day, each week (from the board's week start) and each    //
// month.                                                                    //
export function periods(today: string, weekStart: number): Periods {
  const [y, m, d] = today.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d);
  const dow = new Date(t).getUTCDay();
  const weekStarts = new Date(t - ((dow - weekStart + 7) % 7) * 864e5).toISOString().slice(0, 10);
  return { day: today, week: weekStarts, month: today.slice(0, 7) };
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------ //
// | What the routes need | //
// ------------------------ //
export interface ChoresDeps {
  app: Express;
  db: DatabaseSync;
  broadcast: (event: string, data: unknown) => void;
  today: () => string;
  weekStart: number;
  kidOf: (req: Request) => string | null; // on a kid's tablet: which kid
  who: (req: Request) => string | null; // a name for "done by"
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------- //
// | The tables | //
// -------------- //
// The tables (server/migrations.ts): people, chores (who is a JSON list of  //
// person ids), chore_checks (key = chore id, or "chore id:person id" for    //
// "each" chores; only the current period counts)                            //
function store(db: DatabaseSync) {
  const q = {
    people: db.prepare('SELECT id, name, kid FROM people ORDER BY sort, rowid'),
    chores: db.prepare('SELECT id, title, who, every, times, each FROM chores ORDER BY sort, rowid'),
    chore: db.prepare('SELECT id, title, who, every, times, each FROM chores WHERE id = ?'),
    addChore: db.prepare(
      `INSERT INTO chores (id, title, who, every, times, each, sort) VALUES (?, ?, ?, ?, ?, ?,
         COALESCE((SELECT MAX(sort) + 1 FROM chores), 0))
       ON CONFLICT(id) DO UPDATE SET title = excluded.title, who = excluded.who, every = excluded.every,
         times = excluded.times, each = excluded.each`
    ),
    delChore: db.prepare('DELETE FROM chores WHERE id = ?'),
    checks: db.prepare('SELECT key, period, n, by, at FROM chore_checks'),
    check: db.prepare('SELECT key, period, n, by, at FROM chore_checks WHERE key = ?'),
    setCheck: db.prepare(
      `INSERT INTO chore_checks (key, period, n, by, at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET period = excluded.period, n = excluded.n, by = excluded.by, at = excluded.at`
    ),
    delChecksOf: db.prepare("DELETE FROM chore_checks WHERE key = ? OR key LIKE ? || ':%'")
  };
  type ChoreRow = { id: string; title: string; who: string; every: Every; times: number; each: number };
  const toChore = (r: ChoreRow): Chore => ({
    id: r.id,
    title: r.title,
    who: JSON.parse(r.who),
    every: r.every,
    times: r.times,
    ...(r.each ? { each: true } : {})
  });
  const tx = (fn: () => void) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      fn();
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  };
  return {
    list(): ChoreList {
      const people = (q.people.all() as { id: string; name: string; kid: number }[]).map(p => ({
        id: p.id,
        name: p.name,
        ...(p.kid ? { kid: true } : {})
      }));
      return { people, chores: (q.chores.all() as ChoreRow[]).map(toChore) };
    },
    chore(id: string) {
      const r = q.chore.get(id) as ChoreRow | undefined;
      return r ? toChore(r) : null;
    },
    checks(): DoneMap {
      const out: DoneMap = {};
      for (const r of q.checks.all() as {
        key: string;
        period: string;
        n: number;
        by: string | null;
        at: number | null;
      }[])
        out[r.key] = { p: r.period, n: r.n, by: r.by, at: r.at ?? undefined };
      return out;
    },
    check(key: string) {
      const r = q.check.get(key) as { period: string; n: number } | undefined;
      return r ? { p: r.period, n: r.n } : null;
    },
    setCheck: (key: string, r: DoneRecord) => q.setCheck.run(key, r.p, r.n, r.by ?? null, r.at ?? null),
    // the whole list at once (the old board's editor), in one transaction
    replace(list: ChoreList) {
      tx(() => {
        db.exec('DELETE FROM people; DELETE FROM chores;');
        const addP = db.prepare('INSERT INTO people (id, name, kid, sort) VALUES (?, ?, ?, ?)');
        list.people.forEach((p, i) => addP.run(p.id, p.name, p.kid ? 1 : 0, i));
        const addC = db.prepare(
          'INSERT INTO chores (id, title, who, every, times, each, sort) VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        list.chores.forEach((c, i) =>
          addC.run(c.id, c.title, JSON.stringify(c.who), c.every, c.times, c.each ? 1 : 0, i)
        );
        const keep = new Set(list.chores.map(c => c.id));
        for (const k of Object.keys(this.checks()))
          if (!keep.has(k.split(':')[0])) db.prepare('DELETE FROM chore_checks WHERE key = ?').run(k);
      });
    },
    // one chore, added or changed
    saveChore: (c: Chore) => q.addChore.run(c.id, c.title, JSON.stringify(c.who), c.every, c.times, c.each ? 1 : 0),
    removeChore(id: string) {
      tx(() => {
        q.delChore.run(id);
        q.delChecksOf.run(id, id);
      });
    },
    // the people (a short list, saved together); a removed person leaves their chores, and chores left
    // with nobody are removed
    savePeople(people: Person[]) {
      tx(() => {
        db.exec('DELETE FROM people');
        const addP = db.prepare('INSERT INTO people (id, name, kid, sort) VALUES (?, ?, ?, ?)');
        people.forEach((p, i) => addP.run(p.id, p.name, p.kid ? 1 : 0, i));
        const ids = new Set(people.map(p => p.id));
        for (const c of (q.chores.all() as ChoreRow[]).map(toChore)) {
          const who = c.who.filter(id => ids.has(id));
          if (!who.length) this.removeChoreInTx(c.id);
          else if (who.length !== c.who.length)
            q.addChore.run(c.id, c.title, JSON.stringify(who), c.every, c.times, c.each && who.length > 1 ? 1 : 0);
        }
      });
    },
    removeChoreInTx(id: string) {
      q.delChore.run(id);
      q.delChecksOf.run(id, id);
    }
  };
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------- //
// | The routes | //
// -------------- //
export function setup({ app, db, broadcast, today, weekStart, kidOf, who }: ChoresDeps) {
  const st = store(db);

  function view(): Omit<ChoresView, 'mine'> {
    const data = st.list();
    const per = periods(today(), weekStart);
    const done = st.checks();
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

  // ------------------- //
  // | Ticking one off | //
  // ------------------- //
  // Tick one off (or undo): family screens and signed-in people, anyone's;  //
  // a kid's tablet, only their own                                          //
  app.post('/api/chores/check', (req, res) => {
    const { id, undo, person } = (req.body || {}) as { id?: string; undo?: boolean; person?: string };
    const c = typeof id === 'string' ? st.chore(id) : null;
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
    const cur = st.check(key);
    const n = cur && cur.p === period ? cur.n : 0;
    st.setCheck(key, {
      p: period,
      n: undo ? Math.max(0, n - 1) : Math.min(c.times, n + 1),
      by: who(req),
      at: Date.now()
    });
    changed();
    res.json(view());
  });

  // ------------------ //
  // | The whole list | //
  // ------------------ //
  // The whole list (signed-in people only); check-offs of removed chores    //
  // are dropped                                                             //
  app.post('/api/chores/save', (req, res) => {
    const body = (req.body || {}) as { example?: boolean };
    const { people, chores, errs } = clean(body.example ? EXAMPLE : body);
    if (errs.length) return res.status(400).json({ error: errs[0] });
    st.replace({ people, chores });
    changed();
    res.json(view());
  });

  // ----------------------- //
  // | One chore at a time | //
  // ----------------------- //
  // One chore, added or changed (signed-in people only)                     //
  app.post('/api/chores/item', (req, res) => {
    const { people } = st.list();
    const { chores, errs } = clean({ people, chores: [(req.body || {}).chore] });
    if (errs.length || !chores.length) return res.status(400).json({ error: errs[0] || 'bad chore' });
    st.saveChore(chores[0]);
    changed();
    res.json(view());
  });
  app.post('/api/chores/item/delete', (req, res) => {
    const id = (req.body || {}).id;
    if (isId(id)) st.removeChore(id);
    changed();
    res.json(view());
  });
  // -------------- //
  // | The people | //
  // -------------- //
  // The people (signed-in people only)                                      //
  app.post('/api/chores/people', (req, res) => {
    const { people, errs } = clean({ people: (req.body || {}).people, chores: [] });
    if (errs.length) return res.status(400).json({ error: errs[0] });
    st.savePeople(people);
    changed();
    res.json(view());
  });

  return { people: () => st.list().people };
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
