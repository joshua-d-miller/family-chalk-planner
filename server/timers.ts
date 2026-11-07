// Timers: several named countdowns shared by every screen. Each is running (endsAt), paused (left) or
// done. Screens count down on their own (using `now` to correct their clock), and the screens chosen
// for it say the timer's name out loud when one ends. From Colby Way's board.
// Saved in the timers table; a screen changes one timer at a time.
import crypto from 'node:crypto';
import type { Express } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import type { Timer, TimersView } from '../shared/lists.ts';
import { tx } from './db.ts';

const MAX = 20;
const DAY = 24 * 3600e3;
const isId = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9]{1,20}$/.test(v);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function cleanTimer(raw: unknown, now = Date.now()): Timer {
  const t = (raw || {}) as Record<string, unknown>;
  const duration = clamp(Math.round(Number(t.duration) || 0) || 60000, 1000, DAY);
  const state = t.state === 'paused' || t.state === 'done' ? t.state : 'running';
  const out: Timer = {
    id: isId(t.id) ? t.id : 't' + crypto.randomBytes(5).toString('hex'),
    name:
      String(t.name ?? '')
        .replace(/[\r\n<>]/g, ' ')
        .trim()
        .slice(0, 60) || 'Timer',
    duration,
    state
  };
  if (state === 'running') out.endsAt = clamp(Math.round(Number(t.endsAt)) || now + duration, now - 3600e3, now + DAY);
  if (state === 'paused') out.left = clamp(Math.round(Number(t.left)) || duration, 0, DAY);
  if (state === 'done') out.doneAt = Math.round(Number(t.doneAt)) || now;
  return out;
}

export function setup({
  app,
  db,
  broadcast
}: {
  app: Express;
  db: DatabaseSync;
  broadcast: (event: string, data: unknown) => void;
}) {
  type Row = {
    id: string;
    name: string;
    duration: number;
    state: Timer['state'];
    ends_at: number | null;
    left_ms: number | null;
    done_at: number | null;
  };
  const q = {
    all: db.prepare('SELECT * FROM timers ORDER BY created, rowid'),
    one: db.prepare('SELECT id FROM timers WHERE id = ?'),
    count: db.prepare('SELECT COUNT(*) AS n FROM timers'),
    put: db.prepare(
      `INSERT INTO timers (id, name, duration, state, ends_at, left_ms, done_at, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, duration = excluded.duration, state = excluded.state,
         ends_at = excluded.ends_at, left_ms = excluded.left_ms, done_at = excluded.done_at`
    ),
    del: db.prepare('DELETE FROM timers WHERE id = ?')
  };
  const toTimer = (r: Row): Timer => ({
    id: r.id,
    name: r.name,
    duration: r.duration,
    state: r.state,
    ...(r.ends_at != null ? { endsAt: r.ends_at } : {}),
    ...(r.left_ms != null ? { left: r.left_ms } : {}),
    ...(r.done_at != null ? { doneAt: r.done_at } : {})
  });
  const put = (t: Timer) =>
    q.put.run(t.id, t.name, t.duration, t.state, t.endsAt ?? null, t.left ?? null, t.doneAt ?? null, Date.now());
  const view = (): TimersView => ({ items: (q.all.all() as Row[]).map(toTimer), now: Date.now() });
  const changed = () => {
    const v = view();
    broadcast('timers', v);
    return v;
  };

  app.get('/api/timers', (_req, res) => res.json(view()));
  app.post('/api/timers', (req, res) => {
    const list = (req.body || {}).items;
    if (!Array.isArray(list)) return res.status(400).json({ error: 'bad timers' });
    const seen = new Set<string>();
    const items = list
      .slice(0, MAX)
      .map(t => cleanTimer(t))
      .filter(t => !seen.has(t.id) && seen.add(t.id));
    tx(db, () => {
      db.exec('DELETE FROM timers');
      items.forEach(put);
    });
    res.json(changed());
  });
  // one timer: started, paused, resumed, finished, renamed
  app.post('/api/timers/item', (req, res) => {
    const t = cleanTimer((req.body || {}).timer);
    if (!q.one.get(t.id) && (q.count.get() as { n: number }).n >= MAX)
      return res.status(400).json({ error: `Up to ${MAX} timers at once` });
    put(t);
    res.json(changed());
  });
  app.post('/api/timers/item/delete', (req, res) => {
    const id = (req.body || {}).id;
    if (isId(id)) q.del.run(id);
    res.json(changed());
  });
}
