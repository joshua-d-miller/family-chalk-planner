/*
===============================================================================
 Family Chalk Planner | Screens | Drawing | Tools.tsx
===============================================================================
 Version:   0.13.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-07
 Updated:   2026-11-07

 Purpose:
     The drawing tools on the strip, and the cards they open: writing,
     recoloring, wiping the month.

 Used by:
     web/src/board/Board.tsx
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    The new board: drawing on a tablet (chalk,
                        claude    Posca, writing, eraser, select, stamps,
                        colby     GIFs).

                                  The new screens take over: /, /edit and
                                  /chores are the React board; the old one
                                  stays at /classic.
===============================================================================
*/

import { useState } from 'react';
import type { ArtItem } from '../Art.tsx';
import { fontCss } from '../Art.tsx';
import { FONT_NAMES } from '../editors/TitleEditor.tsx';
import { Btn, Segs } from '../../ui/bits.tsx';
import { CHALK, Colors, customColors, POSCA } from '../../ui/Colors.tsx';
import { Sheet } from '../../ui/Sheet.tsx';
import { post } from '../../lib/api.ts';
import { Thumb } from './Library.tsx';
import { isPosca, SIZES, TEXT_SIZES } from './Draw.tsx';
import type { Medium, Pen, Tool } from './Draw.tsx';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------- //
// | Icons | //
// --------- //
const Ic = ({ d, dash }: { d: string; dash?: boolean }) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeDasharray={dash ? '3 3' : undefined}
    aria-hidden="true"
  >
    <path d={d} />
  </svg>
);

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------------- //
// | The toolbar | //
// --------------- //
export function Tools({
  pen,
  setPen,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onClear,
  onStamps,
  family = false
}: {
  pen: Pen;
  setPen: (p: Pen) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onClear: () => void;
  onStamps: () => void;
  family?: boolean; // a family screen decorates: stamps, writing, moving; no pens, no wiping the month
}) {
  const tool = (t: Tool) => setPen({ ...pen, tool: t });
  const medium = (m: Medium) => setPen({ ...pen, medium: m, tool: 'pen' });
  const pal = [...(pen.medium === 'posca' ? POSCA : CHALK), ...customColors()];
  const cur = pen.color[pen.medium];
  return (
    <div className="tools" id="tools">
      {!family && (
        <>
          <span className="swatches">
            {pal.map(c => (
              <button
                type="button"
                key={c}
                className={'sw' + (c === cur && pen.tool === 'pen' ? ' on' : '')}
                aria-label={c}
                onClick={() => setPen({ ...pen, tool: 'pen', color: { ...pen.color, [pen.medium]: c } })}
              >
                <span style={{ background: c }} />
              </button>
            ))}
            <label className="cpick" title="Another color">
              <input
                type="color"
                aria-label="Another color"
                value={cur}
                onChange={e => {
                  const c = e.target.value.toUpperCase();
                  const m: Medium = isPosca(c) ? 'posca' : 'chalk';
                  setPen({ ...pen, tool: 'pen', medium: m, color: { ...pen.color, [m]: c } });
                }}
              />
            </label>
          </span>
          <button
            type="button"
            className="tool"
            id="sizeBtn"
            aria-label={`Line size ${pen.size + 1} of 3`}
            onClick={() => setPen({ ...pen, size: (pen.size + 1) % SIZES.length })}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r={[2.5, 4, 6.5][pen.size]} fill={cur} />
            </svg>
          </button>
          <button
            type="button"
            className={'tool medium' + (pen.tool === 'pen' && pen.medium === 'chalk' ? ' on' : '')}
            id="chalkBtn"
            aria-label="Chalk"
            onClick={() => medium('chalk')}
          >
            <Ic d="M4 15l9-9 4 4-9 9H4z" />
            Chalk
          </button>
          <button
            type="button"
            className={'tool medium' + (pen.tool === 'pen' && pen.medium === 'posca' ? ' on' : '')}
            id="poscaBtn"
            aria-label="Posca paint marker"
            onClick={() => medium('posca')}
          >
            <Ic d="M14.5 4.5l5 5L10 19l-5 1 1-5zM12 7l5 5" />
            Posca
          </button>
        </>
      )}
      <button
        type="button"
        className={'tool' + (pen.tool === 'text' ? ' on' : '')}
        id="textBtn"
        aria-label="Write text"
        style={{ fontFamily: "'Pacifico', cursive", fontSize: 17 }}
        onClick={() => tool('text')}
      >
        Aa
      </button>
      <button
        type="button"
        className={'tool' + (pen.tool === 'select' ? ' on' : '')}
        id="selectBtn"
        aria-label="Select part of the drawing"
        onClick={() => tool('select')}
      >
        <Ic d="M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" dash />
      </button>
      <button type="button" className="tool" id="stampsBtn" aria-label="Stamps and pictures" onClick={onStamps}>
        <Ic d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" />
      </button>
      <button
        type="button"
        className={'tool' + (pen.tool === 'erase' ? ' on' : '')}
        id="eraseBtn"
        aria-label="Eraser"
        onClick={() => tool('erase')}
      >
        <Ic d="M7 20h11M4.5 14.5l9-9a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8L12 19H8l-3.5-3.5a1 1 0 0 1 0-1z" />
      </button>
      <button type="button" className="tool" id="undoBtn" aria-label="Undo" disabled={!canUndo} onClick={onUndo}>
        <Ic d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />
      </button>
      <button type="button" className="tool" id="redoBtn" aria-label="Redo" disabled={!canRedo} onClick={onRedo}>
        <Ic d="M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" />
      </button>
      {!family && (
        <button type="button" className="tool" id="clearBtn" aria-label="Wipe this month’s art" onClick={onClear}>
          <Ic d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
        </button>
      )}
    </div>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------- //
// | Writing text | //
// ---------------- //
// Writing on the board: the words, a font, a size and a color               //
export function TextSheet({
  item,
  color,
  onSave,
  onDelete,
  onClose
}: {
  item: ArtItem | null;
  color: string;
  onSave: (t: { s: string; f: number; z: number; c: string }) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [s, setS] = useState(item?.s || '');
  const [f, setF] = useState(item?.f ?? 3);
  const [z, setZ] = useState(item?.z || 40);
  const [c, setC] = useState(item?.c || color);
  return (
    <Sheet title={item ? 'Change this writing' : 'Write on the board'} onClose={onClose} id="textSheet">
      <textarea
        id="tText"
        className="ttext"
        rows={2}
        maxLength={160}
        value={s}
        onChange={e => setS(e.target.value)}
        aria-label="What to write"
      />
      <div className="tpreview" style={{ font: fontCss(f, Math.min(z, 54)), color: c, opacity: s ? 1 : 0.4 }}>
        {s || 'Preview'}
      </div>
      <div className="fontpick">
        {FONT_NAMES.map((n, i) => (
          <button
            type="button"
            key={n}
            className={'seg' + (f === i ? ' on' : '')}
            aria-pressed={f === i}
            style={{ font: fontCss(i, i === 6 ? 15 : i === 5 ? 26 : 20) }}
            onClick={() => setF(i)}
          >
            {n}
          </button>
        ))}
      </div>
      <Segs
        value={String(z)}
        onChange={v => setZ(+v)}
        options={TEXT_SIZES.map(([n, l]) => [String(n), l])}
        label="Size"
      />
      <Colors value={c} onChange={v => v && setC(v)} label="Color" />
      <div className="actions">
        {item && (
          <Btn kind="warn" className="left" onClick={onDelete}>
            Erase
          </Btn>
        )}
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn
          kind="go"
          id="tSave"
          onClick={() => (s.trim() ? onSave({ s: s.replace(/\s+$/, ''), f, z, c }) : onClose())}
        >
          {item ? 'Save' : 'Put it up'}
        </Btn>
      </div>
    </Sheet>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------- //
// | Recoloring | //
// -------------- //
export function RecolorSheet({
  onSave,
  onClose
}: {
  onSave: (line: string | undefined, fill: string | null | undefined) => void;
  onClose: () => void;
}) {
  const [line, setLine] = useState<string | undefined>(undefined);
  const [fill, setFill] = useState<string | null | undefined>(undefined);
  return (
    <Sheet title="Color" onClose={onClose} id="recolorSheet">
      <div className="sublbl">Line</div>
      <Colors value={line || null} onChange={v => setLine(v || undefined)} label="Line color" />
      <div className="sublbl">Fill (closed shapes)</div>
      <Colors value={fill || null} onChange={v => setFill(v)} none="No fill" label="Fill" />
      <div className="actions">
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn kind="go" onClick={() => onSave(line, fill)}>
          Save
        </Btn>
      </div>
    </Sheet>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------ //
// | Saving a stamp | //
// ------------------ //
// ★ Save as stamp: what's selected goes in the family's stamp library, to   //
// put up again any time                                                     //
export function SaveStampSheet({
  items,
  bg,
  onClose
}: {
  items: ArtItem[];
  bg: number;
  onClose: (saved?: string) => void;
}) {
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Sheet title="Save as stamp" onClose={() => onClose()} id="stampSheet">
      <Thumb items={items} bg={bg} />
      <label className="field">
        <span>Name</span>
        <input id="sName" maxLength={40} value={name} onChange={e => setName(e.target.value)} autoComplete="off" />
      </label>
      <div className="err">{err}</div>
      <div className="actions">
        <Btn onClick={() => onClose()}>Cancel</Btn>
        <Btn
          kind="go"
          disabled={busy}
          onClick={async () => {
            if (!name.trim()) return setErr('Give it a name');
            setBusy(true);
            try {
              await post('api/stamps', {
                name: name.trim(),
                items: items.map(it => {
                  const o: Partial<ArtItem> = { ...it };
                  delete o.id;
                  delete o.g;
                  return o;
                })
              });
              onClose(name.trim());
            } catch (e) {
              setErr((e as Error).message);
              setBusy(false);
            }
          }}
        >
          Save
        </Btn>
      </div>
    </Sheet>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
