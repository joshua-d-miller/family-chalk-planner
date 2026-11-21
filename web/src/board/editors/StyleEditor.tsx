/*
===============================================================================
 Family Chalk Planner | Screens | Board editors | StyleEditor.tsx
===============================================================================
 Version:   1.2.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-07
 Updated:   2026-11-21

 Purpose:
     🎨 Board style: the background, a preset, and her own tweaks to it
     (fonts, colors, lines, today's mark). The board shows it as you pick;
     Save makes it the style on every screen. Its parts are on tabs (Style,
     Days, Events, Notes, Lines), so it's one short card instead of a long
     scroll; Save and Cancel stay at the bottom.

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

 1.1.0    2026-11-17   joshua    Tabs (Style, Days, Events, Notes, Lines)
                        claude    instead of one long card; a dot marks a tab
                                  with changes; Save and Cancel stay at the
                                  bottom.
                                  The new backgrounds, and Your photo: pick a
                                  photo for the background.

 1.1.2    2026-11-20   joshua    The backgrounds are on the Style tab in both
                        claude    modes (they only showed after tapping Every
                                  month).
                                  A background just for this month (Just ...),
                                  or for every month.

 1.2.0    2026-11-21   joshua    On this screen (Style tab): the wooden frame
                        colby     and filling the screen (Colby Way's frame
                        claude    and padding settings, per screen).
                                  A warning when a color is hard to read on
                                  the background picked. Your styles: saved
                                  by name, and shared as a code.
                                  "Discard your changes?" when it's closed
                                  with changes.
===============================================================================
*/

