/*
===============================================================================
 Family Chalk Planner | Screens | Drawing | useArt.ts
===============================================================================
 Version:   0.14.1
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-07
 Updated:   2026-11-08

 Purpose:
     The month's art as this tablet changes it: shown at once, saved to
     the server, and undone or redone (everything done on this tablet,
     this month). Other screens' changes arrive live.

 Used by:
     web/src/board/Board.tsx
     web/src/board/draw/Draw.tsx
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    The new board: drawing on a tablet (chalk,
                        claude    Posca, writing, eraser, select, stamps,
                                  GIFs).

 0.14.1    2026-11-08   joshua    Art the board refuses comes off again, with
                        claude    Couldn't add that.
===============================================================================
*/

import { useCallback, useMemo, useRef, useState } from 'react';
import { post } from '../../lib/api.ts';
import type { ArtItem } from '../Art.tsx';

export const CLIENT = Math.random().toString(36).slice(2); // the server skips telling us about our own changes

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------------- //
// | Undo and redo | //
// ----------------- //
type Action =
  { t: 'add'; items: ArtItem[] } | { t: 'del'; items: ArtItem[] } | { t: 'upd'; before: ArtItem[]; after: ArtItem[] };
const snap = (it: ArtItem): ArtItem => JSON.parse(JSON.stringify(it));
export const newGroup = () => Math.random().toString(36).slice(2, 10);
let temp = -1; // items not saved yet have ids below zero

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------------- //
// | Changing the art | //
// -------------------- //
// Changes show at once and are saved in the background; new pieces have a   //
// temporary id until the board answers.                                     //
export function useArt(
  ym: string | null,
  live: { data: ArtItem[] | null; set: (v: ArtItem[]) => void; reload: () => void }
) {
  const items = useMemo(() => (Array.isArray(live.data) ? live.data : []), [live.data]);
  const now = useRef(items);
  now.current = items;
  const hist = useRef<{ ym: string | null; undo: Action[]; redo: Action[] }>({ ym, undo: [], redo: [] });
  if (hist.current.ym !== ym) hist.current = { ym, undo: [], redo: [] };
  const [, bump] = useState(0);
  const [err, setErr] = useState('');
  const set = (v: ArtItem[]) => {
    now.current = v;
    live.set(v);
  };
  const record = (a: Action) => {
    const h = hist.current;
    h.undo.push(a);
    if (h.undo.length > 200) h.undo.shift();
    h.redo = [];
    bump(n => n + 1);
  };
  const failed = (what: string) => () => {
    setErr(what);
    live.reload();
  };
  const byId = (list: ArtItem[]) => new Map<number, ArtItem>(list.map(x => [x.id, x]));

  // one new thing (a line, some writing)
  const add = useCallback(
    async (item: ArtItem) => {
      if (!ym) return;
      const draft = { ...item, id: temp-- };
      set([...now.current, draft]);
      try {
        const r = await post<{ id: number }>('api/art', { ym, stroke: { ...item, id: undefined }, from: CLIENT });
        const saved = { ...item, id: r.id };
        set(now.current.map(x => (x.id === draft.id ? saved : x)));
        record({ t: 'add', items: [snap(saved)] });
      } catch {
        failed('Couldn’t save that')();
      }
    },
    [ym]
  );
  // several at once (a stamp, a copy): kept together as one picture; returns their ids
  const addMany = useCallback(
    async (list: ArtItem[]) => {
      if (!ym || !list.length) return [];
      const regroup: Record<string, string> = {};
      const solo = newGroup();
      const out = list.map(it => ({ ...it, g: it.g ? (regroup[it.g] ||= newGroup()) : solo, id: temp-- }));
      set([...now.current, ...out]);
      try {
        const r = await post<{ ids: (number | null)[] }>('api/art/bulk', {
          ym,
          items: out.map(x => ({ ...x, id: undefined })),
          from: CLIENT
        });
        // anything the board refused comes off again (it was never saved), and says so
        const now2 = new Map<number, ArtItem | null>(
          out.map((x, i) => {
            const id = r.ids[i];
            return [x.id, id == null ? null : { ...x, id }];
          })
        );
        const saved = [...now2.values()].filter((x): x is ArtItem => x !== null);
        const refused = saved.length < out.length;
        set(now.current.flatMap(x => (now2.has(x.id) ? (now2.get(x.id) ? [now2.get(x.id)!] : []) : [x])));
        if (refused) failed('Couldn’t add that')();
        if (saved.length) record({ t: 'add', items: saved.map(snap) });
        return saved.map(x => x.id);
      } catch {
        failed('Couldn’t add that')();
        return [];
      }
    },
    [ym]
  );
  const doDelete = (list: ArtItem[]) => {
    const ids = list.map(x => x.id);
    set(now.current.filter(x => !ids.includes(x.id)));
    return post('api/art/delete', { ym, ids }).catch(failed('Couldn’t erase that'));
  };
  const doRestore = (list: ArtItem[]) => {
    const have = new Set(now.current.map(x => x.id));
    set([...now.current, ...list.filter(x => !have.has(x.id)).map(snap)].sort((a, b) => a.id - b.id));
    return post('api/art/restore', { ym, items: list, from: CLIENT }).catch(failed('Couldn’t bring that back'));
  };
  const doUpdate = (list: ArtItem[]) => {
    const m = byId(list);
    set(now.current.map(x => (m.has(x.id) ? snap(m.get(x.id)!) : x)));
    return post('api/art/update', { ym, items: list, from: CLIENT }).catch(failed('Couldn’t change that'));
  };
  const remove = useCallback(
    (list: ArtItem[]) => {
      const saved = list.filter(x => x.id >= 0).map(snap);
      if (!saved.length) return;
      record({ t: 'del', items: saved });
      doDelete(saved);
    },
    [ym]
  );
  const update = useCallback(
    (before: ArtItem[], after: ArtItem[]) => {
      if (JSON.stringify(before) === JSON.stringify(after)) return;
      record({ t: 'upd', before: before.map(snap), after: after.map(snap) });
      doUpdate(after);
    },
    [ym]
  );
  // shown while dragging, saved by update() at the end
  const preview = useCallback((list: ArtItem[]) => {
    const m = byId(list);
    set(now.current.map(x => (m.has(x.id) ? m.get(x.id)! : x)));
  }, []);
  const apply = (a: Action, back: boolean) => {
    if (a.t === 'upd') return doUpdate(back ? a.before : a.after);
    return (a.t === 'add') === back ? doDelete(a.items) : doRestore(a.items);
  };
  const undo = useCallback(() => {
    const a = hist.current.undo.pop();
    if (!a) return;
    apply(a, true);
    hist.current.redo.push(a);
    bump(n => n + 1);
  }, [ym]);
  const redo = useCallback(() => {
    const a = hist.current.redo.pop();
    if (!a) return;
    apply(a, false);
    hist.current.undo.push(a);
    bump(n => n + 1);
  }, [ym]);
  return {
    items,
    add,
    addMany,
    remove,
    update,
    preview,
    undo,
    redo,
    canUndo: hist.current.undo.length > 0,
    canRedo: hist.current.redo.length > 0,
    err,
    clearErr: () => setErr('')
  };
}
export type ArtEditor = ReturnType<typeof useArt>;

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
