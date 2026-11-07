// Chores: today's, this week's and this month's, a column per person and per group that shares one.
// Tap to tick off (a chore done several times: once per tap). On a kid's tablet: only theirs.
// Signed-in people can change the list (✎).
import { useEffect, useMemo, useState } from 'react';
import type { Chore, ChoreProgress, ChoresView, Every, Person } from '../../../shared/chores.ts';
import { post } from '../lib/api.ts';
import { useLive } from '../lib/live.ts';
import { RANK } from '../lib/who.ts';
import type { Who } from '../lib/who.ts';
import { Btn } from '../ui/bits.tsx';
import { Page } from '../ui/Page.tsx';
import { ChoresEditor } from './ChoresEditor.tsx';
import './chores.css';

const TABS: [Every, string][] = [
  ['day', 'Today'],
  ['week', 'This week'],
  ['month', 'This month']
];
interface Entry {
  c: ChoreProgress;
  who: string[];
  person?: string; // an "each their own" chore: whose this one is
  done: number;
}
// what's on the page: shared chores once, "each their own" chores once per person
function entries(d: ChoresView, every: Every): Entry[] {
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

export function Chores({ who }: { who: Who | null }) {
  const live = useLive<ChoresView>('api/chores', ['chores']);
  const d = live.data;
  const [tab, setTab] = useState<Every>('day');
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState('');
  const editor = (who?.rank || 0) >= RANK.editor;
  useEffect(() => {
    document.body.classList.add('chorespage');
    return () => document.body.classList.remove('chorespage');
  }, []);

  const names = useMemo(() => Object.fromEntries((d?.people || []).map((p: Person) => [p.id, p.name])), [d]);
  const order = useMemo(() => Object.fromEntries((d?.people || []).map((p: Person, i: number) => [p.id, i])), [d]);
  const have = d ? TABS.filter(([t]) => entries(d, t).length) : [];
  const shown = have.some(([t]) => t === tab) ? tab : have[0]?.[0] || 'day';
  // who may tick it here: signed-in people and family screens, anyone's; a kid's tablet, their own; the wall, none
  const can = (en: Entry) => (who?.rank || 0) >= RANK.family || (!!d?.mine && en.who.includes(d.mine));

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
      tools={
        editor && (
          <Btn id="chEdit" onClick={() => setEditing(true)}>
            ✎ Change the list
          </Btn>
        )
      }
    >
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
      {d && !d.chores.length && (
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
                      {c.title}
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
