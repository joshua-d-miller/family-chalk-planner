/*
===============================================================================
 Family Chalk Planner | Screens | Pages | Pantry.tsx
===============================================================================
 Version:   1.2.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-07
 Updated:   2026-11-21

 Purpose:
     The pantry (from Colby Way's board): what food is in the house and
     where, and when it was bought. Search it; tap something to change it
     or use it up. Each item is saved on its own.

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
import type { PantryItem, PantryLoc } from '../../../shared/lists.ts';
import { post } from '../lib/api.ts';
import { useLive } from '../lib/live.ts';
import { useToday } from '../lib/today.ts';
import { RANK } from '../lib/who.ts';
import type { Who } from '../lib/who.ts';
import { Btn, Field, Pick } from '../ui/bits.tsx';
import { Page } from '../ui/Page.tsx';
import { Sheet, useChanged } from '../ui/Sheet.tsx';
import './lists.css';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------- //
// | Where things are kept | //
// ------------------------- //
const LOCS: [PantryLoc, string, string][] = [
  ['pantry', 'Pantry', '🥫'],
  ['fridge', 'Fridge', '🧊'],
  ['freezer', 'Freezer', '❄️'],
  ['basement', 'Basement', '📦'],
  ['other', 'Other', '🧺']
];
type View = { items: PantryItem[] };
const age = (date: string, today: string) => Math.round((Date.parse(today) - Date.parse(date)) / 864e5);

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------- //
// | The pantry page | //
// ------------------- //
export function Pantry({ who }: { who: Who | null }) {
  const live = useLive<View>('api/pantry', ['pantry']);
  const today = useToday().data?.today || new Date().toISOString().slice(0, 10);
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Partial<PantryItem> | null>(null);
  const [err, setErr] = useState('');
  const can = (who?.rank || 0) >= RANK.family;
  const words = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const items = (live.data?.items || []).filter(i =>
    words.every(w => (i.name + ' ' + i.notes).toLowerCase().includes(w))
  );
  const run = async (p: Promise<View>) => {
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
      id="pantry"
      title="Pantry"
      who={who}
      tools={
        can && (
          <Btn kind="go" onClick={() => setEdit({ name: '', loc: 'pantry', qty: '', date: today, notes: '' })}>
            + Add
          </Btn>
        )
      }
    >
      <Field label="Find" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="rice, milk…" />
      <div className="err">{!edit && err}</div>
      {live.data && !live.data.items.length && (
        <div className="empty">The pantry list is empty{can ? ' — tap + Add.' : '.'}</div>
      )}
      <div className="daygrid">
        {LOCS.map(([loc, name, icon]) => {
          const list = items.filter(i => i.loc === loc);
          if (!list.length) return null;
          return (
            <section className="section" key={loc}>
              <h3>
                <span className="emoji" aria-hidden="true">
                  {icon}
                </span>{' '}
                {name}
                <small>{list.length}</small>
              </h3>
              {list.map(i => (
                <button key={i.id} type="button" className="check" disabled={!can} onClick={() => setEdit(i)}>
                  <span className="t">
                    {i.name}
                    {i.qty && <span className="dim"> · {i.qty}</span>}
                    <span className="meta">
                      {age(i.date, today) <= 0 ? 'today' : `${age(i.date, today)} days ago`}
                      {i.notes && ` · ${i.notes}`}
                    </span>
                  </span>
                </button>
              ))}
            </section>
          );
        })}
      </div>
      {edit && (
        <ItemSheet
          item={edit}
          err={err}
          onClose={() => {
            setEdit(null);
            setErr('');
          }}
          onSave={i => run(post('api/pantry/item', { item: i }))}
          onDelete={edit.id ? () => run(post('api/pantry/item/delete', { id: edit.id })) : undefined}
        />
      )}
    </Page>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------------ //
// | Adding or changing an item | //
// ------------------------------ //
function ItemSheet({
  item,
  err,
  onClose,
  onSave,
  onDelete
}: {
  item: Partial<PantryItem>;
  err: string;
  onClose: () => void;
  onSave: (i: Partial<PantryItem>) => void;
  onDelete?: () => void;
}) {
  const [i, setI] = useState(item);
  const changed = useChanged(i); // (✕ with changes: "Discard your changes?")
  return (
    <Sheet title={item.id ? 'Change it' : 'Add to the pantry'} onClose={onClose} dirty={changed}>
      <form
        onSubmit={e => {
          e.preventDefault();
          onSave(i);
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <Field label="What" value={i.name || ''} maxLength={80} onChange={e => setI({ ...i, name: e.target.value })} />
        <div className="row">
          <Pick
            label="Where"
            value={i.loc || 'pantry'}
            onChange={e => setI({ ...i, loc: e.target.value as PantryLoc })}
          >
            {LOCS.map(([v, n]) => (
              <option key={v} value={v}>
                {n}
              </option>
            ))}
          </Pick>
          <Field
            label="How much"
            value={i.qty || ''}
            maxLength={30}
            placeholder="2 cans"
            onChange={e => setI({ ...i, qty: e.target.value })}
          />
        </div>
        <div className="row">
          <Field label="Bought" type="date" value={i.date || ''} onChange={e => setI({ ...i, date: e.target.value })} />
          <Field
            label="Notes"
            value={i.notes || ''}
            maxLength={100}
            onChange={e => setI({ ...i, notes: e.target.value })}
          />
        </div>
        <div className="err">{err}</div>
        <div className="actions">
          {onDelete && (
            <Btn kind="warn" className="left" onClick={onDelete}>
              Used it up
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

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
