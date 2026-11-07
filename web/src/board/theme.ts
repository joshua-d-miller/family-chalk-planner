/*
===============================================================================
 Family Chalk Planner | Screens | Board | theme.ts
===============================================================================
 Version:   0.13.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-07
 Updated:   2026-11-07

 Purpose:
     The board's style ("theme"): a preset plus the family's tweaks
     (fonts, colors, lines, today's mark). The same presets and fonts as
     the current board, so a theme saved on either looks the same on both.

 Used by:
     web/src/board/Board.tsx
     web/src/board/Month.tsx
     web/src/board/editors/StyleEditor.tsx
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    The new board: the family's style, each
                        colby     month's title and holiday border, polaroids,
                        claude    drawn jars.
===============================================================================
*/

import { lum, readable } from './color.ts';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------- //
// | The style | //
// ------------- //
export type Theme = { p: string; o?: Record<string, string>; s?: string; z?: 1 };
export type ThemeVals = Record<string, string>;

export const TFONTS: Record<string, { n: string; ff: string; w: number; z: number }> = {
  kalam: { n: 'Kalam', ff: "'Kalam', cursive", w: 700, z: 1 },
  caveat: { n: 'Caveat', ff: "'Caveat', cursive", w: 600, z: 1.15 },
  marker: { n: 'Marker', ff: "'Permanent Marker', cursive", w: 400, z: 0.92 },
  pacifico: { n: 'Pacifico', ff: "'Pacifico', cursive", w: 400, z: 0.88 },
  chalk: { n: 'Chalk', ff: "'Fredericka the Great', serif", w: 400, z: 1 },
  tall: { n: 'Tall', ff: "'Amatic SC', cursive", w: 700, z: 1.3 },
  scratchy: { n: 'Scratchy', ff: "'Rock Salt', cursive", w: 400, z: 0.78 },
  script: { n: 'Script', ff: "'Dancing Script', cursive", w: 700, z: 1.1 },
  classic: { n: 'Classic', ff: "'Cormorant Garamond', serif", w: 600, z: 1.05 }
};

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------ //
// | The usual look | //
// ------------------ //
const BASE: ThemeVals = {
  numF: 'kalam',
  numC: '#F2D479',
  boxes: 'on',
  todayC: '#F6B3CB',
  todayS: 'ring',
  wkF: 'classic',
  wkC: '#EDE6D2',
  evF: 'kalam',
  evC: '#EDEAE0',
  alldayC: '#F2D479',
  holC: '#9CC9E6',
  headF: 'script',
  notesC: '#EDE6D2',
  mealsC: '#F6B3CB',
  textF: 'kalam',
  textC: '#EDEAE0',
  lineC: '#C9B47A',
  lineS: 'solid',
  lineW: 'normal'
};

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------- //
// | Presets | //
// ----------- //
export const PRESETS: { id: string; name: string; v: ThemeVals }[] = [
  { id: 'classic', name: 'Classic', v: {} },
  {
    id: 'pastel',
    name: 'Pastel',
    v: {
      numF: 'caveat',
      numC: '#F6B3CB',
      todayC: '#9CC9E6',
      todayS: 'heart',
      wkC: '#B49CE0',
      evF: 'caveat',
      alldayC: '#F6B3CB',
      notesC: '#B49CE0',
      textF: 'caveat',
      lineC: '#B49CE0',
      lineS: 'dashed',
      lineW: 'thin'
    }
  },
  {
    id: 'marker',
    name: 'Bold',
    v: {
      numF: 'marker',
      numC: '#FFE500',
      todayC: '#FF4FA3',
      todayS: 'circle',
      wkF: 'marker',
      wkC: '#FFFFFF',
      evC: '#FFFFFF',
      alldayC: '#FFE500',
      holC: '#3EC6F2',
      headF: 'marker',
      notesC: '#FFFFFF',
      mealsC: '#FF8C1A',
      textC: '#FFFFFF',
      lineC: '#FFFFFF',
      lineW: 'bold'
    }
  },
  {
    id: 'simple',
    name: 'Simple',
    v: {
      numF: 'classic',
      numC: '#EDEAE0',
      boxes: 'off',
      todayC: '#EDEAE0',
      todayS: 'circle',
      wkC: '#EDEAE0',
      alldayC: '#EDEAE0',
      holC: '#C8C8C0',
      headF: 'classic',
      notesC: '#EDEAE0',
      mealsC: '#EDEAE0',
      lineC: '#8E8E86',
      lineW: 'thin'
    }
  },
  {
    id: 'autumn',
    name: 'Autumn',
    v: {
      numF: 'chalk',
      numC: '#E8A35C',
      todayC: '#F07A5C',
      wkC: '#F2D479',
      alldayC: '#E8A35C',
      holC: '#F2D479',
      notesC: '#E8A35C',
      mealsC: '#F2D479',
      lineC: '#A8743F'
    }
  },
  {
    id: 'winter',
    name: 'Winter',
    v: {
      numF: 'tall',
      numC: '#9CC9E6',
      todayC: '#FFFFFF',
      todayS: 'star',
      wkF: 'tall',
      wkC: '#9CC9E6',
      alldayC: '#9CC9E6',
      holC: '#B49CE0',
      headF: 'chalk',
      notesC: '#9CC9E6',
      mealsC: '#EDEAE0',
      lineC: '#9CC9E6',
      lineS: 'dotted'
    }
  },
  {
    id: 'holiday',
    name: 'Holiday',
    v: {
      numF: 'script',
      numC: '#F26B6B',
      todayC: '#F2D479',
      todayS: 'star',
      wkC: '#A9D8A0',
      alldayC: '#F26B6B',
      holC: '#F2D479',
      notesC: '#F26B6B',
      mealsC: '#A9D8A0',
      lineC: '#6FAF6F'
    }
  },
  {
    id: 'scrawl',
    name: 'Scrawl',
    v: {
      numF: 'scratchy',
      numC: '#EDEAE0',
      todayC: '#F2D479',
      wkF: 'chalk',
      wkC: '#EDEAE0',
      evF: 'caveat',
      headF: 'scratchy',
      notesC: '#EDEAE0',
      mealsC: '#F2D479',
      textF: 'caveat',
      lineC: '#EDEAE0',
      lineS: 'dashed'
    }
  }
];

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------- //
// | As CSS | //
// ---------- //
export function themeVals(t: Theme | null | undefined): ThemeVals {
  const pr = PRESETS.find(x => x.id === t?.p) || PRESETS[0];
  return { ...BASE, ...pr.v, ...(t?.o || {}) };
}

