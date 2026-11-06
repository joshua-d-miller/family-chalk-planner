// Small settings and lists kept as JSON under a name, in the database's kv table
// (the theme, jars, meals, chores, trash day, hidden holidays...).
import type { DatabaseSync } from 'node:sqlite';

export function makeKv(db: DatabaseSync) {
  db.exec('CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, data TEXT NOT NULL)');
  const qGet = db.prepare('SELECT data FROM kv WHERE key = ?');
  const qSet = db.prepare(
    'INSERT INTO kv (key, data) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data'
  );
  return {
    get<T = unknown>(key: string): T | null {
      const r = qGet.get(key) as { data: string } | undefined;
      return r ? (JSON.parse(r.data) as T) : null;
    },
    set(key: string, value: unknown) {
      qSet.run(key, JSON.stringify(value));
    }
  };
}
export type Kv = ReturnType<typeof makeKv>;
