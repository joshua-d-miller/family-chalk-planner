/*
===============================================================================
 Family Chalk Planner | Server | reminders.ts
===============================================================================
 Version:   0.13.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-07
 Updated:   2026-11-07

 Purpose:
     Reminders: "always" ones stay on the board until ticked off; timed
     ones pop up on the board screens at a time, every day or once, and
     are seen to with a tap. Managed from their own page (/reminders).
     From Colby Way's board. Saved in the reminders table, one at a time.

 Routes:
     GET    /api/reminders
     POST   /api/reminders
     POST   /api/reminders/item
     POST   /api/reminders/item/delete
     POST   /api/reminders/check

 Used by:
     server/main.ts
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    Reminders, timers, the pantry and the right-
                        colby     hand column's pages (server).
                        claude
===============================================================================
*/

import crypto from 'node:crypto';
import type { Express } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import type { Reminder, RemindersView } from '../shared/lists.ts';
import { isDate, pad2 } from './dates.ts';
import type { Clock } from './dates.ts';
import { tx } from './db.ts';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------------------------- //
// | Checking what a screen sends | //
// -------------------------------- //
// A screen can send anything, so every field is checked, and anything       //
// missing or odd falls back to a safe default.                              //
const MAX = 50;
const isId = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9]{1,16}$/.test(v);
const newId = () => 'r' + crypto.randomBytes(5).toString('hex');
const text = (v: unknown, n: number) =>
  String(v ?? '')
    .replace(/[\r\n<>]/g, ' ')
    .trim()
    .slice(0, n);

export function cleanReminder(raw: unknown): Reminder {
  const r = (raw || {}) as Record<string, unknown>;
  return {
    id: isId(r.id) ? r.id : newId(),
    title: text(r.title, 100),
    mode: r.mode === 'time' ? 'time' : 'always',
    time: typeof r.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(r.time) ? r.time : '09:00',
    repeat: r.repeat === 'once' ? 'once' : 'daily',
    important: r.important !== undefined ? !!r.important : true,
    done: !!r.done,
    ackDate: isDate(r.ackDate) ? r.ackDate : null
  };
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------- //
// | The routes | //
// -------------- //
export function setup({
  app,
  db,
  clock,
  broadcast
}: {
  app: Express;
  db: DatabaseSync;
  clock: Clock;
  broadcast: (event: string, data: unknown) => void;
}) {
  type Row = Omit<Reminder, 'important' | 'done' | 'ackDate'> & {
    important: number;
    done: number;
    ack_date: string | null;
  };
  const q = {
    all: db.prepare('SELECT * FROM reminders ORDER BY sort, rowid'),
    one: db.prepare('SELECT * FROM reminders WHERE id = ?'),
    count: db.prepare('SELECT COUNT(*) AS n FROM reminders'),
    put: db.prepare(
      `INSERT INTO reminders (id, title, mode, time, repeat, important, done, ack_date, sort)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT MAX(sort) + 1 FROM reminders), 0))
       ON CONFLICT(id) DO UPDATE SET title = excluded.title, mode = excluded.mode, time = excluded.time,
         repeat = excluded.repeat, important = excluded.important, done = excluded.done, ack_date = excluded.ack_date`
    ),
    del: db.prepare('DELETE FROM reminders WHERE id = ?')
  };
  const toReminder = (r: Row): Reminder => ({
    id: r.id,
    title: r.title,
    mode: r.mode,
    time: r.time,
    repeat: r.repeat,
    important: !!r.important,
    done: !!r.done,
    ackDate: r.ack_date
  });
  const put = (r: Reminder) =>
    q.put.run(r.id, r.title, r.mode, r.time, r.repeat, r.important ? 1 : 0, r.done ? 1 : 0, r.ackDate);
  function view(): RemindersView {
    const now = clock.zoned(new Date());
    return {
      items: (q.all.all() as Row[]).map(toReminder),
      today: now.dateStr,
      nowHm: `${pad2(now.h)}:${pad2(now.mi)}`
    };
  }
  const changed = () => {
    const v = view();
    broadcast('reminders', v);
    return v;
  };

  app.get('/api/reminders', (_req, res) => res.json(view()));

  // ------------------ //
  // | The whole list | //
  // ------------------ //
  // The whole list at once                                                  //
  app.post('/api/reminders', (req, res) => {
    const list = (req.body || {}).items;
    if (!Array.isArray(list)) return res.status(400).json({ error: 'bad reminders' });
    const seen = new Set<string>();
    const items = list
      .slice(0, MAX)
      .map(cleanReminder)
      .filter(r => r.title && !seen.has(r.id) && seen.add(r.id));
    tx(db, () => {
      db.exec('DELETE FROM reminders');
      items.forEach(put);
    });
    res.json(changed());
  });

  // -------------------------- //
  // | One reminder at a time | //
  // -------------------------- //
  // One, added or changed                                                   //
  app.post('/api/reminders/item', (req, res) => {
    const r = cleanReminder((req.body || {}).reminder);
    if (!r.title) return res.status(400).json({ error: 'What’s the reminder?' });
    if (!q.one.get(r.id) && (q.count.get() as { n: number }).n >= MAX)
      return res.status(400).json({ error: `Up to ${MAX} reminders` });
    put(r);
    res.json(changed());
  });
  app.post('/api/reminders/item/delete', (req, res) => {
    const id = (req.body || {}).id;
    if (isId(id)) q.del.run(id);
    res.json(changed());
  });

  // ----------------- //
  // | Done, or seen | //
  // ----------------- //
  // Tick off / untick ({ done }), or "seen it" on a popup ({ ack: true }: a //
  // one-off is then done)                                                   //
  app.post('/api/reminders/check', (req, res) => {
    const { id, done, ack } = req.body || {};
    const row = isId(id) ? (q.one.get(id) as Row | undefined) : undefined;
    if (!row) return res.status(404).json({ error: 'That reminder was removed' });
    const r = toReminder(row);
    const today = clock.today();
    if (ack) {
      r.ackDate = today;
      if (r.mode === 'time' && r.repeat === 'once') r.done = true;
    } else if (r.mode === 'time' && r.repeat === 'daily') {
      const on = done !== undefined ? !!done : r.ackDate !== today;
      r.ackDate = on ? today : null;
    } else {
      r.done = done !== undefined ? !!done : !r.done;
      r.ackDate = r.done ? today : null;
    }
    put(r);
    res.json(changed());
  });
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
