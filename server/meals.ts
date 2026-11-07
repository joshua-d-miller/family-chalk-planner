/*
===============================================================================
 Family Chalk Planner | Server | meals.ts
===============================================================================
 Version:   0.13.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-06
 Updated:   2026-11-07

 Purpose:
     The meal plan: meals for the week, each on a day of the week or on
     none, ticked off as you go. Saved in the meals table, one meal at a
     time (/api/meals/item); the whole list can still be sent at once (the
     old board's editor). Meals by day of the week: from Colby Way's
     board.

 Routes:
     GET    /api/meals
     POST   /api/meals
     POST   /api/meals/item
     POST   /api/meals/item/delete

 Used by:
     server/main.ts
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    Art, stamps, each month's options, board
                        claude    style, meals and jars in their own
                        colby     TypeScript modules.

                                  Database migrations; chores, meals and jars
                                  in their own tables.
===============================================================================
*/

import crypto from 'node:crypto';
import type { Express } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import type { Meal, MealDay, Meals } from '../shared/lists.ts';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------------------------- //
// | Checking what a screen sends | //
// -------------------------------- //
const DAYS: MealDay[] = ['', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MAX = 21;
const isId = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9]{1,16}$/.test(v);
const newId = () => 'm' + crypto.randomBytes(5).toString('hex');

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------ //
// | One meal | //
// ------------ //
// A meal as sent by a screen. "[mon] Tacos" (how Colby's board first kept   //
// the day) still works.                                                     //
function cleanMeal(raw: unknown): Omit<Meal, 'id'> & { id?: string; hasDay: boolean } {
  const it = (raw || {}) as Record<string, unknown>;
  let t = String(it.t || '').trim();
  let day = String(it.day ?? '').toLowerCase() as MealDay;
  let hasDay = it.day !== undefined;
  const m = /^\[(sun|mon|tue|wed|thu|fri|sat)\]\s*(.*)$/i.exec(t);
  if (m) {
    if (!day) day = m[1].toLowerCase() as MealDay;
    t = m[2].trim();
    hasDay = true;
  }
  if (!DAYS.includes(day)) day = '';
  return { ...(isId(it.id) ? { id: it.id } : {}), t: t.slice(0, 60), day, done: !!it.done, hasDay };
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------- //
// | The routes | //
// -------------- //
export function setup({
  app,
  db,
  broadcast
}: {
  app: Express;
  db: DatabaseSync;
  broadcast: (event: string, data: unknown) => void;
}) {
  const q = {
    all: db.prepare('SELECT id, title, day, done FROM meals ORDER BY sort, rowid'),
    count: db.prepare('SELECT COUNT(*) AS n FROM meals'),
    put: db.prepare(
      `INSERT INTO meals (id, title, day, done, sort) VALUES (?, ?, ?, ?, COALESCE((SELECT MAX(sort) + 1 FROM meals), 0))
       ON CONFLICT(id) DO UPDATE SET title = excluded.title, day = excluded.day, done = excluded.done`
    ),
    del: db.prepare('DELETE FROM meals WHERE id = ?')
  };
  let updated = Date.now();
  const list = (): Meals => ({
    items: (q.all.all() as { id: string; title: string; day: MealDay; done: number }[]).map(r => ({
      id: r.id,
      t: r.title,
      day: r.day,
      done: !!r.done
    })),
    updated
  });
  const changed = () => {
    updated = Date.now();
    const meals = list();
    broadcast('meals', meals);
    return meals;
  };

  app.get('/api/meals', (_req, res) => res.json(list()));

  // ------------------ //
  // | The whole list | //
  // ------------------ //
  // The whole list (the old board): meals sent without a day keep the day   //
  // they had                                                                //
  app.post('/api/meals', (req, res) => {
    const sent = (req.body || {}).items;
    if (!Array.isArray(sent)) return res.status(400).json({ error: 'bad list' });
    const before = list().items;
    const items = sent
      .slice(0, MAX)
      .map(cleanMeal)
      .filter(m => m.t);
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec('DELETE FROM meals');
      const add = db.prepare('INSERT INTO meals (id, title, day, done, sort) VALUES (?, ?, ?, ?, ?)');
      const used = new Set<string>();
      items.forEach((m, i) => {
        const old = (m.id && before.find(b => b.id === m.id)) || before.find(b => b.t === m.t && !used.has(b.id));
        let id = m.id || old?.id || newId();
        if (used.has(id)) id = newId();
        used.add(id);
        add.run(id, m.t, m.hasDay ? m.day : old?.day || '', m.done ? 1 : 0, i);
      });
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    res.json(changed());
  });

  // ---------------------- //
  // | One meal at a time | //
  // ---------------------- //
  // One meal, added or changed                                              //
  app.post('/api/meals/item', (req, res) => {
    const m = cleanMeal((req.body || {}).meal);
    if (!m.t) return res.status(400).json({ error: 'What’s the meal?' });
    const exists = m.id && list().items.some(x => x.id === m.id);
    if (!exists && (q.count.get() as { n: number }).n >= MAX)
      return res.status(400).json({ error: `The plan holds ${MAX} meals - tick some off first` });
    q.put.run(m.id || newId(), m.t, m.day, m.done ? 1 : 0);
    res.json(changed());
  });
  app.post('/api/meals/item/delete', (req, res) => {
    const id = (req.body || {}).id;
    if (isId(id)) q.del.run(id);
    res.json(changed());
  });
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
