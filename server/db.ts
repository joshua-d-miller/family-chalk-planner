/*
===============================================================================
 Family Chalk Planner | Server | db.ts
===============================================================================
 Version:   0.13.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Updated:   2026-11-07

 Purpose:
     The board's database: one SQLite file in DATA_DIR. WAL, so the wall
     can read while a tablet writes; wait instead of failing if busy. It
     holds account data too, so it's readable by the service only. (Each
     feature creates its own tables: kv.ts, month.ts, art.ts,
     access/store.ts...)
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    Server and tests are all TypeScript (ES
                        claude    modules).
                        colby
                                  Reminders, timers, the pantry and the right-
                                  hand column's pages (server).
===============================================================================
*/

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------ //
// | Opening the database | //
// ------------------------ //
// Waits up to 5 seconds when another write is in progress instead of        //
// failing.                                                                  //
export function openDatabase(dataDir: string) {
  fs.mkdirSync(dataDir, { recursive: true });
  return new DatabaseSync(path.join(dataDir, 'chalkboard.db'));
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------------------------- //
// | Readable by the service only | //
// -------------------------------- //
// WAL mode (the wall reads while a tablet writes) and file modes, so the    //
// database, which holds account data, is private to the service.            //
export function prepareDatabase(db: DatabaseSync, dataDir: string) {
  for (const f of ['chalkboard.db', 'chalkboard.db-wal', 'chalkboard.db-shm']) {
    try {
      fs.chmodSync(path.join(dataDir, f), 0o600);
    } catch {
      /* not there yet */
    }
  }
  try {
    const ck = Object.values(db.prepare('PRAGMA quick_check').get() || {})[0];
    if (ck !== 'ok')
      console.error(
        `Chalk Planner: DATABASE CHECK FAILED (${ck}) - restore last night's snapshot from the backup folder`
      );
  } catch (e) {
    console.error('Chalk Planner: database check failed:', (e as Error).message);
  }
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
  `);
  db.exec('DROP TABLE IF EXISTS sessions'); // PIN sign-ins of older versions
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------------------- //
// | Several changes as one | //
// -------------------------- //
// Several changes as one: all of them, or (if anything fails) none          //
export function tx<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
