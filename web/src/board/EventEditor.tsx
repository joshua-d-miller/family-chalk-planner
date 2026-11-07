// Adding or changing an event: what, when, how long (or all day, through another day), which calendar,
// and the board-only extras: a color, a size, a countdown star. A repeating event asks "just this one"
// or "all of them". Changes go to everyone's calendar.
import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, post } from '../lib/api.ts';
import { Btn, Segs } from '../ui/bits.tsx';
import { Colors } from '../ui/Colors.tsx';
import { Sheet } from '../ui/Sheet.tsx';
import type { BoardEvent, WritableCal } from './Month.tsx';

const LENGTHS: [number, string][] = [
  [30, '30 minutes'],
  [60, '1 hour'],
  [90, '1½ hours'],
  [120, '2 hours'],
  [180, '3 hours'],
  [240, '4 hours']
];

export function EventEditor({
  ev,
  date,
  calendars,
  onClose,
  onSaved
}: {
  ev: BoardEvent | null; // null: a new one
  date: string; // a new one's day
  calendars: WritableCal[];
  onClose: () => void;
  onSaved: (dates: string[]) => void;
}) {
  const [title, setTitle] = useState(ev?.title || '');
  const [day, setDay] = useState(ev?.start || date);
  const [allDay, setAllDay] = useState(!!ev?.allDay);
  const [time, setTime] = useState(ev?.hm || '17:00');
  const [len, setLen] = useState(ev?.minutes || 60);
  const [thru, setThru] = useState(ev?.allDay && ev.end !== ev.start ? ev.end : '');
  const [count, setCount] = useState(!!ev?.countdown);
  const [color, setColor] = useState<string | null>(ev?.color || null);
  const [size, setSize] = useState<'' | 'l' | 'xl'>(ev?.size || '');
  const [scope, setScope] = useState<'one' | 'all'>('one');
  const [cal, setCal] = useState(calendars.find(c => c.main)?.id || calendars[0]?.id || '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const lens = LENGTHS.some(([m]) => m === len) ? LENGTHS : [...LENGTHS, [len, `${len} minutes`] as [number, string]];
  const sc = ev?.recurring ? scope : 'all';

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    const body: Record<string, unknown> = { title, date: day, allDay, time, minutes: len, through: thru || undefined };
    try {
      let ref: { href: string; rid: string | null } | null;
      if (ev?.ref) {
        await post('api/events/update', { ...body, ref: ev.ref, scope: sc, origDate: ev.start });
        ref = { href: ev.ref.href, rid: sc === 'one' ? ev.ref.rid || null : null };
      } else {
        const r = await post<{ href?: string }>('api/events', { ...body, calendarId: cal || undefined });
        ref = r.href ? { href: r.href, rid: null } : null;
      }
      // the board-only marks follow the event (a new one says where the calendar put it)
      if (ref) {
        const marks: Promise<unknown>[] = [];
        if (count || ev?.countdown) marks.push(post('api/countdowns', { ref, title, date: day, on: count }));
        if (color !== (ev?.color || null)) marks.push(post('api/evcolor', { ref, color }));
        if (size !== (ev?.size || '')) marks.push(post('api/evsize', { ref, size: size || null }));
        await Promise.allSettled(marks);
      }
      onSaved([day, ev?.start || day]);
    } catch (x) {
      setErr((x as Error).message);
      if ((x as ApiError).status === 409) onSaved([]); // changed meanwhile: show the calendar as it is now
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!ev?.ref) return;
    const q =
      ev.recurring && scope === 'all'
        ? `Delete every “${ev.title}” in the series?`
        : ev.recurring
          ? `Delete “${ev.title}” on just this day?`
          : `Delete “${ev.title}”?`;
    if (!confirm(q + ' It will be removed from everyone’s calendar.')) return;
    setBusy(true);
    setErr('');
    try {
      const whole = !ev.recurring || scope === 'all';
      const tidy: Promise<unknown>[] = [];
      if (ev.countdown) tidy.push(post('api/countdowns', { ref: ev.ref, title: ev.title, date: ev.start, on: false }));
      if (ev.color && whole) tidy.push(post('api/evcolor', { ref: { href: ev.ref.href }, color: null }));
      if (ev.size && whole) tidy.push(post('api/evsize', { ref: { href: ev.ref.href }, size: null }));
      await Promise.allSettled(tidy);
      await post('api/events/delete', { ref: ev.ref, scope: ev.recurring ? scope : 'all', origDate: ev.start });
      onSaved([ev.start]);
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={ev ? 'Change this event' : 'Add to the calendar'} onClose={onClose} id="evSheet">
      <form className="evform" onSubmit={save}>
        <label className="field">
          <span>What</span>
          <input
            id="evTitle"
            type="text"
            maxLength={200}
            autoComplete="off"
            required
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
        </label>
        <div className="row">
          <label className="field">
            <span>Day</span>
            <input id="evDate" type="date" required value={day} onChange={e => setDay(e.target.value)} />
          </label>
          {allDay ? (
            <label className="field">
              <span>Through (optional)</span>
              <input id="evThru" type="date" value={thru} min={day} onChange={e => setThru(e.target.value)} />
            </label>
          ) : (
            <>
              <label className="field">
                <span>Time</span>
                <input id="evTime" type="time" value={time} onChange={e => setTime(e.target.value)} />
              </label>
              <label className="field">
                <span>How long</span>
                <select id="evLen" value={len} onChange={e => setLen(+e.target.value)}>
                  {lens.map(([m, t]) => (
                    <option key={m} value={m}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
        </div>
        <label className="tick">
          <input id="evAllDay" type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)} /> All day
        </label>
        <label className="tick">
          <input id="evCount" type="checkbox" checked={count} onChange={e => setCount(e.target.checked)} /> ⭐ Count
          down to this
        </label>
        {!ev && calendars.length > 1 && (
          <label className="field">
            <span>Calendar</span>
            <select id="evCal" value={cal} onChange={e => setCal(e.target.value)}>
              {calendars.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="sublbl">Color on the board</div>
        <Colors value={color} onChange={setColor} none="The usual color" label="Color on the board" />
        <div className="sublbl">Size on the board</div>
        <div id="evSize">
          <Segs
            value={size}
            onChange={setSize}
            label="Size on the board"
            options={[
              ['', 'Normal'],
              ['l', 'Large'],
              ['xl', 'Extra large']
            ]}
          />
        </div>
        {ev?.recurring && (
          <Segs
            value={scope}
            onChange={setScope}
            label="Which events"
            options={[
              ['one', 'Just this one'],
              ['all', 'All of them']
            ]}
          />
        )}
        <div className="err" role="alert">
          {err}
        </div>
        <div className="actions">
          {ev?.ref && (
            <Btn kind="warn" className="left" disabled={busy} onClick={remove} id="evDelete">
              Delete
            </Btn>
          )}
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn kind="go" type="submit" disabled={busy} id="evSave">
            {ev ? 'Save' : 'Add'}
          </Btn>
        </div>
      </form>
    </Sheet>
  );
}
