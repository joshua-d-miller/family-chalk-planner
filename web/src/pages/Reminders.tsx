// Reminders (from Colby Way's board): "always" ones stay until ticked off; timed ones pop up on the board
// screens at their time, every day or once. Each is saved on its own.
import { useState } from 'react';
import type { Reminder, RemindersView } from '../../../shared/lists.ts';
import { post } from '../lib/api.ts';
import { useLive } from '../lib/live.ts';
import { fmtTime, useToday } from '../lib/today.ts';
import { RANK } from '../lib/who.ts';
import type { Who } from '../lib/who.ts';
import { Btn, Field, Segs } from '../ui/bits.tsx';
import { Page } from '../ui/Page.tsx';
import { Sheet } from '../ui/Sheet.tsx';
import './lists.css';

const blank: Partial<Reminder> = { title: '', mode: 'always', time: '09:00', repeat: 'daily', important: true };
// ticked off for now: an always-on one until unticked, a daily one for today
export const isDone = (r: Reminder, today: string) =>
  r.mode === 'time' && r.repeat === 'daily' ? r.ackDate === today : r.done;

export function Reminders({ who }: { who: Who | null }) {
  const live = useLive<RemindersView>('api/reminders', ['reminders']);
  const time24 = !!useToday().data?.time24;
  const [edit, setEdit] = useState<Partial<Reminder> | null>(null);
  const [err, setErr] = useState('');
  const can = (who?.rank || 0) >= RANK.family;
  const v = live.data;
  const items = v?.items || [];
  const groups: [string, Reminder[]][] = [
    ['Until they’re done', items.filter(r => r.mode === 'always')],
    ['At a time', items.filter(r => r.mode === 'time').sort((a, b) => a.time.localeCompare(b.time))]
  ];
  const run = async (p: Promise<RemindersView>) => {
    setErr('');
    try {
      live.set(await p);
      setEdit(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <Page
      id="reminders"
      title="Reminders"
      who={who}
      tools={
        can && (
          <Btn kind="go" onClick={() => setEdit({ ...blank })}>
            + Reminder
          </Btn>
        )
      }
    >
      <div className="err">{!edit && err}</div>
      {v && !items.length && <div className="empty">No reminders{can ? ' — tap + Reminder.' : '.'}</div>}
      {groups.map(
        ([title, list]) =>
          list.length > 0 && (
            <section className="section" key={title}>
              <h3>{title}</h3>
              {list.map(r => {
                const done = !!v && isDone(r, v.today);
                return (
                  <div className="lrow" key={r.id}>
                    <button
                      type="button"
                      className={'check' + (done ? ' done' : '')}
                      aria-pressed={done}
                      disabled={!can}
                      onClick={() => run(post('api/reminders/check', { id: r.id, done: !done }))}
                    >
                      <span className="box" aria-hidden="true">
                        {done ? '✓' : ''}
                      </span>
                      <span className="t">
                        {r.important && <span aria-label="important">❗ </span>}
                        {r.title}
                        {r.mode === 'time' && (
                          <span className="meta">
                            {fmtTime(r.time, time24)} · {r.repeat === 'daily' ? 'every day' : 'once'}
                          </span>
                        )}
                      </span>
                    </button>
                    {can && (
                      <Btn kind="round" aria-label={`Change ${r.title}`} onClick={() => setEdit(r)}>
                        ✎
                      </Btn>
                    )}
                  </div>
                );
              })}
            </section>
          )
      )}
      {edit && (
        <ReminderSheet
          r={edit}
          err={err}
          onClose={() => {
            setEdit(null);
            setErr('');
          }}
          onSave={r => run(post('api/reminders/item', { reminder: r }))}
          onDelete={edit.id ? () => run(post('api/reminders/item/delete', { id: edit.id })) : undefined}
        />
      )}
    </Page>
  );
}

function ReminderSheet({
  r: start,
  err,
  onClose,
  onSave,
  onDelete
}: {
  r: Partial<Reminder>;
  err: string;
  onClose: () => void;
  onSave: (r: Partial<Reminder>) => void;
  onDelete?: () => void;
}) {
  const [r, setR] = useState(start);
  return (
    <Sheet title={start.id ? 'Change the reminder' : 'A new reminder'} onClose={onClose}>
      <form
        onSubmit={e => {
          e.preventDefault();
          onSave(r);
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <Field
          label="Remind us to…"
          value={r.title || ''}
          maxLength={100}
          onChange={e => setR({ ...r, title: e.target.value })}
        />
        <Segs
          label="When"
          value={r.mode || 'always'}
          options={[
            ['always', 'Until it’s done'],
            ['time', 'At a time']
          ]}
          onChange={mode => setR({ ...r, mode })}
        />
        {r.mode === 'time' && (
          <div className="row">
            <Field
              label="Time"
              type="time"
              value={r.time || '09:00'}
              onChange={e => setR({ ...r, time: e.target.value })}
            />
            <div>
              <Segs
                label="How often"
                value={r.repeat || 'daily'}
                options={[
                  ['daily', 'Every day'],
                  ['once', 'Just once']
                ]}
                onChange={repeat => setR({ ...r, repeat })}
              />
            </div>
          </div>
        )}
        <label className="check" style={{ minHeight: 44 }}>
          <input type="checkbox" checked={!!r.important} onChange={e => setR({ ...r, important: e.target.checked })} />
          <span className="t">Important (pops up on the board{r.mode === 'time' ? ' at its time' : ''})</span>
        </label>
        <div className="err">{err}</div>
        <div className="actions">
          {onDelete && (
            <Btn kind="warn" className="left" onClick={onDelete}>
              Remove
            </Btn>
          )}
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn kind="go" type="submit">
            Save
          </Btn>
        </div>
      </form>
    </Sheet>
  );
}
