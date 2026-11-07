/*
===============================================================================
 Family Chalk Planner | Screens | Board | Alerts.tsx
===============================================================================
 Version:   0.14.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-07
 Updated:   2026-11-07

 Purpose:
     What pops up on the board: a reminder whose time has come (from Colby
     Way's board), a timer that's done, and the day view when someone taps
     a day on the wall.

 Used by:
     web/src/board/Board.tsx
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    The new wall board: the overnight slideshow,
                        colby     the photo frame, the day view, reminders and
                        claude    timers.

                                  The new screens take over: /, /edit and
                                  /chores are the React board; the old one
                                  stays at /classic.

 0.14.0    2026-11-07   joshua    Hiding a holiday opens Settings in place.
                        claude
===============================================================================
*/

import { navigate } from '../lib/nav.ts';
import { useEffect, useRef, useState } from 'react';
import type { Reminder, RemindersView } from '../../../shared/lists.ts';
import { post } from '../lib/api.ts';
import { useLive } from '../lib/live.ts';
import { useTimers } from '../lib/timers.ts';
import { fmtTime } from '../lib/today.ts';
import { isDone } from '../pages/Reminders.tsx';
import { Btn } from '../ui/bits.tsx';
import { Sheet } from '../ui/Sheet.tsx';
import { readable } from './color.ts';
import { evText } from './Month.tsx';
import type { BoardEvent } from './Month.tsx';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------- //
// | Reminders that pop up | //
// ------------------------- //
const due = (r: Reminder, v: RemindersView) => !isDone(r, v.today) && r.mode === 'time' && v.nowHm >= r.time;

// A timed reminder pops up once when its time comes. OK = seen (a one-off one is then done); ticking one
// off marks it done. Screens that can't change reminders (the wall) just show it.
export function ReminderAlert({ time24 }: { time24: boolean }) {
  const live = useLive<RemindersView>('api/reminders', ['reminders']);
  const v = live.data;
  const popped = useRef(new Set<string>());
  const [open, setOpen] = useState(false);
  // the server says what time it is for the board (its time zone), so ask again every half minute
  useEffect(() => {
    const t = setInterval(live.reload, 30 * 1000);
    return () => clearInterval(t);
  }, [live.reload]);
  useEffect(() => {
    if (!v) return;
    let pop = false;
    for (const r of v.items.filter(r => due(r, v))) {
      const k = `${r.id}:${v.today}:${r.time}`;
      if (!popped.current.has(k)) {
        popped.current.add(k);
        pop = true;
      }
    }
    if (pop) setOpen(true);
  }, [v]);
  if (!open || !v) return null;
  const list = v.items.filter(r => due(r, v));
  const close = () => {
    setOpen(false);
    for (const r of list) post<RemindersView>('api/reminders/check', { id: r.id, ack: true }).then(live.set, () => {});
  };
  if (!list.length) return null;
  return (
    <Sheet title="⏰ Reminder" onClose={close} id="remAlert">
      <div className="remalert">
        {list.map(r => (
          <button
            type="button"
            key={r.id}
            className="rpitem"
            onClick={() =>
              post<RemindersView>('api/reminders/check', { id: r.id, done: true }).then(live.set, () => {})
            }
          >
            <span className="chbox" aria-hidden="true" />
            <span className="ct">{r.title}</span>
            <span className="rtag">{fmtTime(r.time, time24)}</span>
          </button>
        ))}
      </div>
      <div className="actions">
        <Btn kind="go" onClick={close}>
          OK
        </Btn>
      </div>
    </Sheet>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------- //
// | A timer is done | //
// ------------------- //
// A timer that's done: a banner until someone taps it (here), or for 10     //
// minutes                                                                   //
export function TimerDone() {
  const { timers, now } = useTimers();
  const [gone, setGone] = useState<string[]>([]);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick(n => n + 1), 30 * 1000);
    return () => clearInterval(t);
  }, []);
  const clock = Math.max(now, Date.now());
  const done = timers.filter(
    t => t.state === 'done' && clock - (t.doneAt || 0) < 10 * 60 * 1000 && !gone.includes(t.id + ':' + t.doneAt)
  );
  if (!done.length) return null;
  return (
    <div className="timerdone" role="alert">
      {done.map(t => (
        <button type="button" key={t.id} onClick={() => setGone(g => [...g, t.id + ':' + t.doneAt])}>
          ⏰ <b>{t.name}</b> is done!
        </button>
      ))}
    </div>
  );
}

const CARD = 0.0069; // the cards are dark, like the slate

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------------------- //
// | Everything on a day | //
// ----------------------- //
// Everything on one day, big. On the wall a tap anywhere closes it (and it  //
// closes itself after 30 s).                                                //
export function DayView({
  date,
  events,
  onClose,
  onEvent,
  onAdd
}: {
  date: string;
  events: BoardEvent[];
  onClose: () => void;
  onEvent?: (e: BoardEvent) => void;
  onAdd?: () => void;
}) {
  useEffect(() => {
    if (onEvent) return;
    const t = setTimeout(onClose, 30 * 1000);
    return () => clearTimeout(t);
  }, [onClose, onEvent]);
  const p = date.split('-').map(Number);
  const list = events.filter(e => e.start <= date && e.end >= date);
  return (
    <Sheet
      title={new Date(p[0], p[1] - 1, p[2]).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric'
      })}
      onClose={onClose}
      id="dayView"
    >
      <div className={'daylist' + (onEvent ? '' : ' wall')} onClick={onEvent ? undefined : onClose}>
        {list.map((e, i) => {
          const c = e.color || e.calColor;
          return (
            <button
              type="button"
              key={i}
              className={(e.holiday ? 'holiday' : e.allDay ? 'allday' : '') + (e.readOnly ? ' ro' : '')}
              style={c ? { color: readable(c, CARD) } : undefined}
              onClick={
                !onEvent
                  ? undefined
                  : e.holiday
                    ? () => navigate('settings#holidays') // hide it every year
                    : !e.readOnly
                      ? () => onEvent(e)
                      : undefined
              }
            >
              {evText(e)}
              {e.cal ? ' · ' + e.cal : ''}
            </button>
          );
        })}
        {!list.length && <div className="empty">Nothing planned</div>}
      </div>
      {onEvent ? (
        <div className="actions">
          <Btn onClick={onClose}>Close</Btn>
          {onAdd && (
            <Btn kind="go" onClick={onAdd}>
              Add event
            </Btn>
          )}
        </div>
      ) : (
        <div className="tapclose">Tap anywhere to close</div>
      )}
    </Sheet>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
