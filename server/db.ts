// The board's database: one SQLite file in DATA_DIR. WAL, so the wall can read while a tablet writes; wait
// instead of failing if busy. It holds account data too, so it's readable by the service only.
// (Each feature creates its own tables: kv.ts, month.ts, art.ts, access/store.ts...)
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function openDatabase(dataDir: string) {
  fs.mkdirSync(dataDir, { recursive: true });
  return new DatabaseSync(path.join(dataDir, 'chalkboard.db'));
}

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

// Several changes as one: all of them, or (if anything fails) none
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
