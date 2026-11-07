/*
===============================================================================
 Family Chalk Planner | Screens | UI | FontPicker.tsx
===============================================================================
 Version:   0.14.0
 Author:    Joshua D. Miller, Claude
 Updated:   2026-11-07

 Purpose:
     Choosing a font: the groups (Handwritten, Chalk & sketch, Script,
     Bold & bubbly, Holidays) as tabs, and the fonts of one group, each
     written in itself. Opens on the group of the font chosen now.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.14.0    2026-11-07   joshua    New file.
                        claude
===============================================================================
*/

import { useState } from 'react';
import { BOARD_FONTS, CLASSIC_FONT, FONT_GROUPS, fontStack } from '../../../shared/fonts.ts';
import type { BoardFont } from '../../../shared/fonts.ts';
import './fontpicker.css';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------- //
// | Choosing a font | //
// ------------------- //
export function FontPicker<K extends string | number>({
  value,
  onChange,
  keyOf,
  sample,
  size = 20,
  classic = false,
  label = 'Font'
}: {
  value: K;
  onChange: (k: K) => void;
  keyOf: (b: BoardFont, i: number) => K; // the number (words, titles) or the id (board style)
  sample?: string; // the words to show in each font (else its name)
  size?: number;
  classic?: boolean; // offer Classic too (the board style)
  label?: string;
}) {
  const all = BOARD_FONTS.map((b, i) => ({ b, k: keyOf(b, i) }));
  if (classic) all.push({ b: CLASSIC_FONT, k: keyOf(CLASSIC_FONT, -1) });
  const cur = all.find(x => x.k === value)?.b;
  const [group, setGroup] = useState<string>(cur?.group || FONT_GROUPS[0]);
  const shown = all.filter(x => x.b.group === group);
  return (
    <div className="fontpicker" role="group" aria-label={label}>
      <div className="fgroups" role="tablist">
        {FONT_GROUPS.map(g => (
          <button
            type="button"
            key={g}
            role="tab"
            aria-selected={g === group}
            className={g === group ? 'on' : ''}
            onClick={() => setGroup(g)}
          >
            {g}
            {cur?.group === g && <span className="dot" aria-label="(chosen)" />}
          </button>
        ))}
      </div>
      <div className="fontpick">
        {shown.map(({ b, k }) => (
          <button
            type="button"
            key={String(k)}
            className={'seg' + (k === value ? ' on' : '')}
            aria-pressed={k === value}
            title={b.name + (b.tag ? ` (${b.tag})` : '')}
            style={{ fontFamily: fontStack(b), fontWeight: b.weight, fontSize: Math.round(size * Math.min(1.2, b.z)) }}
            onClick={() => onChange(k)}
          >
            {sample || b.name}
          </button>
        ))}
      </div>
    </div>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
