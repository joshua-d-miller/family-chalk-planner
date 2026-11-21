/*
===============================================================================
 Family Chalk Planner | Screens | Board editors | NotesEditor.tsx
===============================================================================
 Version:   1.2.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-08
 Updated:   2026-11-21

 Purpose:
     🗒️ The bottom of the Notes column on this screen: what it shows
     (reward jars, today, up next or a photo) and what its little switch
     can flip to. Kept for this screen (or the person signed in); the
     wall's is set in the admin console.

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
                        claude    with changes.
===============================================================================
*/

import { useState } from 'react';
import { post } from '../../lib/api.ts';
import { useLive } from '../../lib/live.ts';
import { Btn, Segs } from '../../ui/bits.tsx';
import { Sheet, useChanged } from '../../ui/Sheet.tsx';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------------------- //
// | The bottom of Notes | //
// ----------------------- //
type Mode = 'jars' | 'today' | 'upnext' | 'photos';
export const BOTTOM_MODES: [Mode, string][] = [
  ['jars', '🫙 Jars'],
  ['today', '☀️ Today'],
  ['upnext', '📅 Up next'],
  ['photos', '📷 Photos']
];
type Saved = { bottom: { def: Mode; can: Mode[] } | null };
export function NotesEditor({ onClose }: { onClose: () => void }) {
  const live = useLive<Saved>('api/notesbottom', ['notesbottom']);
  // opens once this screen's choice has arrived (it starts from it)
  return live.data ? <Card cur={live.data.bottom} set={live.set} onClose={onClose} /> : null;
}
function Card({ cur, set, onClose }: { cur: Saved['bottom']; set: (v: Saved) => void; onClose: () => void }) {
  const [def, setDef] = useState<Mode>(cur?.def || 'upnext');
  const [can, setCan] = useState<Mode[]>(cur?.can || BOTTOM_MODES.map(([m]) => m));
  const [err, setErr] = useState('');
  const changed = useChanged({ def, can }); // (✕ with changes: "Discard your changes?")
  const save = async (bottom: { def: Mode; can: Mode[] } | null) => {
    try {
      set(await post<Saved>('api/notesbottom', { bottom }));
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <Sheet title="Bottom of Notes" onClose={onClose} dirty={changed} id="notesSheet">
      <div className="sublbl">Shows on this screen</div>
      <Segs value={def} onChange={v => setDef(v)} options={BOTTOM_MODES} label="Shows" />
      <div className="sublbl">The little switch can flip to</div>
      {BOTTOM_MODES.map(([m, label]) => (
        <label className="tick" key={m}>
          <input
            type="checkbox"
            checked={m === def || can.includes(m)}
            disabled={m === def}
            onChange={e => setCan(e.target.checked ? [...can, m] : can.filter(x => x !== m))}
          />{' '}
          {label}
        </label>
      ))}
      <div className="sublbl">Only one ticked: no switch. Jars and photos show once there are some.</div>
      <div className="err">{err}</div>
      <div className="actions">
        {cur && (
          <Btn className="left" onClick={() => save(null)}>
            Like the rest of the board
          </Btn>
        )}
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn kind="go" onClick={() => save({ def, can: can.filter(m => m !== def).concat(def) })}>
          Save
        </Btn>
      </div>
    </Sheet>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
