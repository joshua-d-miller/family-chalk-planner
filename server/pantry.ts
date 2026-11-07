// Pantry: what food is in the house and where (pantry, fridge, freezer, basement...), with the day it was
// bought or logged. From Colby Way's board. Saved in the pantry table, one item at a time.
import crypto from 'node:crypto';
import type { Express } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import type { PantryItem, PantryLoc } from '../shared/lists.ts';
import { isDate } from './dates.ts';
import { tx } from './db.ts';

const LOCATIONS: PantryLoc[] = ['pantry', 'fridge', 'freezer', 'basement', 'other'];
const MAX = 500;
const isId = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9_-]{1,32}$/i.test(v);
const text = (v: unknown, n: number) =>
  String(v ?? '')
    .replace(/[\r\n<>]/g, ' ')
    .trim()
    .slice(0, n);

export function cleanPantryItem(raw: unknown, today: string): PantryItem {
  const it = (raw || {}) as Record<string, unknown>;
  return {
    id: isId(it.id) ? it.id : 'p' + crypto.randomBytes(5).toString('hex'),
    name: text(it.name, 80),
    loc: LOCATIONS.includes(it.loc as PantryLoc) ? (it.loc as PantryLoc) : 'pantry',
    qty: text(it.qty, 30),
    date: isDate(it.date) ? it.date : today,
    notes: text(it.notes, 100)
  };
}

export function setup({
  app,
  db,
  today,
  broadcast
}: {
  app: Express;
  db: DatabaseSync;
  today: () => string;
  broadcast: (event: string, data: unknown) => void;
}) {
  const q = {
    all: db.prepare('SELECT id, name, loc, qty, date, notes FROM pantry ORDER BY loc, name COLLATE NOCASE'),
    one: db.prepare('SELECT id FROM pantry WHERE id = ?'),
    count: db.prepare('SELECT COUNT(*) AS n FROM pantry'),
    put: db.prepare(
      `INSERT INTO pantry (id, name, loc, qty, date, notes, updated) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, loc = excluded.loc, qty = excluded.qty,
         date = excluded.date, notes = excluded.notes, updated = excluded.updated`
    ),
    del: db.prepare('DELETE FROM pantry WHERE id = ?')
  };
  const put = (it: PantryItem) => q.put.run(it.id, it.name, it.loc, it.qty, it.date, it.notes, Date.now());
  const view = () => ({ items: q.all.all() as unknown as PantryItem[], updated: Date.now() });
  const changed = () => {
    const v = view();
    broadcast('pantry', v);
    return v;
  };

  app.get('/api/pantry', (_req, res) => res.json(view()));
  app.post('/api/pantry', (req, res) => {
    const list = (req.body || {}).items;
    if (!Array.isArray(list)) return res.status(400).json({ error: 'bad items list' });
    const seen = new Set<string>();
    const items = list
      .slice(0, MAX)
      .map(it => cleanPantryItem(it, today()))
      .filter(it => it.name && !seen.has(it.id) && seen.add(it.id));
    tx(db, () => {
      db.exec('DELETE FROM pantry');
      items.forEach(put);
    });
    res.json(changed());
  });
  app.post('/api/pantry/item', (req, res) => {
    const it = cleanPantryItem((req.body || {}).item, today());
    if (!it.name) return res.status(400).json({ error: 'What is it?' });
    if (!q.one.get(it.id) && (q.count.get() as { n: number }).n >= MAX)
      return res.status(400).json({ error: `Up to ${MAX} things in the pantry` });
    put(it);
    res.json(changed());
  });
  app.post('/api/pantry/item/delete', (req, res) => {
    const id = (req.body || {}).id;
    if (isId(id)) q.del.run(id);
    res.json(changed());
  });
}
