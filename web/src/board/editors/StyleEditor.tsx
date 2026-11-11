/*
===============================================================================
 Family Chalk Planner | Screens | Board editors | StyleEditor.tsx
===============================================================================
 Version:   0.16.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-07
 Updated:   2026-11-11

 Purpose:
     🎨 Board style: the background, a preset, and her own tweaks to it
     (fonts, colors, lines, today's mark). The board shows it as you pick;
     Save makes it the style on every screen.

 Used by:
     web/src/board/Board.tsx
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

 0.16.0    2026-11-11   joshua    Colors just for this month, or the style for
                        claude    every month.
===============================================================================
*/

import { FontPicker } from '../../ui/FontPicker.tsx';
import { useEffect, useState } from 'react';
import { post } from '../../lib/api.ts';
import { SURFACES } from '../../lib/surface.ts';
import { Btn, Segs } from '../../ui/bits.tsx';
import { Colors } from '../../ui/Colors.tsx';
import { Sheet } from '../../ui/Sheet.tsx';
import { PRESETS, TFONTS, themeVals } from '../theme.ts';
import type { Theme } from '../theme.ts';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------------------- //
// | What can be changed | //
// ----------------------- //
type Part = [string, 'font' | 'color' | [string, string][]];
const ROWS: { label: string; parts: Part[] }[] = [
  {
    label: 'Day numbers',
    parts: [
      ['numF', 'font'],
      ['numC', 'color']
    ]
  },
  {
    label: 'Number boxes',
    parts: [
      [
        'boxes',
        [
          ['on', 'Show'],
          ['off', 'Hide']
        ]
      ]
    ]
  },
  {
    label: 'Today',
    parts: [
      [
        'todayS',
        [
          ['ring', '◯ Chalk'],
          ['circle', '○ Circle'],
          ['heart', '♡ Heart'],
          ['star', '☆ Star'],
          ['box', '■ Box'],
          ['bg', '▦ Whole day']
        ]
      ],
      ['todayC', 'color']
    ]
  },
  {
    label: 'Weekday names',
    parts: [
      ['wkF', 'font'],
      ['wkC', 'color']
    ]
  },
  {
    label: 'Events',
    parts: [
      ['evF', 'font'],
      ['evC', 'color']
    ]
  },
  { label: 'All-day events', parts: [['alldayC', 'color']] },
  { label: 'Holidays', parts: [['holC', 'color']] },
  { label: 'Headings', parts: [['headF', 'font']] },
  { label: '“Notes” color', parts: [['notesC', 'color']] },
  { label: '“Meal Plan” color', parts: [['mealsC', 'color']] },
  {
    label: 'Notes text',
    parts: [
      ['textF', 'font'],
      ['textC', 'color']
    ]
  },
  {
    label: 'Calendar lines',
    parts: [
      ['lineC', 'color'],
      [
        'lineS',
        [
          ['solid', 'Solid'],
          ['dashed', 'Dashed'],
          ['dotted', 'Dotted']
        ]
      ],
      [
        'lineW',
        [
          ['thin', 'Thin'],
          ['normal', 'Normal'],
          ['bold', 'Bold']
        ]
      ]
    ]
  }
];

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------------------- //
// | The board's style | //
// --------------------- //
export function StyleEditor({
  theme,
  onPreview,
  ym,
  monthName,
  look,
  onPreviewLook,
  onClose
}: {
  theme: Theme | null;
  onPreview: (t: Theme | null) => void;
  ym: string;
  monthName: string;
  look: Record<string, string> | null; // this month's own colors
  onPreviewLook: (l: Record<string, string> | null) => void;
  onClose: () => void;
}) {
  const [d, setD] = useState<Theme>(() => JSON.parse(JSON.stringify(theme || { p: 'classic', o: {} })));
  const [err, setErr] = useState('');
  // every month (the board style), or just this month's colors
  const [scope, setScope] = useState<'all' | 'month'>(look ? 'month' : 'all');
  const [lk, setLk] = useState<Record<string, string>>(() => ({ ...(look || {}) }));
  useEffect(() => onPreview(d), [d, onPreview]);
  useEffect(() => onPreviewLook(lk), [lk, onPreviewLook]);
  const base = themeVals(d);
  const v = scope === 'month' ? { ...base, ...lk } : base;
  const close = () => {
    onPreview(null);
    onPreviewLook(null);
    onClose();
  };
  // a color just for this month: picking the board style's own takes it away
  const setMonth = (k: string, val: string) => {
    const o = { ...lk };
    if (base[k] === val) delete o[k];
    else o[k] = val;
    setLk(o);
  };
  // only real tweaks are kept: picking the preset's own value takes the tweak away
  const set = (k: string, val: string) => {
    const o = { ...(d.o || {}) };
    if (themeVals({ p: d.p, o: {} })[k] === val) delete o[k];
    else o[k] = val;
    setD({ ...d, o });
  };
  async function save() {
    try {
      await post('api/theme', d);
      // this month's colors (or none: like every month)
      if (JSON.stringify(lk) !== JSON.stringify(look || {}))
        await post('api/meta', { ym, look: Object.keys(lk).length ? lk : null });
      close();
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  return (
    <Sheet title="Board style" onClose={close} id="styleSheet">
      <Segs
        value={scope}
        onChange={setScope}
        options={[
          ['all', 'Every month'],
          ['month', `Colors just for ${monthName}`]
        ]}
        label="What to change"
      />
      {scope === 'month' && (
        <div className="sublbl">
          Colors picked here are only for {monthName}; everything else comes from the board style. Picking the board
          style’s own color takes this month’s away.
        </div>
      )}
      {scope === 'all' && (
        <>
          <div className="sublbl">Background</div>
          <div className="surfaces">
            {SURFACES.map(sf => {
              const light = sf.lum > 0.18;
              return (
                <button
                  type="button"
                  key={sf.id}
                  className={(d.s || 'slate') === sf.id ? 'on' : ''}
                  aria-pressed={(d.s || 'slate') === sf.id}
                  style={{ background: `radial-gradient(circle at 50% 40%, ${sf.base[0]}, ${sf.base[1]})` }}
                  onClick={() => {
                    const n: Theme = { ...d, s: sf.id };
                    if (sf.id === 'slate') delete n.s;
                    setD(n);
                  }}
                >
                  <span className="smp" style={{ color: light ? '#B0275F' : '#F6B3CB' }}>
                    Aa
                  </span>
                  <span className="pn" style={{ color: light ? '#2A2A2A' : '#EDEAE0' }}>
                    {sf.name}
                  </span>
                </button>
              );
            })}
          </div>
          <label className="tick">
            <input
              type="checkbox"
              checked={!!d.z}
              onChange={e => {
                const n = { ...d };
                if (e.target.checked) n.z = 1;
                else delete n.z;
                setD(n);
              }}
            />{' '}
            🍂 Change with the season
          </label>
        </>
      )}
      {scope === 'all' && <div className="sublbl">Style</div>}
      {scope === 'all' && (
        <div className="surfaces presets">
          {PRESETS.map(pr => {
            const pv = themeVals({ p: pr.id, o: {} });
            const f = TFONTS[pv.numF];
            return (
              <button
                type="button"
                key={pr.id}
                className={pr.id === d.p ? 'on' : ''}
                aria-pressed={pr.id === d.p}
                style={{ borderBottom: `3px ${pv.lineS} ${pv.lineC}` }}
                onClick={() => {
                  if (Object.keys(d.o || {}).length && !confirm(`Switch to ${pr.name}? Your tweaks will be cleared.`))
                    return;
                  setD({ p: pr.id, o: {}, ...(d.s ? { s: d.s } : {}), ...(d.z ? { z: 1 } : {}) });
                }}
              >
                <span className="smp" style={{ fontFamily: f.ff, fontWeight: f.w, color: pv.numC }}>
                  9
                </span>
                <span className="pn">{pr.name}</span>
              </button>
            );
          })}
        </div>
      )}
      {ROWS.filter(r => scope === 'all' || r.parts.some(([, kind]) => kind === 'color')).map(r => (
        <div className="threl" key={r.label}>
          <b>{r.label}</b>
          {r.parts
            .filter(([, kind]) => scope === 'all' || kind === 'color')
            .map(([k, kind]) =>
              kind === 'font' ? (
                <FontPicker
                  key={k}
                  value={v[k]}
                  onChange={fk => set(k, fk)}
                  keyOf={b => b.id}
                  classic
                  size={18}
                  label={r.label}
                />
              ) : kind === 'color' ? (
                <Colors
                  key={k}
                  value={v[k]}
                  onChange={c => c && (scope === 'month' ? setMonth(k, c) : set(k, c))}
                  label={r.label}
                />
              ) : (
                <Segs key={k} value={v[k]} onChange={val => set(k, val)} options={kind} label={r.label} />
              )
            )}
        </div>
      ))}
      <div className="err">{err}</div>
      <div className="actions">
        {scope === 'all' ? (
          <Btn
            className="left"
            onClick={() => setD({ p: d.p, o: {}, ...(d.s ? { s: d.s } : {}), ...(d.z ? { z: 1 } : {}) })}
          >
            Undo my tweaks
          </Btn>
        ) : (
          <Btn className="left" id="lookClear" onClick={() => setLk({})}>
            Like every month
          </Btn>
        )}
        <Btn onClick={close}>Cancel</Btn>
        <Btn kind="go" onClick={save}>
          Save
        </Btn>
      </div>
    </Sheet>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
