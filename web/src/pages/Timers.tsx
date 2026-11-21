/*
===============================================================================
 Family Chalk Planner | Screens | Pages | Timers.tsx
===============================================================================
 Version:   1.2.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-07
 Updated:   2026-11-21

 Purpose:
     Timers (from Colby Way's board): several at once, shared by every
     screen. When one ends, the screens chosen for it (here: "Say it out
     loud on this screen") say its name.

 Used by:
     web/src/App.tsx
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    The new screens (React + TypeScript): meal
                        colby     plan, reminders, timers, pantry, jars and
                        claude    chores.

 1.2.0    2026-11-21   joshua    "Discard your changes?" when it's closed
                        claude    with changes.
===============================================================================
*/

import { useState } from 'react';
import type { Timer } from '../../../shared/lists.ts';
import { fmtLeft, left, say, setSpeaksHere, speaksHere, useTimers } from '../lib/timers.ts';
import { RANK } from '../lib/who.ts';
import type { Who } from '../lib/who.ts';
import { Btn, Field } from '../ui/bits.tsx';
import { Page } from '../ui/Page.tsx';
import { Sheet, useChanged } from '../ui/Sheet.tsx';
import './lists.css';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------------- //
// | Quick times | //
// --------------- //
const QUICK = [1, 3, 5, 10, 15, 20, 30, 45, 60];

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------- //
// | The timers page | //
// ------------------- //
export function Timers({ who }: { who: Who | null }) {
  const { timers, now, change, remove, loaded } = useTimers();
  const [adding, setAdding] = useState(false);
  const [speak, setSpeak] = useState(speaksHere());
  const [err, setErr] = useState('');
  const can = (who?.rank || 0) >= RANK.family;
  const act = (p: Promise<unknown>) =>
    p.then(
      () => setErr(''),
      e => setErr((e as Error).message)
    );
  const start = (t: Timer) =>
    act(change({ ...t, state: 'running', endsAt: now + (t.state === 'paused' ? t.left || t.duration : t.duration) }));
  return (
    <Page
      id="timers"
      title="Timers"
      who={who}
      tools={
        can && (
          <Btn kind="go" onClick={() => setAdding(true)}>
            + Timer
          </Btn>
        )
      }
    >
      <div className="err">{err}</div>
      {loaded && !timers.length && <div className="empty">No timers running{can ? ' — tap + Timer.' : '.'}</div>}
      <div className="daygrid">
        {timers.map(t => {
          const ms = left(t, now);
          return (
            <section className={'section timer ' + t.state} key={t.id}>
              <h3>{t.name}</h3>
              <div className="tleft chalk" aria-live={t.state === 'done' ? 'assertive' : 'off'}>
                {t.state === 'done' ? 'Done!' : fmtLeft(ms)}
              </div>
              {can && (
                <div className="segs">
                  {t.state === 'running' && (
                    <Btn onClick={() => act(change({ ...t, state: 'paused', left: ms }))}>Pause</Btn>
                  )}
                  {t.state === 'paused' && (
                    <Btn kind="go" onClick={() => start(t)}>
                      Go on
                    </Btn>
                  )}
                  {t.state !== 'running' && <Btn onClick={() => start({ ...t, state: 'done' })}>Again</Btn>}
                  <Btn onClick={() => act(remove(t.id))}>{t.state === 'done' ? 'Clear' : 'Stop'}</Btn>
                </div>
              )}
            </section>
          );
        })}
      </div>
      <label className="check" style={{ marginTop: 20 }}>
        <input
          type="checkbox"
          checked={speak}
          onChange={e => {
            setSpeaksHere(e.target.checked);
            setSpeak(e.target.checked);
            if (e.target.checked) say('This screen will say when a timer is done');
          }}
        />
        <span className="t">Say it out loud on this screen when a timer is done</span>
      </label>
      {adding && (
        <NewTimer
          onClose={() => setAdding(false)}
          onStart={(name, minutes) => {
            const duration = Math.round(minutes * 60000);
            act(change({ name, duration, state: 'running', endsAt: now + duration }));
            setAdding(false);
          }}
        />
      )}
    </Page>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------------- //
// | A new timer | //
// --------------- //
function NewTimer({ onClose, onStart }: { onClose: () => void; onStart: (name: string, minutes: number) => void }) {
  const [name, setName] = useState('');
  const [min, setMin] = useState(10);
  const changed = useChanged({ name, min }); // (✕ with changes: "Discard your changes?")
  return (
    <Sheet title="A new timer" onClose={onClose} dirty={changed}>
      <form
        onSubmit={e => {
          e.preventDefault();
          onStart(name.trim() || 'Timer', min);
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <Field
          label="What for"
          value={name}
          maxLength={60}
          placeholder="Pasta"
          onChange={e => setName(e.target.value)}
        />
        <div className="segs" aria-label="Minutes">
          {QUICK.map(m => (
            <button key={m} type="button" className={'seg' + (m === min ? ' on' : '')} onClick={() => setMin(m)}>
              {m < 60 ? `${m} min` : '1 hour'}
            </button>
          ))}
        </div>
        <Field
          label="Minutes"
          type="number"
          min={1}
          max={1440}
          value={min}
          onChange={e => setMin(Math.max(1, +e.target.value || 1))}
        />
        <div className="actions">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn kind="go" type="submit">
            Start
          </Btn>
        </div>
      </form>
    </Sheet>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
