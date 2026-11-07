/*
===============================================================================
 Family Chalk Planner | Screens | Pages | Jars.tsx
===============================================================================
 Version:   0.13.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-07
 Updated:   2026-11-07

 Purpose:
     Reward jars: a kid earns a piece, someone drops it in; the jar fills
     up toward its goal. Two screens dropping pieces in at once both
     count.

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

                                  The new board: the family's style, each
                                  month's title and holiday border, polaroids,
                                  drawn jars.

                                  The new screens take over: /, /edit and
                                  /chores are the React board; the old one
                                  stays at /classic.
===============================================================================
*/

import { useState } from 'react';
import type { Jar, JarPiece } from '../../../shared/lists.ts';
import { post } from '../lib/api.ts';
import { useLive } from '../lib/live.ts';
import { RANK } from '../lib/who.ts';
import type { Who } from '../lib/who.ts';
import { Btn } from '../ui/bits.tsx';
import { JarArt } from '../ui/JarArt.tsx';
import { Page } from '../ui/Page.tsx';
import { Sheet } from '../ui/Sheet.tsx';
import './lists.css';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------- //
// | The pieces | //
// -------------- //
export const PIECE: Record<JarPiece, string> = { heart: '❤️', rainbow: '🌈', star: '⭐', bolt: '⚡', critter: '🐞' };

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------------- //
// | The jars page | //
// ----------------- //
// + adds a piece, − takes one back; family screens and signed-in people may //
// change them.                                                              //
export function Jars({ who }: { who: Who | null }) {
  const live = useLive<Jar[]>('api/jars', ['jars']);
  const [err, setErr] = useState('');
  const can = (who?.rank || 0) >= RANK.family;
  const piece = (body: Record<string, unknown>) =>
    post<Jar[]>('api/jars/piece', body).then(live.set, e => setErr((e as Error).message));
  const jars = live.data || [];
  const [edit, setEdit] = useState<Jar | null>(null);
  // the whole list goes back (jars are only added, renamed or emptied now and then)
  const saveAll = (list: Jar[]) =>
    post<Jar[]>('api/jars', { jars: list }).then(
      v => (live.set(v), setErr('')),
      e => setErr((e as Error).message)
    );
  return (
    <Page id="jars" title="Reward jars" who={who}>
      <div className="err">{err}</div>
      {live.data && !jars.length && <div className="empty">No jars yet.</div>}
      {can && jars.length < 4 && (
        <Btn
          kind="go"
          className="jaradd"
          onClick={() => setEdit({ id: '', name: '', pieces: ['star'], count: 0, items: [], goal: 20 })}
        >
          + Reward jar
        </Btn>
      )}
      {edit && (
        <JarEditor
          jar={edit}
          onClose={() => setEdit(null)}
          onSave={j => {
            const list = j.id
              ? jars.map(x => (x.id === j.id ? j : x))
              : [...jars, { ...j, id: 'j' + Math.random().toString(36).slice(2, 10) }];
            saveAll(list).then(() => setEdit(null));
          }}
          onRemove={
            edit.id
              ? () => {
                  if (!confirm(`Remove ${edit.name}’s jar from the board?`)) return;
                  saveAll(jars.filter(x => x.id !== edit.id)).then(() => setEdit(null));
                }
              : undefined
          }
          onReward={
            edit.id
              ? () => {
                  if (!confirm(`Reward time for ${edit.name}? This celebrates and empties the jar.`)) return;
                  saveAll(jars.map(x => (x.id === edit.id ? { ...x, count: 0, items: [] } : x))).then(() =>
                    setEdit(null)
                  );
                }
              : undefined
          }
        />
      )}
      <div className="daygrid">
        {jars.map(j => (
          <section className="section jar" key={j.id}>
            <h3>
              {can ? (
                <button
                  type="button"
                  className="jname"
                  aria-label={`Change ${j.name}’s jar`}
                  onClick={() => setEdit(j)}
                >
                  {j.name} ✎
                </button>
              ) : (
                j.name
              )}
              <small>
                {j.count} of {j.goal}
                {j.count >= j.goal && ' 🎉'}
              </small>
            </h3>
            <div className="jarbar" role="progressbar" aria-valuemin={0} aria-valuemax={j.goal} aria-valuenow={j.count}>
              <span style={{ width: `${Math.min(100, (j.count / j.goal) * 100)}%` }} />
            </div>
            <div className="jarpic" aria-label={`${j.count} pieces`}>
              <JarArt jar={j} />
            </div>
            {can && (
              <div className="segs">
                {j.pieces.map(p => (
                  <Btn key={p} kind="go" aria-label={`Add a ${p}`} onClick={() => piece({ id: j.id, piece: p })}>
                    + <span className="emoji">{PIECE[p]}</span>
                  </Btn>
                ))}
                <Btn aria-label="Take one out" disabled={!j.count} onClick={() => piece({ id: j.id, out: true })}>
                  −
                </Btn>
              </div>
            )}
          </section>
        ))}
      </div>
    </Page>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------------- //
// | Editing a jar | //
// ----------------- //
// A jar's name, its goal and what + puts in (in turn); remove it, or empty  //
// it for the reward                                                         //
function JarEditor({
  jar,
  onSave,
  onClose,
  onRemove,
  onReward
}: {
  jar: Jar;
  onSave: (j: Jar) => void;
  onClose: () => void;
  onRemove?: () => void;
  onReward?: () => void;
}) {
  const [j, setJ] = useState(jar);
  const toggle = (p: JarPiece) => {
    const has = j.pieces.includes(p);
    if (has && j.pieces.length === 1) return;
    setJ({ ...j, pieces: has ? j.pieces.filter(x => x !== p) : [...j.pieces, p] });
  };
  return (
    <Sheet title={jar.id ? jar.name : 'A new jar'} onClose={onClose} id="jarSheet">
      <label className="field">
        <span>Name</span>
        <input id="jName" maxLength={14} value={j.name} onChange={e => setJ({ ...j, name: e.target.value })} />
      </label>
      <div className="row jgoal">
        <span>Goal</span>
        <Btn aria-label="Smaller goal" onClick={() => setJ({ ...j, goal: Math.max(3, j.goal - 1) })}>
          −
        </Btn>
        <b id="jGoal">{j.goal}</b>
        <Btn aria-label="Bigger goal" onClick={() => setJ({ ...j, goal: Math.min(100, j.goal + 1) })}>
          +
        </Btn>
      </div>
      <div className="sublbl">What + adds, in turn</div>
      <div className="segs">
        {(Object.keys(PIECE) as JarPiece[]).map(p => (
          <button
            type="button"
            key={p}
            className={'seg' + (j.pieces.includes(p) ? ' on' : '')}
            aria-pressed={j.pieces.includes(p)}
            onClick={() => toggle(p)}
          >
            <span className="emoji">{PIECE[p]}</span> {p}
          </button>
        ))}
      </div>
      <div className="actions">
        {onRemove && (
          <Btn className="left" onClick={onRemove}>
            Remove
          </Btn>
        )}
        {onReward && (
          <Btn kind="warn" onClick={onReward}>
            🎉 Reward!
          </Btn>
        )}
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn kind="go" id="jSave" disabled={!j.name.trim()} onClick={() => onSave({ ...j, name: j.name.trim() })}>
          Save
        </Btn>
      </div>
    </Sheet>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
