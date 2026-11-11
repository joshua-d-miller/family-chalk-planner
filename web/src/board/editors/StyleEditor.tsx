/*
===============================================================================
 Family Chalk Planner | Screens | Board editors | StyleEditor.tsx
===============================================================================
 Version:   0.16.1
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

 0.16.1    2026-11-11   joshua    Opens on just this month, which can pick a
                        claude    style of its own; every month is a tap away.
===============================================================================
*/

import { FontPicker } from '../../ui/FontPicker.tsx';
import { useEffect, useState } from 'react';
import { post } from '../../lib/api.ts';
import { SURFACES } from '../../lib/surface.ts';
import { Btn, Segs } from '../../ui/bits.tsx';
import { Colors } from '../../ui/Colors.tsx';
import { Sheet } from '../../ui/Sheet.tsx';
import { PRESETS, TFONTS, monthVals, themeVals } from '../theme.ts';
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
  look: Record<string, string> | null; // this month's own style (p) and tweaks
  onPreviewLook: (l: Record<string, string> | null) => void;
  onClose: () => void;
}) {
  const [d, setD] = useState<Theme>(() => JSON.parse(JSON.stringify(theme || { p: 'classic', o: {} })));
  const [err, setErr] = useState('');
  // every month (the board style), or just this month's style and tweaks
  // just this month unless asked: a change can't reach every month by accident
  const [scope, setScope] = useState<'all' | 'month'>('month');
  const [lk, setLk] = useState<Record<string, string>>(() => ({ ...(look || {}) }));
  useEffect(() => onPreview(d), [d, onPreview]);
  useEffect(() => onPreviewLook(lk), [lk, onPreviewLook]);
  const base = themeVals(d);
  // what this month starts from: its own style, or the board style
  const mBase = monthVals(d, lk.p ? { p: lk.p } : null);
  const v = scope === 'month' ? monthVals(d, lk) : base;
  const style = scope === 'month' ? lk.p || d.p : d.p;
  const close = () => {
    onPreview(null);
    onPreviewLook(null);
    onClose();
  };
  // a tweak just for this month: picking what its style has takes it away
  const setMonth = (k: string, val: string) => {
    const o = { ...lk };
    if (mBase[k] === val) delete o[k];
    else o[k] = val;
    setLk(o);
  };
  // a style just for this month (its tweaks start over); the board's own: none
  const pickMonth = (id: string) => {
    const tweaks = Object.keys(lk).filter(k => k !== 'p').length;
    const name = PRESETS.find(x => x.id === id)?.name;
    if (tweaks && !confirm(`Switch ${monthName} to ${name}? Its own tweaks will be cleared.`)) return;
    setLk(id === d.p ? {} : { p: id });
  };
  const pick = (id: string) => {
    if (scope === 'month') return pickMonth(id);
    const name = PRESETS.find(x => x.id === id)?.name;
    if (Object.keys(d.o || {}).length && !confirm(`Switch to ${name}? Your tweaks will be cleared.`)) return;
    setD({ p: id, o: {}, ...(d.s ? { s: d.s } : {}), ...(d.z ? { z: 1 } : {}) });
  };
  // a tweak: to every month, or just this one
  const tweak = (k: string, val: string) => (scope === 'month' ? setMonth(k, val) : set(k, val));
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
          ['month', `Just ${monthName}`],
          ['all', 'Every month']
        ]}
        label="What to change"
      />
      {scope === 'month' && (
        <div className="sublbl">
          A style, fonts and colors just for {monthName}; every other month keeps the board style. The background stays
          the same for every month.
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
      <div className="sublbl">Style</div>
      <div className="surfaces presets">
        {PRESETS.map(pr => {
          const pv = themeVals({ p: pr.id, o: {} });
          const f = TFONTS[pv.numF];
          return (
            <button
              type="button"
              key={pr.id}
              className={pr.id === style ? 'on' : ''}
              aria-pressed={pr.id === style}
              style={{ borderBottom: `3px ${pv.lineS} ${pv.lineC}` }}
              onClick={() => pick(pr.id)}
            >
              <span className="smp" style={{ fontFamily: f.ff, fontWeight: f.w, color: pv.numC }}>
                9
              </span>
              <span className="pn">{pr.name}</span>
            </button>
          );
        })}
      </div>
      {ROWS.map(r => (
        <div className="threl" key={r.label}>
          <b>{r.label}</b>
          {r.parts.map(([k, kind]) =>
            kind === 'font' ? (
              <FontPicker
                key={k}
                value={v[k]}
                onChange={fk => tweak(k, fk)}
                keyOf={b => b.id}
                classic
                size={18}
                label={r.label}
              />
            ) : kind === 'color' ? (
              <Colors key={k} value={v[k]} onChange={c => c && tweak(k, c)} label={r.label} />
            ) : (
              <Segs key={k} value={v[k]} onChange={val => tweak(k, val)} options={kind} label={r.label} />
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
