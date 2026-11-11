/*
===============================================================================
 Family Chalk Planner | Server | Calendar | cache.ts
===============================================================================
 Version:   0.15.1
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-10
 Updated:   2026-11-10

 Purpose:
     The last good copy of each calendar's events, month by month, kept
     in the board's database. When a calendar can't be reached (iCloud or
     Google down, the internet out, a password that changed), the board
     shows these instead of an empty month, even after a restart, the way
     the photos already work from their own copies.
       calendar_cache  (ym, src, at, events): src is 'main' (the family's
           calendar), 'cal:<name>' (another calendar on the account) or
           'link:<name>' (a read-only calendar link).

 Used by:
     server/calendar/source.ts
     server/main.ts
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.15.1    2026-11-10   joshua    New file.
                        claude
===============================================================================
*/

import type { DatabaseSync } from 'node:sqlite';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------ //
// | The saved copy | //
// ------------------ //
export interface CalendarCache {
  get<T>(ym: string, src: string): { at: number; events: T[] } | null;
  set<T>(ym: string, src: string, events: T[]): void;
  clear(): void; // a different calendar or account: what was saved isn't theirs
  // which calendar the copies are of (a fingerprint of its settings): a different one clears them
  belongsTo(who: string): void;
}

// months older than this aren't kept (the board rarely goes back that far)
const KEEP_MONTHS = 13;

export function makeCalendarCache(db: DatabaseSync, now: () => number = Date.now): CalendarCache {
  db.exec(`CREATE TABLE IF NOT EXISTS calendar_cache (
    ym TEXT NOT NULL, src TEXT NOT NULL, at INTEGER NOT NULL, events TEXT NOT NULL,
    PRIMARY KEY (ym, src))`);
  const qGet = db.prepare('SELECT at, events FROM calendar_cache WHERE ym = ? AND src = ?');
  const qSet = db.prepare(
    `INSERT INTO calendar_cache (ym, src, at, events) VALUES (?, ?, ?, ?)
     ON CONFLICT(ym, src) DO UPDATE SET at = excluded.at, events = excluded.events`
  );
  const qOld = db.prepare('DELETE FROM calendar_cache WHERE ym < ?');
  const qClear = db.prepare('DELETE FROM calendar_cache');
  db.exec('CREATE TABLE IF NOT EXISTS calendar_cache_of (id INTEGER PRIMARY KEY CHECK (id = 1), who TEXT NOT NULL)');
  const qWho = db.prepare('SELECT who FROM calendar_cache_of WHERE id = 1');
  const qSetWho = db.prepare(
    'INSERT INTO calendar_cache_of (id, who) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET who = excluded.who'
  );
  let pruned = '';
  return {
    get<T>(ym: string, src: string) {
      const r = qGet.get(ym, src) as { at: number; events: string } | undefined;
      if (!r) return null;
      try {
        return { at: r.at, events: JSON.parse(r.events) as T[] };
      } catch {
        return null;
      }
    },
    set<T>(ym: string, src: string, events: T[]) {
      qSet.run(ym, src, now(), JSON.stringify(events));
      // once a day: forget months long gone
      const d = new Date(now());
      const today = d.toISOString().slice(0, 10);
      if (pruned !== today) {
        pruned = today;
        const old = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - KEEP_MONTHS, 1));
        qOld.run(old.toISOString().slice(0, 7));
      }
    },
    clear() {
      qClear.run();
    },
    belongsTo(who: string) {
      const r = qWho.get() as { who: string } | undefined;
      if (r?.who === who) return;
      qClear.run();
      qSetWho.run(who);
    }
  };
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
