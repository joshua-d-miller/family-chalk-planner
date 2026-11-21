/*
===============================================================================
 Family Chalk Planner | Screens | UI | Colors.tsx
===============================================================================
 Version:   1.2.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-07
 Updated:   2026-11-21

 Purpose:
     A row of color dots: the chalk colors, the Posca colors, and the
     family's own picked colors (the last 6, remembered on this screen),
     plus a picker for any other. `none` adds "the usual color".

 Used by:
     web/src/board/EventEditor.tsx
     web/src/board/draw/Draw.tsx
     web/src/board/draw/Find.tsx
     web/src/board/draw/Library.tsx
     web/src/board/draw/Tools.tsx
     web/src/board/editors/BorderEditor.tsx
     web/src/board/editors/StyleEditor.tsx
     web/src/board/editors/TitleEditor.tsx
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    The new board on a tablet (next/edit):
                        claude    events, the month's title and border, the
                                  board style.

 1.2.0    2026-11-21   joshua    Colorblind-safe colors (Okabe–Ito), and a
                        claude    name for each color a screen reader says.
===============================================================================
*/

import { useState } from 'react';
import './colors.css';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------- //
// | The colors | //
// -------------- //
export const CHALK = ['#EDEAE0', '#F6B3CB', '#F2D479', '#9CC9E6', '#A9D8A0', '#E8A35C', '#B49CE0'];
export const POSCA = [
  '#FFFFFF',
  '#FFE500',
  '#FF8C1A',
  '#E8262B',
  '#FF4FA3',
  '#3EC6F2',
  '#2C64D6',
  '#1FB04C',
  '#9BE15D',
  '#8B4FD8'
];
// the Okabe–Ito colors: told apart with every common kind of color blindness (for events, and a style of its own)
export const COLORBLIND = ['#E69F00', '#56B4E9', '#009E73', '#F0E442', '#0072B2', '#D55E00', '#CC79A7'];
// what a screen reader says for each color (not its #code)
const NAMES: Record<string, string> = {
  '#EDEAE0': 'Chalk white',
  '#F6B3CB': 'Pink',
  '#F2D479': 'Yellow',
  '#9CC9E6': 'Light blue',
  '#A9D8A0': 'Light green',
  '#E8A35C': 'Orange',
  '#B49CE0': 'Lavender',
  '#FFFFFF': 'White',
  '#FFE500': 'Bright yellow',
  '#FF8C1A': 'Bright orange',
  '#E8262B': 'Red',
  '#FF4FA3': 'Hot pink',
  '#3EC6F2': 'Sky blue',
  '#2C64D6': 'Blue',
  '#1FB04C': 'Green',
  '#9BE15D': 'Lime',
  '#8B4FD8': 'Purple',
  '#E69F00': 'Orange (colorblind-safe)',
  '#56B4E9': 'Sky blue (colorblind-safe)',
  '#009E73': 'Green (colorblind-safe)',
  '#F0E442': 'Yellow (colorblind-safe)',
  '#0072B2': 'Blue (colorblind-safe)',
  '#D55E00': 'Red-orange (colorblind-safe)',
  '#CC79A7': 'Pink (colorblind-safe)',
  '#2F8F83': 'Teal',
  '#E05A7A': 'Rose'
};
export const colorName = (c: string) => NAMES[c.toUpperCase()] || 'Your color ' + c.toUpperCase();
const KEY = 'chalkCustomColors'; // the same list the current board keeps

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------ //
// | Her own colors | //
// ------------------ //
// The last 6 picked, remembered on this screen (the same list the board as  //
// it was kept).                                                             //
export function customColors(): string[] {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (Array.isArray(a)) return a.filter(c => /^#[0-9A-F]{6}$/.test(c)).slice(0, 6);
  } catch {
    /* private window: none */
  }
  return [];
}
function addCustom(c: string) {
  const list = [c, ...customColors().filter(x => x !== c)].slice(0, 6);
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* fine: just not remembered */
  }
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------- //
// | The row of dots | //
// ------------------- //
export function Colors({
  value,
  onChange,
  set = [...CHALK, ...POSCA, ...COLORBLIND],
  none,
  label = 'Color'
}: {
  value: string | null;
  onChange: (c: string | null) => void;
  set?: string[];
  none?: string; // the label for "no color of its own"
  label?: string;
}) {
  const [mine, setMine] = useState(customColors);
  const all = [...new Set([...set, ...mine, ...(value ? [value.toUpperCase()] : [])])];
  return (
    <div className="colors" role="radiogroup" aria-label={label}>
      {none !== undefined && (
        <button
          type="button"
          role="radio"
          aria-checked={!value}
          aria-label={none}
          title={none}
          className={'dot none' + (!value ? ' on' : '')}
          onClick={() => onChange(null)}
        >
          <span />
        </button>
      )}
      {all.map(c => (
        <button
          type="button"
          key={c}
          role="radio"
          aria-checked={value?.toUpperCase() === c}
          aria-label={colorName(c)}
          title={colorName(c)}
          data-color={c}
          className={'dot' + (value?.toUpperCase() === c ? ' on' : '')}
          onClick={() => onChange(c)}
        >
          <span style={{ background: c }} />
        </button>
      ))}
      <label className="dot pick" title="Another color">
        <span>+</span>
        <input
          type="color"
          aria-label="Another color"
          value={value || '#ffffff'}
          onChange={e => {
            const c = e.target.value.toUpperCase();
            addCustom(c);
            setMine(customColors());
            onChange(c);
          }}
        />
      </label>
    </div>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
