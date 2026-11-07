/*
===============================================================================
 Family Chalk Planner | Server | migrations.ts
===============================================================================
 Version:   0.13.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-07
 Updated:   2026-11-07

 Purpose:
     Numbered changes to the database, run once each at start-up, in
     order, each in its own transaction. The database remembers how far it
     got (PRAGMA user_version), so a board updated from any older version
     catches up step by step. Never change a step that has shipped: add a
     new one.

     A board refuses to start on a database from a newer version (someone
     went back to an older release without restoring its backup): it would
     not understand the newer tables. deploy/update.sh restores the
     database it backed up when it rolls back.

 Used by:
     server/main.ts
     server/updates.ts
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

import type { DatabaseSync } from 'node:sqlite';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------- //
// | Helpers | //
// ----------- //
// Reading an old value from the kv table, and its rows, for copying into    //
// the new tables.                                                           //
type Step = { name: string; run: (db: DatabaseSync) => void };

const json = (db: DatabaseSync, key: string): unknown => {
  const r = db.prepare('SELECT data FROM kv WHERE key = ?').get(key) as { data: string } | undefined;
  try {
    return r ? JSON.parse(r.data) : null;
  } catch {
    return null;
  }
};
type Row = Record<string, unknown>;
const rows = (v: unknown): Row[] => (Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : []);

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------------------- //
// | The steps, in order | //
// ----------------------- //
// Each one runs once, in its own transaction. Never change a step that has  //
// shipped: add a new one at the end.                                        //
export const STEPS: Step[] = [
  {
    // Lists that several screens change at once get their own tables, saved one item at a time, so two
    // screens saving together no longer undo each other's changes. What was in the old single-value
    // store (kv) is copied over; the old values are left where they were.
    name: 'lists in their own tables',
    run(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, data TEXT NOT NULL);
        CREATE TABLE people (id TEXT PRIMARY KEY, name TEXT NOT NULL, kid INTEGER NOT NULL DEFAULT 0, sort INTEGER NOT NULL);
        CREATE TABLE chores (
          id TEXT PRIMARY KEY, title TEXT NOT NULL, who TEXT NOT NULL, every TEXT NOT NULL,
          times INTEGER NOT NULL DEFAULT 1, each INTEGER NOT NULL DEFAULT 0, sort INTEGER NOT NULL);
        CREATE TABLE chore_checks (key TEXT PRIMARY KEY, period TEXT NOT NULL, n INTEGER NOT NULL, by TEXT, at INTEGER);
        CREATE TABLE meals (
          id TEXT PRIMARY KEY, title TEXT NOT NULL, day TEXT NOT NULL DEFAULT '', done INTEGER NOT NULL DEFAULT 0,
          sort INTEGER NOT NULL);
        CREATE TABLE jars (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, pieces TEXT NOT NULL, items TEXT NOT NULL, goal INTEGER NOT NULL,
          sort INTEGER NOT NULL);
        CREATE TABLE reminders (
          id TEXT PRIMARY KEY, title TEXT NOT NULL, mode TEXT NOT NULL, time TEXT NOT NULL, repeat TEXT NOT NULL,
          important INTEGER NOT NULL DEFAULT 1, done INTEGER NOT NULL DEFAULT 0, ack_date TEXT, sort INTEGER NOT NULL);
        CREATE TABLE timers (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, duration INTEGER NOT NULL, state TEXT NOT NULL,
          ends_at INTEGER, left_ms INTEGER, done_at INTEGER, created INTEGER NOT NULL);
        CREATE TABLE pantry (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, loc TEXT NOT NULL, qty TEXT NOT NULL DEFAULT '',
          date TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', updated INTEGER NOT NULL);
      `);
      const choreData = (json(db, 'chores') || {}) as Row;
      const addPerson = db.prepare('INSERT OR IGNORE INTO people (id, name, kid, sort) VALUES (?, ?, ?, ?)');
      rows(choreData.people).forEach((p, i) => addPerson.run(String(p.id), String(p.name), p.kid ? 1 : 0, i));
      const addChore = db.prepare(
        'INSERT OR IGNORE INTO chores (id, title, who, every, times, each, sort) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );
      rows(choreData.chores).forEach((c, i) =>
        addChore.run(
          String(c.id),
          String(c.title),
          JSON.stringify(Array.isArray(c.who) ? c.who : []),
          String(c.every),
          Number(c.times) || 1,
          c.each ? 1 : 0,
          i
        )
      );
      const addCheck = db.prepare('INSERT OR IGNORE INTO chore_checks (key, period, n, by, at) VALUES (?, ?, ?, ?, ?)');
      for (const [k, v] of Object.entries((json(db, 'chore_done') || {}) as Record<string, Row>))
        if (v && typeof v === 'object')
          addCheck.run(k, String(v.p), Number(v.n) || 0, v.by == null ? null : String(v.by), Number(v.at) || null);

      const addMeal = db.prepare('INSERT INTO meals (id, title, day, done, sort) VALUES (?, ?, ?, ?, ?)');
      rows(((json(db, 'meals') || {}) as Row).items).forEach((m, i) =>
        addMeal.run('m' + (i + 1), String(m.t || ''), '', m.done ? 1 : 0, i)
      );
      const addJar = db.prepare(
        'INSERT OR IGNORE INTO jars (id, name, pieces, items, goal, sort) VALUES (?, ?, ?, ?, ?, ?)'
      );
      rows(json(db, 'jars')).forEach((j, i) =>
        addJar.run(
          String(j.id),
          String(j.name || 'Jar'),
          JSON.stringify(Array.isArray(j.pieces) ? j.pieces : ['star']),
          JSON.stringify(Array.isArray(j.items) ? j.items : []),
          Number(j.goal) || 20,
          i
        )
      );
    }
  }
];

export const SCHEMA_VERSION = STEPS.length;

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------------------------- //
// | Bringing a database up to date | //
// ---------------------------------- //
// Runs the steps the database hasn't had yet, one at a time, and refuses a  //
// database from a newer version of the board.                               //
export function migrate(db: DatabaseSync, log: Pick<Console, 'log'> = console) {
  const at = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  if (at > STEPS.length)
    throw new Error(
      `The database is from a newer version of the board (database version ${at}, this version knows up to ${STEPS.length}). ` +
        'Restore the backup made before the update (deploy/update.sh does this when it rolls back), or update the board again.'
    );
  for (let v = at; v < STEPS.length; v++) {
    db.exec('BEGIN IMMEDIATE');
    try {
      STEPS[v].run(db);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
      log.log(`Chalk Planner: database updated (${v + 1}: ${STEPS[v].name})`);
    } catch (e) {
      db.exec('ROLLBACK');
      throw new Error(`Database update ${v + 1} (${STEPS[v].name}) failed: ${(e as Error).message}`, { cause: e });
    }
  }
  return STEPS.length;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