const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

// how much contrast each part needs: small text 4.5, big text 3, today's mark 2.2, lines 1.8
const NEED: Record<string, number> = {
  evC: 4.5,
  alldayC: 4.5,
  holC: 4.5,
  textC: 4.5,
  numC: 3,
  wkC: 3,
  notesC: 3,
  mealsC: 3,
  todayC: 2.2,
  lineC: 1.8
};

// The theme as style rules, inside the board only (".slate ...")
export function themeCss(v0: ThemeVals, bg: number) {
  const v: ThemeVals = {};
  for (const k in v0) v[k] = NEED[k] ? readable(v0[k], bg, NEED[k]) : v0[k];
  const F = (k: string, px: number, light = false) => {
    const f = TFONTS[v[k]] || TFONTS.kalam;
    return (
      `font-family:${f.ff};font-weight:${light && v[k] === 'kalam' ? 400 : f.w};` +
      (px ? `font-size:${Math.round(px * f.z * 10) / 10}px;` : '')
    );
  };
  const B = `${{ thin: '1px', normal: '1.5px', bold: '2.5px' }[v.lineW] || '1.5px'} ${v.lineS} ${v.lineC}`;
  const S = '.slate ';
  return [
    `${S}#grid{border-top:${B};border-left:${B}}`,
    `${S}.day{border-right:${B};border-bottom:${B}}`,
    `${S}.notes{border-left:${B}}`,
    `${S}.rule{background:${rgba(v.lineC, 0.6)}}`,
    `${S}.day .num{${F('numF', 17)}color:${v.numC};${v.boxes === 'off' ? 'border:none' : `border-left:${B};border-bottom:${B}`}}`,
    `${S}.day.other .num{color:${rgba(v.numC, 0.35)}}`,
    `${S}.day.todaybox .num{color:${lum(v.todayC) > 0.18 ? '#141414' : '#FFFFFF'};background:${v.todayC};border-radius:6px}`,
    `${S}.day.todaybg{background:${rgba(v.todayC, 0.16)}}`,
    `${S}.weekdays div{${F('wkF', 17)}color:${v.wkC}}`,
    `${S}.day .ev{${F('evF', 13, true)}color:${v.evC}}`,
    `${S}.day .ev.allday{color:${v.alldayC}}`,
    `${S}.day .ev.holiday{color:${v.holC}}`,
    `${S}.notes h2{${F('headF', 40)}color:${v.notesC}}`,
    `${S}.mh{${F('headF', 26)}color:${v.mealsC}}`,
    `${S}.meals .mh{${F('headF', 32)}}`,
    `${S}.nlist li,${S}.cd .ct{${F('textF', 0, true)}color:${v.textC}}`,
    `${S}.info .lbl,${S}.cd b,${S}.njar span:first-child{${F('textF', 0, true).replace(/font-weight:\d+;/, '')}}`
  ].join('\n');
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------- //
// | Today's mark | //
// ---------------- //
// Today's mark, 46x42, centered on the day number (23,21); 'box' and 'bg'   //
// are drawn by the day itself                                               //
export const TODAY_MARKS: Record<string, string> = {
  ring: 'M11 12C16 7 31 6 37 12s3 17-5 20S11 34 8 26 9 14 14 10',
  circle: 'M38 21a15 15 0 1 1-30 0a15 15 0 1 1 30 0',
  heart: 'M23 38.5C11.5 30.5 4 23.5 4 14.5a9 9 0 0 1 19-4 9 9 0 0 1 19 4C42 23.5 34.5 30.5 23 38.5z',
  star: 'M23.0 3.5L27.6 15.7L40.6 16.3L30.4 24.4L33.9 37.0L23.0 29.8L12.1 37.0L15.6 24.4L5.4 16.3L18.4 15.7z'
};

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
