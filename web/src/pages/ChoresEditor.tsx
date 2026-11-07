/*
===============================================================================
 Family Chalk Planner | Screens | Pages | ChoresEditor.tsx
===============================================================================
 Version:   0.13.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-07
 Updated:   2026-11-07

 Purpose:
     Changing the chores (signed-in people): the people, and each chore's
     name, who does it, how often and how many times. Only what changed is
     sent, one chore at a time, so a phone and a tablet changing the list
     at once don't undo each other.

 Used by:
     web/src/pages/Chores.tsx
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    The new screens (React + TypeScript): meal
                        colby     plan, reminders, timers, pantry, jars and
                        claude    chores.
===============================================================================
*/

import { useState } from 'react';
import type { Chore, ChoreList, ChoresView, Every, Person } from '../../../shared/chores.ts';
import { post } from '../lib/api.ts';
import { Btn, Segs } from '../ui/bits.tsx';
import { Sheet } from '../ui/Sheet.tsx';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------- //
// | How often | //
// ------------- //
const EVERY: [Every, string][] = [
  ['day', 'Every day'],
  ['week', 'Every week'],
  ['month', 'Every month']
];
const newId = (p: string) => p + Math.random().toString(36).slice(2, 10);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------------- //
// | Editing the chores | //
// ---------------------- //
// The whole list is edited here and saved at once; an example list can be   //
// loaded to start from.                                                     //
export function ChoresEditor({
  data,
  onClose,
  onSaved
}: {
  data: ChoreList;
  onClose: () => void;
  onSaved: (v: ChoresView) => void;
}) {
  const strip = (c: Chore): Chore => ({
    id: c.id,
    title: c.title,
    who: c.who,
    every: c.every,
    times: c.times,
    ...(c.each ? { each: true } : {})
  });
  const [people, setPeople] = useState<Person[]>(data.people);
  const [chores, setChores] = useState<Chore[]>(data.chores.map(strip));
  const [tab, setTab] = useState<Every>('day');
  const [focus, setFocus] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const change = (id: string, f: Partial<Chore>) => setChores(cs => cs.map(c => (c.id === id ? { ...c, ...f } : c)));

  async function save() {
    setErr('');
    setBusy(true);
    try {
      let v: ChoresView | null = null;
      const ppl = people.filter(p => p.name.trim());
      if (!same(ppl, data.people)) v = await post<ChoresView>('api/chores/people', { people: ppl });
      const before = new Map(data.chores.map(c => [c.id, strip(c)]));
      const ids = new Set(ppl.map(p => p.id));
      const keep = chores
        .map(c =>
          strip({
            ...c,
            who: c.who.filter(id => ids.has(id)),
            each: c.each && c.who.filter(id => ids.has(id)).length > 1
          })
        )
        .filter(c => c.title.trim() && c.who.length);
      for (const c of keep) if (!same(before.get(c.id), c)) v = await post<ChoresView>('api/chores/item', { chore: c });
      for (const id of before.keys())
        if (!keep.some(c => c.id === id)) v = await post<ChoresView>('api/chores/item/delete', { id });
      if (v) onSaved(v);
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function example() {
    if (!confirm('Replace the list with an example family schedule? You can rename the people and change anything.'))
      return;
    try {
      onSaved(await post<ChoresView>('api/chores/save', { example: true }));
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <Sheet title="Change the chores" onClose={onClose} id="chedmodal">
      <section>
        <div className="dim small">The family</div>
        <div id="chedPeople" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {people.map((p, i) => (
            <div className="row" key={p.id}>
              <label className="field">
                <span className="sr">Name</span>
                <input
                  value={p.name}
                  maxLength={20}
                  placeholder="Name"
                  onChange={e => setPeople(ps => ps.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                />
              </label>
              <div className="fixed">
                <Segs
                  label={`${p.name} is`}
                  value={p.kid ? 'kid' : 'grown'}
                  options={[
                    ['grown', 'Grown-up'],
                    ['kid', 'Kid']
                  ]}
                  onChange={v =>
                    setPeople(ps =>
                      ps.map((x, j) =>
                        j === i ? { id: x.id, name: x.name, ...(v === 'kid' ? { kid: true } : {}) } : x
                      )
                    )
                  }
                />
              </div>
              <Btn
                className="fixed"
                aria-label={`Remove ${p.name}`}
                onClick={() => setPeople(ps => ps.filter((_, j) => j !== i))}
              >
                ✕
              </Btn>
            </div>
          ))}
        </div>
        {people.length < 8 && (
          <Btn style={{ marginTop: 8 }} onClick={() => setPeople(ps => [...ps, { id: newId('p'), name: '' }])}>
            + Someone
          </Btn>
        )}
      </section>
      <div id="chedTabs">
        <Segs value={tab} options={EVERY} onChange={setTab} label="How often" />
      </div>
      <div id="chedList" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {chores
          .filter(c => c.every === tab)
          .map(c => (
            <div className="chedc" key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="row">
                <label className="field">
                  <span>Chore</span>
                  <input
                    value={c.title}
                    maxLength={60}
                    autoFocus={focus === c.id}
                    onChange={e => change(c.id, { title: e.target.value })}
                  />
                </label>
                <label className="field fixed" style={{ width: 120 }}>
                  <span>Times</span>
                  <select value={c.times} onChange={e => change(c.id, { times: +e.target.value })}>
                    {[1, 2, 3, 4, 5, 6, 7].map(n => (
                      <option key={n} value={n}>
                        {n === 1 ? 'Once' : `${n} times`}
                      </option>
                    ))}
                  </select>
                </label>
                <Btn
                  className="fixed"
                  aria-label={`Remove ${c.title || 'this chore'}`}
                  onClick={() => setChores(cs => cs.filter(x => x.id !== c.id))}
                >
                  ✕
                </Btn>
              </div>
              <div className="segs who">
                {people.map(p => {
                  const on = c.who.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={'seg' + (on ? ' on' : '')}
                      aria-pressed={on}
                      onClick={() => change(c.id, { who: on ? c.who.filter(x => x !== p.id) : [...c.who, p.id] })}
                    >
                      {p.name || '?'}
                    </button>
                  );
                })}
                {c.who.length > 1 && (
                  <button
                    type="button"
                    className={'seg' + (c.each ? ' on' : '')}
                    aria-pressed={!!c.each}
                    onClick={() => change(c.id, { each: !c.each })}
                  >
                    Each does their own
                  </button>
                )}
              </div>
            </div>
          ))}
      </div>
      <Btn
        id="chedAddC"
        onClick={() => {
          const id = newId('c');
          setChores(cs => [...cs, { id, title: '', who: [], every: tab, times: 1 }]);
          setFocus(id);
        }}
      >
        + Chore
      </Btn>
      <div className="err">{err}</div>
      <div className="actions">
        <Btn className="left" onClick={example}>
          Start from an example
        </Btn>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn kind="go" id="chedSave" onClick={save} disabled={busy}>
          Save
        </Btn>
      </div>
    </Sheet>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
