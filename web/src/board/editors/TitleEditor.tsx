/*
===============================================================================
 Family Chalk Planner | Screens | Board editors | TitleEditor.tsx
===============================================================================
 Version:   1.3.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-07
 Updated:   2026-11-28

 Purpose:
     ✎ Month title: typed (font, color, outline, size; for this month or
     every month) or hand-lettered. The board shows it as you pick.

 Used by:
     web/src/board/Board.tsx
     web/src/board/draw/Tools.tsx
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    The new board on a tablet (next/edit):
                        claude    events, the month's title and border, the
                                  board style.

 0.14.0    2026-11-07   joshua    The grouped font picker, with every font.
                        claude

 1.2.0    2026-11-21   joshua    "Discard your changes?" when it's closed
                        claude    with changes.

 1.3.0    2026-11-28   joshua    Lettering and marker streaks.
                        claude
===============================================================================
*/

import { FontPicker } from '../../ui/FontPicker.tsx';
import { useEffect, useState } from 'react';
import { post } from '../../lib/api.ts';
import { Btn, Segs } from '../../ui/bits.tsx';
import { Colors } from '../../ui/Colors.tsx';
import { Sheet, useChanged } from '../../ui/Sheet.tsx';
import type { MonthMeta } from '../Board.tsx';
import { DEFAULT_TITLE } from '../Title.tsx';
import type { TitleStyle } from '../Title.tsx';

// the title's lettering (board.css): none is an outline, as before
const LETTERING: [string, string][] = [
  ['', 'Outline'],
  ['sticker', 'White outline'],
  ['inline', 'Inline'],
  ['shadow', 'Drop shadow'],
  ['neon', 'Neon']
];

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------- //
// | Fonts and sizes | //
// ------------------- //
const SIZES: [string, string][] = [
  ['56', 'S'],
  ['68', 'M'],
  ['80', 'L'],
  ['90', 'XL']
];

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------------------- //
// | The month's title | //
// --------------------- //
export type TitleDraft = { hand: boolean; style: TitleStyle };

export function TitleEditor({
  ym,
  monthName,
  meta,
  onPreview,
  onClose
}: {
  ym: string;
  monthName: string;
  meta: MonthMeta | null;
  onPreview: (d: TitleDraft | null) => void;
  onClose: () => void;
}) {
  const [hand, setHand] = useState(!!meta?.hideTitle);
  const [t, setT] = useState<TitleStyle>(meta?.title || meta?.defaultTitle || DEFAULT_TITLE);
  const [every, setEvery] = useState(false);
  const [err, setErr] = useState('');
  const changed = useChanged({ hand, t, every }); // (✕ with changes: "Discard your changes?")
  useEffect(() => onPreview({ hand, style: t }), [hand, t, onPreview]);
  const close = () => {
    onPreview(null);
    onClose();
  };
  async function save() {
    try {
      await post('api/meta', hand ? { ym, hideTitle: true } : { ym, hideTitle: false, title: t, makeDefault: every });
      close();
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  return (
    <Sheet title={`Title for ${monthName}`} onClose={close} dirty={changed} id="titleSheet">
      <Segs
        value={hand ? 'hand' : 'typed'}
        onChange={v => setHand(v === 'hand')}
        options={[
          ['typed', 'Typed'],
          ['hand', 'I’ll hand-letter it']
        ]}
      />
      {hand ? (
        <div className="sublbl">After saving, tap Draw and letter the month name in the dashed box.</div>
      ) : (
        <>
          <div className="sublbl">Font</div>
          <FontPicker value={t.f} onChange={f => setT({ ...t, f })} keyOf={(_, i) => i} sample={monthName} size={24} />
          <div className="sublbl">Color</div>
          <Colors value={t.c} onChange={c => c && setT({ ...t, c })} label="Title color" />
          <div className="sublbl">Outline</div>
          <Colors value={t.o} onChange={o => setT({ ...t, o })} none="No outline" label="Outline" />
          <div className="sublbl">Lettering</div>
          <Segs
            value={t.l || ''}
            onChange={l => setT({ ...t, l: l || undefined })}
            options={LETTERING}
            label="Lettering"
          />
          <label className="tick">
            <input
              type="checkbox"
              id="titleStreaks"
              checked={!!t.s}
              onChange={e => setT({ ...t, s: e.target.checked || undefined })}
            />{' '}
            Marker streaks
          </label>
          <div className="sublbl">Size</div>
          <Segs value={String(t.z)} onChange={z => setT({ ...t, z: +z })} options={SIZES} label="Size" />
          <label className="tick">
            <input type="checkbox" checked={every} onChange={e => setEvery(e.target.checked)} /> Use this style for
            every month
          </label>
        </>
      )}
      <div className="err">{err}</div>
      <div className="actions">
        <Btn onClick={close}>Cancel</Btn>
        <Btn kind="go" onClick={save}>
          Save
        </Btn>
      </div>
    </Sheet>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