import { FontPicker } from '../../ui/FontPicker.tsx';
import { useEffect, useRef, useState } from 'react';
import { post, upload, url as apiUrl } from '../../lib/api.ts';
import { useLive } from '../../lib/live.ts';
import { SURFACES, surfaceOf } from '../../lib/surface.ts';
import { Btn, Segs, Tabs } from '../../ui/bits.tsx';
import { Colors } from '../../ui/Colors.tsx';
import { Sheet, useChanged } from '../../ui/Sheet.tsx';
import { NEED, PRESETS, TFONTS, monthVals, themeVals } from '../theme.ts';
import { lum, readable } from '../color.ts';
import type { Theme } from '../theme.ts';
import { setBoardFit, useBoardFit } from '../../lib/boardFit.ts';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------- //
// | Hard to read? | //
// ------------------- //
// A color too faint for the background picked: the board already shows it //
// lighter (or darker) so it can be read; this says so, with what it shows. //
function HardToRead({ color, need, bg }: { color: string; need?: number; bg: number }) {
  if (!need || !/^#[0-9a-fA-F]{6}$/.test(color || '')) return null;
  const shown = readable(color, bg, need);
  if (shown.toLowerCase() === color.toLowerCase()) return null;
  const lighter = lum(shown) > lum(color);
  return (
    <span className="hardread" role="note">
      ⚠️ Hard to read on this background: the board shows it a little {lighter ? 'lighter' : 'darker'}{' '}
      <span className="sw" style={{ background: shown }} aria-hidden="true" />
    </span>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------- //
// | Your styles | //
// ---------------- //
// Styles the family saved by name, to put back in one tap (into the card: //
// Save keeps it, Cancel doesn't); and a style as a code, to share with    //
// another board (its background photo stays here: it's this board's own). //
interface Saved {
  name: string;
  theme: Theme;
}
const CODE = 'chalk-style:';
export const styleCode = (t: Theme) => {
  const { img: _img, ...rest } = t;
  if (rest.s === 'photo') delete rest.s;
  return CODE + btoa(unescape(encodeURIComponent(JSON.stringify(rest))));
};
export function fromCode(code: string): Theme | null {
  const c = code.trim();
  if (!c.startsWith(CODE)) return null;
  try {
    const t = JSON.parse(decodeURIComponent(escape(atob(c.slice(CODE.length))))) as Theme;
    return t && typeof t.p === 'string' && typeof t.o === 'object'
      ? { p: t.p, o: t.o || {}, ...(t.s ? { s: t.s } : {}) }
      : null;
  } catch {
    return null;
  }
}
function YourStyles({ current, onUse }: { current: Theme; onUse: (t: Theme) => void }) {
  const saved = useLive<Saved[]>('api/styles', ['styles']);
  const list = saved.data || [];
  const [naming, setNaming] = useState<string | null>(null);
  const [paste, setPaste] = useState('');
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const keep = (next: Saved[]) => {
    saved.set(next);
    post<Saved[]>('api/styles', { styles: next })
      .then(saved.set)
      .catch(e => setMsg((e as Error).message));
  };
  return (
    <div className="yourstyles">
      <div className="sublbl">Your styles</div>
      <div className="segs">
        {list.map(x => (
          <span key={x.name} className="savedstyle">
            <button type="button" className="seg" onClick={() => onUse(x.theme)} title={`Use “${x.name}”`}>
              {x.name}
            </button>
            <button
              type="button"
              className="seg rm"
              aria-label={`Remove “${x.name}”`}
              onClick={() => keep(list.filter(y => y.name !== x.name))}
            >
              ✕
            </button>
          </span>
        ))}
        {naming === null ? (
          <button
            type="button"
            className="seg"
            id="saveStyleBtn"
            onClick={() => setNaming('')}
            disabled={list.length >= 20}
          >
            ＋ Add to your styles…
          </button>
        ) : (
          <form
            className="namestyle"
            onSubmit={e => {
              e.preventDefault();
              const name = naming.trim();
              if (!name) return;
              keep([...list.filter(y => y.name !== name), { name, theme: current }]);
              setNaming(null);
              setMsg(`“${name}” is in your styles`);
            }}
          >
            <input
              id="styleName"
              aria-label="A name for this style"
              placeholder="A name for it"
              maxLength={30}
              autoFocus
              value={naming}
              onChange={e => setNaming(e.target.value)}
            />
            <button type="submit" className="seg on" id="styleNameSave">
              Add
            </button>
          </form>
        )}
      </div>
      <div className="segs sharestyle">
        <button
          type="button"
          className="seg"
          id="copyStyleBtn"
          onClick={() => {
            const c = styleCode(current);
            setCode(c);
            navigator.clipboard
              ?.writeText(c)
              .then(() => setMsg('Copied: paste it into another board’s Board style'))
              .catch(() => setMsg('Select the code below and copy it'));
          }}
        >
          📋 Copy style code
        </button>
        <input
          id="pasteStyle"
          aria-label="Paste a style code"
          placeholder="Paste a style code"
          value={paste}
          onChange={e => setPaste(e.target.value)}
        />
        <button
          type="button"
          className="seg"
          id="useStyleCode"
          disabled={!paste.trim()}
          onClick={() => {
            const t = fromCode(paste);
            if (!t) return setMsg('That isn’t a style code (it starts with chalk-style:)');
            onUse(t);
            setPaste('');
            setMsg('The style is in the card: Save keeps it');
          }}
        >
          Use it
        </button>
      </div>
      {code && (
        <input
          className="stylecode"
          id="styleCode"
          readOnly
          value={code}
          aria-label="This style's code"
          onFocus={e => e.target.select()}
        />
      )}
      {msg && <div className="dim small">{msg}</div>}
    </div>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------ //
// | On this screen | //
// ------------------ //
// Just for this screen, and saved as it's tapped (not with the board's    //
// style): the wooden frame (a screen in a frame of its own leaves it off), //
// and filling the screen (a taller calendar instead of bands).             //
export function ScreenFit() {
  const fit = useBoardFit();
  return (
    <div className="screenfit">
      <div className="sublbl">On this screen</div>
      <label className="tick">
        <input
          type="checkbox"
          id="frameBox"
          checked={!fit.noFrame}
          onChange={e => void setBoardFit({ noFrame: !e.target.checked })}
        />{' '}
        🪵 The wooden frame around the board
      </label>
      <label className="tick">
        <input
          type="checkbox"
          id="fillBox"
          checked={fit.fill}
          onChange={e => void setBoardFit({ fill: e.target.checked })}
        />{' '}
        ↕️ Fill the screen (taller days, no bands above and below)
      </label>
    </div>
  );
}

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

// ------------------------ //
// | The tabs, and theirs | //
// ------------------------ //
// Which tab each row is on (Style has the background and the presets).      //
type Tab = 'style' | 'days' | 'events' | 'notes' | 'lines';
const TABS: [Tab, string][] = [
  ['style', 'Style'],
  ['days', 'Days'],
  ['events', 'Events'],
  ['notes', 'Notes'],
  ['lines', 'Lines']
];
const TAB_OF: Record<string, Tab> = {
  'Day numbers': 'days',
  'Number boxes': 'days',
  Today: 'days',
  'Weekday names': 'days',
  Events: 'events',
  'All-day events': 'events',
  Holidays: 'events',
  Headings: 'notes',
  '“Notes” color': 'notes',
  '“Meal Plan” color': 'notes',
  'Notes text': 'notes',
  'Calendar lines': 'lines'
};
// a tab with changes of its own gets a dot
const tabsWith = (tweaks: string[]) =>
  TABS.map(([t]) => t).filter(t => ROWS.some(r => TAB_OF[r.label] === t && r.parts.some(([k]) => tweaks.includes(k))));

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
  const [tab, setTab] = useState<Tab>('style');
  const file = useRef<HTMLInputElement>(null); // a photo of your own, for the background
  // a photo of your own: kept on the board, then the background
  async function pickPhoto(f: File | undefined) {
    if (!f) return;
    setErr('');
    try {
      const { src } = await upload(f);
      setBg('photo', src);
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  const [lk, setLk] = useState<Record<string, string>>(() => ({ ...(look || {}) }));
  const changed = useChanged({ d, lk }); // (✕ with changes: "Discard your changes?")
  // ------------------ //
  // | The background | //
  // ------------------ //
  // Just this month: its own (lk.s, lk.img), or none = the board's. Every   //
  // month: the board's (d.s, d.img).                                        //
  const bgNow = scope === 'month' && lk.s ? { s: lk.s, img: lk.img } : { s: d.s || 'slate', img: d.img };
  function setBg(sId: string, img?: string) {
    if (scope === 'month') {
      const o = { ...lk };
      delete o.s;
      delete o.img;
      // the same as the board's: nothing of its own
      if (!(sId === (d.s || 'slate') && (sId !== 'photo' || img === d.img))) {
        o.s = sId;
        if (img) o.img = img;
      }
      return setLk(o);
    }
    const n: Theme = { ...d, s: sId };
    if (sId === 'slate') delete n.s;
    delete n.img;
    if (img) n.img = img;
    setD(n);
  }
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
  // ------------------------------------- //
  // | The style shown now, to save | //
  // ------------------------------------- //
  // Its preset, what differs from that preset, and its background.          //
  const presetVals = themeVals({ p: style, o: {} });
  const current: Theme = {
    p: style,
    o: Object.fromEntries(Object.entries(v).filter(([k, x]) => presetVals[k] !== x)),
    ...(bgNow.s && bgNow.s !== 'slate' ? { s: bgNow.s } : {}),
    ...(bgNow.s === 'photo' && bgNow.img ? { img: bgNow.img } : {})
  };
  // a saved (or pasted) style, put in the card: every month's, or this month's own
  const use = (t: Theme) => {
    if (scope === 'all') return setD({ ...t, o: { ...t.o } });
    setLk({ p: t.p, ...t.o, ...(t.s ? { s: t.s } : {}), ...(t.img ? { img: t.img } : {}) });
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
    const tweaks = Object.keys(lk).filter(k => !['p', 's', 'img'].includes(k)).length;
    const name = PRESETS.find(x => x.id === id)?.name;
    if (tweaks && !confirm(`Switch ${monthName} to ${name}? Its own tweaks will be cleared.`)) return;
    const bg = { ...(lk.s ? { s: lk.s } : {}), ...(lk.img ? { img: lk.img } : {}) }; // its background stays
    setLk(id === d.p ? bg : { ...bg, p: id });
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
    <Sheet
      title="Board style"
      onClose={close}
      dirty={changed}
      id="styleSheet"
      tall
      head={
        <>
          <Segs
            value={scope}
            onChange={setScope}
            options={[
              ['month', `Just ${monthName}`],
              ['all', 'Every month']
            ]}
            label="What to change"
          />
          <Tabs
            label="Parts of the board"
            value={tab}
            onChange={setTab}
            options={TABS}
            marked={tabsWith(Object.keys(scope === 'month' ? lk : d.o || {}))}
          />
        </>
      }
    >
      {tab === 'style' && scope === 'month' && (
        <div className="sublbl">
          A style, fonts and colors just for {monthName}; every other month keeps the board style.
        </div>
      )}
      {/* the background: this month's own (Just {month}), or the board's (Every month) */}
      {tab === 'style' && (
        <>
          <div className="sublbl">
            {scope === 'month'
              ? lk.s
                ? `Background just for ${monthName}`
                : `Background for ${monthName} (now the same as every month: pick one to change it)`
              : 'Background for every month'}
          </div>
          <div className="surfaces">
            {SURFACES.map(sf => {
              const light = sf.lum > 0.18;
              const photo = sf.id === 'photo';
              return (
                <button
                  type="button"
                  key={sf.id}
                  id={'surface-' + sf.id}
                  className={bgNow.s === sf.id ? 'on' : ''}
                  aria-pressed={bgNow.s === sf.id}
                  style={{
                    background:
                      photo && bgNow.img
                        ? `linear-gradient(rgba(0,0,0,.45), rgba(0,0,0,.45)), url("${apiUrl(bgNow.img)}") center / cover`
                        : `radial-gradient(circle at 50% 40%, ${sf.base[0]}, ${sf.base[1]})`
                  }}
                  onClick={() => {
                    // your photo: pick one (again, to change it)
                    if (photo) return file.current?.click();
                    setBg(sf.id);
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
          <input
            ref={file}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            id="surfacePhoto"
            onChange={e => {
              void pickPhoto(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          {bgNow.s === 'photo' && (
            <div className="sublbl">
              Your photo is dimmed so the writing stays readable. A calm photo (a sky, a lake, a wall) works best; a
              busy one can make small writing hard to read. Tap it again for another photo.
            </div>
          )}
          <label className="tick" hidden={scope === 'month'}>
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
      {tab === 'style' && <div className="sublbl">Style</div>}
      <div className="surfaces presets" hidden={tab !== 'style'}>
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
      {tab === 'style' && <YourStyles current={current} onUse={use} />}
      {tab === 'style' && <ScreenFit />}
      {ROWS.filter(r => TAB_OF[r.label] === tab).map(r => (
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
              <span key={k} className="colorpart">
                <Colors value={v[k]} onChange={c => c && tweak(k, c)} label={r.label} />
                <HardToRead color={v[k]} need={NEED[k]} bg={surfaceOf(bgNow.s).lum} />
              </span>
            ) : (
              <Segs key={k} value={v[k]} onChange={val => tweak(k, val)} options={kind} label={r.label} />
            )
          )}
        </div>
      ))}
      <div className="err">{err}</div>
      <div className="actions sfoot">
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
