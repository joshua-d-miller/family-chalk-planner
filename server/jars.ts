/*
===============================================================================
 Family Chalk Planner | Server | jars.ts
===============================================================================
 Version:   0.13.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-06
 Updated:   2026-11-07

 Purpose:
     Reward jars (up to 4, one per kid): pieces go in from the tablet or a
     family screen; the wall shows them filling up. Each jar remembers
     every piece in the order it went in (a kid can ask for a rainbow).
     Saved in the jars table. Adding or taking out a piece changes just
     that jar (/api/jars/piece), so two screens dropping pieces in at once
     both count; the whole set can still be sent at once.

 Routes:
     GET    /api/jars
     POST   /api/jars
     POST   /api/jars/piece

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

import type { Express } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import type { Jar, JarPiece } from '../shared/lists.ts';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------- //
// | Pieces | //
// ---------- //
const PIECES: JarPiece[] = ['heart', 'rainbow', 'star', 'bolt', 'critter'];
const MAX_IN = 200;
const isPiece = (p: unknown): p is JarPiece => PIECES.includes(p as JarPiece);

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------- //
// | What's in a jar | //
// ------------------- //
// What's in the jar, kept as long as count: anything missing is filled in   //
// the jar's usual rotation                                                  //
function jarItems(items: unknown, count: number, pieces: JarPiece[]): JarPiece[] {
  const out = (Array.isArray(items) ? items.filter(isPiece) : []).slice(0, count);
  while (out.length < count) out.push(pieces[out.length % pieces.length]);
  return out;
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
  type Row = { id: string; name: string; pieces: string; items: string; goal: number };
  const toJar = (r: Row): Jar => {
    const items = JSON.parse(r.items) as JarPiece[];
    return { id: r.id, name: r.name, pieces: JSON.parse(r.pieces), count: items.length, items, goal: r.goal };
  };
  const q = {
    all: db.prepare('SELECT id, name, pieces, items, goal FROM jars ORDER BY sort, rowid'),
    one: db.prepare('SELECT id, name, pieces, items, goal FROM jars WHERE id = ?'),
    setItems: db.prepare('UPDATE jars SET items = ? WHERE id = ?')
  };
  const getJars = () => (q.all.all() as Row[]).map(toJar); // jars are optional; added from the tablet
  const changed = () => {
    const jars = getJars();
    broadcast('jars', { jars });
    return jars;
  };

  app.get('/api/jars', (_req, res) => res.json(getJars()));

  // ----------------- //
  // | The whole set | //
  // ----------------- //
  // The whole set (adding, renaming or removing jars)                       //
  app.post('/api/jars', (req, res) => {
    const list = (req.body || {}).jars;
    if (!Array.isArray(list)) return res.status(400).json({ error: 'bad jars' });
    const before = Object.fromEntries(getJars().map(j => [j.id, j]));
    const jars: Jar[] = list.slice(0, 4).map((raw: Record<string, unknown>, i: number) => {
      const j = raw || {};
      const id = typeof j.id === 'string' && /^[a-z0-9]{1,16}$/.test(j.id) ? j.id : `jar${i}`;
      let pieces = (Array.isArray(j.pieces) ? j.pieces.filter(isPiece) : []).slice(0, 5);
      if (!pieces.length) pieces = ['star'];
      const count = Math.min(Math.max(Math.round(Number(j.count)) || 0, 0), MAX_IN);
      // a page from before 0.9 doesn't send items: keep what was already in that jar
      const items = jarItems(Array.isArray(j.items) ? j.items : before[id]?.items, count, pieces);
      const name =
        String(j.name || 'Jar')
          .trim()
          .slice(0, 14) || 'Jar';
      const goal = Math.min(Math.max(Math.round(Number(j.goal)) || 20, 3), 100);
      return { id, name, pieces, count, items, goal };
    });
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec('DELETE FROM jars');
      const add = db.prepare('INSERT INTO jars (id, name, pieces, items, goal, sort) VALUES (?, ?, ?, ?, ?, ?)');
      jars.forEach((j, i) => add.run(j.id, j.name, JSON.stringify(j.pieces), JSON.stringify(j.items), j.goal, i));
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    res.json(changed());
  });

  // ----------------------- //
  // | One piece in or out | //
  // ----------------------- //
  // One piece in ({ id, piece? }: the jar's next piece unless one is        //
  // picked), or out ({ id, out: true })                                     //
  app.post('/api/jars/piece', (req, res) => {
    const b = req.body || {};
    const r = typeof b.id === 'string' ? (q.one.get(b.id) as Row | undefined) : undefined;
    if (!r) return res.status(404).json({ error: 'That jar was removed' });
    const jar = toJar(r);
    const items = [...jar.items];
    if (b.out) items.pop();
    else if (items.length < MAX_IN)
      items.push(isPiece(b.piece) ? b.piece : jar.pieces[items.length % jar.pieces.length]);
    q.setItems.run(JSON.stringify(items), jar.id);
    res.json(changed());
  });
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
