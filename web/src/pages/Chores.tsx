/*
===============================================================================
 Family Chalk Planner | Screens | Pages | Chores.tsx
===============================================================================
 Version:   1.2.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-07
 Updated:   2026-11-21

 Purpose:
     Chores: today's, this week's and this month's, a column per person
     and per group that shares one. Tap to tick off (a chore done several
     times: once per tap). On a kid's tablet: only theirs. Signed-in
     people can change the list (✎). In the Home Assistant app, the to-do
     lists picked in the console follow, ticked off the same way.

 Used by:
     web/src/App.tsx
     web/src/board/Notes.tsx
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

 0.14.0    2026-11-07   joshua    📅 Calendar only on the wall (everywhere else
                        claude    the bar has it).

 1.0.0     2026-11-14   joshua    Home Assistant's to-do lists, under the
                        claude    board's own chores.

 1.1.0    2026-11-17   joshua    A kid's tablet: the next countdown, big,
                        claude    with its paper chain.

 1.2.0    2026-11-21   joshua    The page's ✕ goes back to where a swipe
                        claude    came from (the week or the calendar).
                                  The chores stay in the family's words in
                                  another language.
===============================================================================
*/

import { navigate } from '../lib/nav.ts';
import { useShell } from '../ui/Shell.tsx';
import { useEffect, useMemo, useState } from 'react';
import type { Chore, ChoreProgress, ChoresView, Every, HaTodoView, Person } from '../../../shared/chores.ts';
import { post } from '../lib/api.ts';
import { useCountdowns, useSleeps } from '../lib/countdowns.ts';
import { useLive } from '../lib/live.ts';
import { CountdownCard } from '../board/Countdown.tsx';
import { RANK } from '../lib/who.ts';
import type { Who } from '../lib/who.ts';
import { Btn } from '../ui/bits.tsx';
import { Page } from '../ui/Page.tsx';
import { ChoresEditor } from './ChoresEditor.tsx';
import './chores.css';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------------------- //
// | Daily, weekly, monthly | //
// -------------------------- //
const TABS: [Every, string][] = [
  ['day', 'Today'],
  ['week', 'This week'],
  ['month', 'This month']
];

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------------- //
// | What's on the page | //
// ---------------------- //
interface Entry {
  c: ChoreProgress;
  who: string[];
  person?: string; // an "each their own" chore: whose this one is
  done: number;
}
// what's on the page: shared chores once, "each their own" chores once per person
export function entries(d: ChoresView, every: Every): Entry[] {
  const out: Entry[] = [];
  for (const c of d.chores) {
    if (c.every !== every || (d.mine && !c.who.includes(d.mine))) continue;
    if ('doneEach' in c)
      for (const id of c.who) {
        if (!d.mine || id === d.mine) out.push({ c, who: [id], person: id, done: c.doneEach[id] || 0 });
      }
    else out.push({ c, who: c.who, done: c.done || 0 });
  }
  return out;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------- //
// | The chores page | //
// ------------------- //
// Ticking off (by whoever may), the week's stars, and the way back to the   //
// board: the ← button, a swipe, or a minute untouched when it was opened    //
// from the board.                                                           //
export function Chores({ who }: { who: Who | null }) {
  const live = useLive<ChoresView>('api/chores', ['chores']);
  const d = live.data;
  // a kid's tablet: the next countdown, big, with its paper chain
  const next = useCountdowns()[0];
  const sleeps = useSleeps();
  // Home Assistant's to-do lists (the app): asked again every minute, as they change there too
  const haLive = useLive<HaTodoView>('api/chores/ha', ['chores']);
  const haLists = d?.mine ? [] : haLive.data?.lists || [];
  const haReload = haLive.reload;
  useEffect(() => {
    const t = setInterval(haReload, 60e3);
    return () => clearInterval(t);
  }, [haReload]);
  const [tab, setTab] = useState<Every>('day');
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState('');
  const editor = (who?.rank || 0) >= RANK.editor;
  const shell = useShell(); // the wall has no bar: it gets a way back of its own
  useEffect(() => {
    document.body.classList.add('chorespage');
    return () => document.body.classList.remove('chorespage');
  }, []);
  // opened by a swipe on the board: a swipe (or 📅 Calendar) goes back, and the wall goes back by itself
  const back = useMemo(() => {
    try {
      return sessionStorage.getItem('chalkFromBoard');
    } catch {
      return null;
    }
  }, []);
  const goBack = () => {
    try {
      sessionStorage.removeItem('chalkFromBoard');
    } catch {
      /* fine */
    }
    navigate(back || './');
  };
  useEffect(() => {
    if (!back) return;
    let x0: number | null = null;
    let y0 = 0;
    let idle = setTimeout(goBack, 2 * 60 * 1000);
    const down = (e: PointerEvent) => {
      x0 = e.clientX;
      y0 = e.clientY;
      clearTimeout(idle);
      idle = setTimeout(goBack, 2 * 60 * 1000);
    };
    const up = (e: PointerEvent) => {
      if (x0 === null) return;
      const dx = e.clientX - x0;
      x0 = null;
      if (Math.abs(dx) > 120 && Math.abs(e.clientY - y0) < Math.abs(dx) / 2) goBack();
    };
    addEventListener('pointerdown', down);
    addEventListener('pointerup', up);
    return () => {
      clearTimeout(idle);
      removeEventListener('pointerdown', down);
      removeEventListener('pointerup', up);
    };
  }, [back]);

  const names = useMemo(() => Object.fromEntries((d?.people || []).map((p: Person) => [p.id, p.name])), [d]);
  const order = useMemo(() => Object.fromEntries((d?.people || []).map((p: Person, i: number) => [p.id, i])), [d]);
  const have = d ? TABS.filter(([t]) => entries(d, t).length) : [];
  const shown = have.some(([t]) => t === tab) ? tab : have[0]?.[0] || 'day';
  // ------------------------ //
  // | Who may tick it here | //
  // ------------------------ //
  // Who may tick it here: signed-in people and family screens, anyone's; a  //
  // kid's tablet, their own; the wall, none                                 //
  const can = (en: Entry) => (who?.rank || 0) >= RANK.family || (!!d?.mine && en.who.includes(d.mine));

  async function haTick(list: string, uid: string, done: boolean) {
    if ((who?.rank || 0) < RANK.family) return;
    setErr('');
    try {
      haLive.set(await post<HaTodoView>('api/chores/ha-check', { list, uid, done }));
    } catch (e) {
      setErr((e as Error).message);
      haLive.reload();
    }
  }

  async function tick(en: Entry) {
    if (!d || !can(en)) return;
    const full = en.done >= en.c.times;
    setErr('');
    try {
      const v = await post<ChoresView>('api/chores/check', { id: en.c.id, undo: full, person: en.person });
      live.set({ ...v, mine: d.mine });
    } catch (e) {
      setErr((e as Error).message);
      live.reload();
    }
  }

  // a column per person, and one per group that shares a chore ("Dad & Mom")
  const groups = useMemo(() => {
    if (!d) return [];
    const map = new Map<string, { who: string[]; list: Entry[] }>();
    for (const en of entries(d, shown)) {
      const w = [...en.who].sort((a, b) => order[a] - order[b]);
      const k = w.join(',');
      if (!map.has(k)) map.set(k, { who: w, list: [] });
      map.get(k)!.list.push(en);
    }
    return [...map.values()].sort((a, b) => order[a.who[0]] - order[b.who[0]] || a.who.length - b.who.length);
  }, [d, shown, order]);
  const heading = (g: { who: string[] }) =>
    d?.mine && g.who.length === 1
      ? d.mine === g.who[0]
        ? 'Just me'
        : names[g.who[0]]
      : d?.mine
        ? 'With ' +
          g.who
            .filter(id => id !== d.mine)
            .map(id => names[id])
            .join(' & ')
        : g.who.map(id => names[id]).join(' & ');

  const title = d?.mine && names[d.mine] ? `${names[d.mine]}’s chores` : 'Chores';
  return (
    <Page
      id="chores"
      title={title}
      who={who}
      onClose={back ? goBack : undefined}
      tools={
        <>
          {editor && (
            <Btn id="chEdit" onClick={() => setEditing(true)}>
              ✎ Change the list
            </Btn>
          )}
          {back && shell.kind === 'none' && (
            <Btn id="chBack" onClick={goBack}>
              📅 Calendar
            </Btn>
          )}
        </>
      }
    >
      {d?.mine && next && (
        <div className="chcd">
          <CountdownCard c={next} sleeps={sleeps} chain />
        </div>
      )}
      {d && have.length > 0 && (
        <div className="chtabs" id="chTabs">
          {have.map(([t, label]) => {
            const left = entries(d, t).filter(en => en.done < en.c.times).length;
            return (
              <button key={t} type="button" className={t === shown ? 'on' : ''} onClick={() => setTab(t)}>
                {label}
                <small>{left ? `${left} to do` : 'all done ✓'}</small>
              </button>
            );
          })}
        </div>
      )}
      <div className="err">{err || (live.error && live.error.message)}</div>
      {d && !d.chores.length && !haLists.length && (
        <div className="empty">
          {editor
            ? 'No chores yet — tap “✎ Change the list” to add them (or start from an example).'
            : 'No chores yet. Someone signed in can add them.'}
        </div>
      )}
      <div id="chCols">
        {groups.map(g => {
          const done = g.list.filter(en => en.done >= en.c.times).length;
          return (
            <div className="chcol section" key={g.who.join(',')}>
              <h3>
                {heading(g)}
                <small>
                  {done} / {g.list.length}
                </small>
              </h3>
              {g.list.map(en => {
                const c = en.c;
                const full = en.done >= c.times;
                return (
                  <button
                    key={c.id + (en.person || '')}
                    type="button"
                    className={'check chitem' + (full ? ' done' : '') + (can(en) ? ' can' : '')}
                    aria-pressed={full}
                    disabled={!can(en)}
                    title={full && 'by' in c && c.by ? `Done (${c.by})` : undefined}
                    onClick={() => tick(en)}
                  >
                    <span className="box chbox" aria-hidden="true">
                      {full ? '✓' : ''}
                    </span>
                    <span className="t ct">
                      <span translate="no">{c.title}</span>
                      {c.times > 1 && (
                        <span className="cn">
                          {' '}
                          {en.done} of {c.times}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      {haLists.length > 0 && (
        <div id="chHa" className="chha">
          {haLists.map(l => {
            const items = [...l.items].sort((a, b) => Number(a.done) - Number(b.done));
            const canHa = (who?.rank || 0) >= RANK.family;
            return (
              <div className="chcol section" key={l.id}>
                <h3>
                  🏠 {l.name}
                  <small>
                    {l.items.filter(i => i.done).length} / {l.items.length}
                  </small>
                </h3>
                {l.problem && <div className="err">{l.problem}</div>}
                {!items.length && !l.problem && <div className="dim">Nothing on it</div>}
                {items.map(i => (
                  <button
                    key={i.uid}
                    type="button"
                    className={'check chitem' + (i.done ? ' done' : '') + (canHa ? ' can' : '')}
                    aria-pressed={i.done}
                    disabled={!canHa}
                    onClick={() => haTick(l.id, i.uid, !i.done)}
                  >
                    <span className="box chbox" aria-hidden="true">
                      {i.done ? '✓' : ''}
                    </span>
                    <span className="t ct">{i.title}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
      {editing && d && (
        <ChoresEditor
          data={{ people: d.people, chores: d.chores as Chore[] }}
          onClose={() => setEditing(false)}
          onSaved={v => live.set({ ...v, mine: d.mine })}
        />
      )}
    </Page>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
