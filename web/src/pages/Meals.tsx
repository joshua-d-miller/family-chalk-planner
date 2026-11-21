/*
===============================================================================
 Family Chalk Planner | Screens | Pages | Meals.tsx
===============================================================================
 Version:   1.2.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-07
 Updated:   2026-11-21

 Purpose:
     The meal plan, by day of the week (from Colby Way's board), plus
     meals not on a day yet. Tap a meal to tick it off; ✎ to change it.
     Each meal is saved on its own.

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
import type { Meal, MealDay, Meals as MealsData } from '../../../shared/lists.ts';
import { post } from '../lib/api.ts';
import { useLive } from '../lib/live.ts';
import { DAY_KEYS, DAY_NAMES, dowOf, useToday, weekOrder } from '../lib/today.ts';
import { RANK } from '../lib/who.ts';
import type { Who } from '../lib/who.ts';
import { Btn, Field, Pick } from '../ui/bits.tsx';
import { Page } from '../ui/Page.tsx';
import { Sheet, useChanged } from '../ui/Sheet.tsx';
import './lists.css';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------ //
// | The meals page | //
// ------------------ //
export function Meals({ who }: { who: Who | null }) {
  const live = useLive<MealsData>('api/meals', ['meals']);
  const today = useToday().data;
  const [edit, setEdit] = useState<Partial<Meal> | null>(null);
  const [err, setErr] = useState('');
  const can = (who?.rank || 0) >= RANK.family;
  const items = live.data?.items || [];
  const todayKey = today ? DAY_KEYS[dowOf(today.today)] : '';
  const days: MealDay[] = [...weekOrder(today?.weekStart || 0).map(i => DAY_KEYS[i]), ''];

  async function save(m: Partial<Meal>) {
    setErr('');
    try {
      live.set(await post<MealsData>('api/meals/item', { meal: m }));
      setEdit(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  async function remove(id: string) {
    live.set(await post<MealsData>('api/meals/item/delete', { id }));
    setEdit(null);
  }

  return (
    <Page
      id="meals"
      title="Meal plan"
      who={who}
      tools={
        can && (
          <Btn kind="go" onClick={() => setEdit({ t: '', day: todayKey as MealDay, done: false })}>
            + Meal
          </Btn>
        )
      }
    >
      <div className="err">{!edit && err}</div>
      {live.data && !items.length && <div className="empty">Nothing planned yet{can ? ' — tap + Meal.' : '.'}</div>}
      <div className="daygrid">
        {days.map(day => {
          const list = items.filter(m => m.day === day);
          if (!list.length && (day === '' || !can)) return null;
          const name = day ? DAY_NAMES[DAY_KEYS.indexOf(day)] : 'Any day';
          return (
            <section key={day || 'none'} className={'section day' + (day === todayKey ? ' today' : '')}>
              <h3>
                {name}
                {day === todayKey && <small>today</small>}
              </h3>
              {list.map(m => (
                <div className="lrow" key={m.id}>
                  <button
                    type="button"
                    className={'check' + (m.done ? ' done' : '')}
                    aria-pressed={m.done}
                    disabled={!can}
                    onClick={() => save({ ...m, done: !m.done })}
                  >
                    <span className="box" aria-hidden="true">
                      {m.done ? '✓' : ''}
                    </span>
                    <span className="t">{m.t}</span>
                  </button>
                  {can && (
                    <Btn kind="round" aria-label={`Change ${m.t}`} onClick={() => setEdit(m)}>
                      ✎
                    </Btn>
                  )}
                </div>
              ))}
              {can && !list.length && (
                <button type="button" className="add" onClick={() => setEdit({ t: '', day, done: false })}>
                  + Plan {name}
                </button>
              )}
            </section>
          );
        })}
      </div>
      {edit && (
        <MealSheet
          meal={edit}
          days={days}
          err={err}
          onClose={() => {
            setEdit(null);
            setErr('');
          }}
          onSave={save}
          onDelete={edit.id ? () => remove(edit.id!) : undefined}
        />
      )}
    </Page>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------------------------- //
// | Adding or changing a meal | //
// ----------------------------- //
function MealSheet({
  meal,
  days,
  err,
  onClose,
  onSave,
  onDelete
}: {
  meal: Partial<Meal>;
  days: MealDay[];
  err: string;
  onClose: () => void;
  onSave: (m: Partial<Meal>) => void;
  onDelete?: () => void;
}) {
  const [m, setM] = useState(meal);
  const changed = useChanged(m); // (✕ with changes: "Discard your changes?")
  return (
    <Sheet title={meal.id ? 'Change the meal' : 'Plan a meal'} onClose={onClose} dirty={changed}>
      <form
        onSubmit={e => {
          e.preventDefault();
          onSave(m);
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <Field
          label="What’s for dinner"
          value={m.t || ''}
          maxLength={60}
          onChange={e => setM({ ...m, t: e.target.value })}
        />
        <Pick label="Day" value={m.day || ''} onChange={e => setM({ ...m, day: e.target.value as MealDay })}>
          {days.map(d => (
            <option key={d} value={d}>
              {d ? DAY_NAMES[DAY_KEYS.indexOf(d)] : 'Any day'}
            </option>
          ))}
        </Pick>
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

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
