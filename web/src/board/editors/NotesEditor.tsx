/*
===============================================================================
 Family Chalk Planner | Screens | Board editors | NotesEditor.tsx
===============================================================================
 Version:   1.2.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-08
 Updated:   2026-11-21

 Purpose:
     🗒️ This screen's Notes column on the view it's showing (the month or
     the week): whether it shows, its pages from the top, and what the
     bottom's little switch can flip to. Kept for this screen (or the
     person signed in); the wall's is set in the admin console. A view
     this screen hasn't set shows the board's.

 Used by:
     web/src/board/Board.tsx
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.15.0    2026-11-08   joshua    New file.
                        claude

 1.2.0    2026-11-21   joshua    "Discard your changes?" when it's closed
                        claude    with changes. The whole column, for the
                                  month and the week each: on or off, its
                                  pages and the bottom's switch.
===============================================================================
*/

import { useState } from 'react';
import { NOTES_PAGES, setMyCol, useNotesCol } from '../../lib/notesCol.ts';
import type { Col, NotesView } from '../../lib/notesCol.ts';
import { useLive } from '../../lib/live.ts';
import { Btn } from '../../ui/bits.tsx';
import { Sheet, useChanged } from '../../ui/Sheet.tsx';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------------- //
// | This screen's Notes column | //
// ------------------------------- //
type Mode = 'jars' | 'today' | 'upnext' | 'photos';
export const BOTTOM_MODES: [Mode, string][] = [
  ['jars', '🫙 Jars'],
  ['today', '☀️ Today'],
  ['upnext', '📅 Up next'],
  ['photos', '📷 Photos']
];
const isMode = (p: string | undefined): p is Mode => BOTTOM_MODES.some(([m]) => m === p);
export function NotesEditor({ view, onClose }: { view: NotesView; onClose: () => void }) {
  const col = useNotesCol(view);
  const screenBottom = useLive<{ bottom: { def: string; can: string[] } | null }>('api/notesbottom', [
    'notesbottom'
  ]).data;
  // opens once this screen's choice has arrived (it starts from it)
  return col.ready && screenBottom ? (
    <Card
      view={view}
      cur={col}
      can0={(col.own ? col.bottom : screenBottom.bottom)?.can}
      own={col.own}
      onClose={onClose}
    />
  ) : null;
}
function Card({
  view,
  cur,
  can0,
  own,
  onClose
}: {
  view: NotesView;
  cur: Col;
  can0: string[] | undefined;
  own: boolean;
  onClose: () => void;
}) {
  const [on, setOn] = useState(cur.on);
  const [pages, setPages] = useState<string[]>(cur.pages);
  const [can, setCan] = useState<Mode[]>((can0?.filter(isMode) as Mode[]) || BOTTOM_MODES.map(([m]) => m));
  const [err, setErr] = useState('');
  const changed = useChanged({ on, pages, can }); // (✕ with changes: "Discard your changes?")
  const last = pages[pages.length - 1];
  const save = async (col: Col | null) => {
    try {
      await setMyCol(view, col);
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const col = (): Col => ({
    on,
    pages,
    ...(isMode(last) ? { bottom: { def: last, can: can.filter(m => m !== last).concat(last) } } : {})
  });
  return (
    <Sheet
      title={view === 'week' ? 'Notes on the week' : 'Notes on the month'}
      onClose={onClose}
      dirty={changed}
      id="notesSheet"
    >
      <div className="sublbl">Just for this screen (or you, signed in)</div>
      <label className="tick">
        <input id="notesShow" type="checkbox" checked={on} onChange={e => setOn(e.target.checked)} /> Show the Notes
        column (off: the calendar takes the whole board)
      </label>
      {on && (
        <>
          <div className="sublbl">Its pages, from the top (up to 3)</div>
          <div className="segs" role="group" aria-label="Its pages">
            {NOTES_PAGES.map(([id, label]) => {
              const at = pages.indexOf(id);
              return (
                <button
                  key={id}
                  type="button"
                  className={'seg' + (at >= 0 ? ' on' : '')}
                  aria-pressed={at >= 0}
                  disabled={at < 0 && pages.length >= 3}
                  onClick={() => setPages(at >= 0 ? pages.filter(p => p !== id) : [...pages, id])}
                >
                  {at >= 0 && <b>{at + 1}. </b>}
                  {label}
                </button>
              );
            })}
          </div>
          {isMode(last) && (
            <>
              <div className="sublbl">The little switch at the bottom can flip to</div>
              {BOTTOM_MODES.map(([m, label]) => (
                <label className="tick" key={m}>
                  <input
                    type="checkbox"
                    checked={m === last || can.includes(m)}
                    disabled={m === last}
                    onChange={e => setCan(e.target.checked ? [...can, m] : can.filter(x => x !== m))}
                  />{' '}
                  {label}
                </label>
              ))}
              <div className="sublbl">Only one ticked: no switch. Jars and photos show once there are some.</div>
            </>
          )}
        </>
      )}
      <div className="err">{err}</div>
      <div className="actions">
        {own && (
          <Btn className="left" onClick={() => save(null)}>
            Like the rest of the board
          </Btn>
        )}
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn kind="go" onClick={() => save(col())}>
          Save
        </Btn>
      </div>
    </Sheet>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
