/*
===============================================================================
 Family Chalk Planner | Screens | Board editors | BorderEditor.tsx
===============================================================================
 Version:   0.16.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-07
 Updated:   2026-11-11

 Purpose:
     🖼 Border: a ready-made holiday set, or up to 8 pictures of her own,
     repeated around the calendar, for this month or every year in this
     month. The board shows it as you pick.

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

 0.16.0    2026-11-11   joshua    A Holly & bows border.
                        claude

                                  A Twinkling lights border.
===============================================================================
*/

import { useEffect, useState } from 'react';
import { get, post } from '../../lib/api.ts';
import { Btn, Segs } from '../../ui/bits.tsx';
import { Colors, CHALK } from '../../ui/Colors.tsx';
import { Sheet } from '../../ui/Sheet.tsx';
import type { MonthMeta } from '../Board.tsx';
import { clipLabel, clipSrc, searchClip } from '../clip.ts';
import type { Border } from '../Month.tsx';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------------- //
// | Ready-made borders | //
// ---------------------- //
const PRESETS: [string, string, string][] = [
  ['🎃 Halloween', 'jack-o-lantern gi-bat gi-mummy-head gi-vampire-dracula gi-witch-face ghost', '#F3A35E'],
  ['🦃 Thanksgiving', 'gi-pumpkin gi-corn turkey maple-leaf gi-acorn gi-wheat', '#F2D479'],
  ['🎄 Christmas', 'christmas-tree wrapped-gift gi-candy-canes snowman star santa-claus', '#A9D8A0'],
  ['✨ Twinkling lights', 'cp-bulb-red cp-bulb-gold cp-bulb-green cp-bulb-blue cp-bulb-pink', '#F2D479'],
  ['🎀 Holly & bows', 'cp-holly cp-ornament-red cp-bow cp-ornament-gold cp-candy-cane cp-present', '#F6B3CB'],
  ['❄️ Winter', 'snowflake gi-snowflake-2 snowman gi-winter-hat', '#EDEAE0'],
  ['💕 Valentine’s', 'red-heart gi-hearts pink-heart love-letter', '#F6B3CB'],
  ['☘️ St. Patrick’s', 'shamrock four-leaf-clover rainbow gi-clover', '#A9D8A0'],
  ['🐣 Easter', 'rabbit-face egg gi-easter-egg tulip hatching-chick', '#F6B3CB'],
  ['🌷 Spring', 'tulip cherry-blossom butterfly gi-daisy', '#EDEAE0'],
  ['🎆 Fireworks', 'fireworks gi-firework-rocket sparkles star', '#F2D479'],
  ['☀️ Summer', 'sun watermelon gi-palm-tree beach-with-umbrella', '#F2D479'],
  ['🎂 Birthday', 'birthday-cake balloon party-popper wrapped-gift', '#F6B3CB'],
  ['🎒 Back to school', 'school-bus books pencil backpack red-apple', '#EDEAE0']
];

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------------- //
// | The month's border | //
// ---------------------- //
export function BorderEditor({
  ym,
  monthName,
  meta,
  onPreview,
  onClose
}: {
  ym: string;
  monthName: string;
  meta: MonthMeta | null;
  onPreview: (b: Border | null | undefined) => void; // undefined: no preview
  onClose: () => void;
}) {
  const cur = meta?.border;
  const [b, setB] = useState<Border>(
    cur ? { items: cur.items.slice(), color: cur.color, size: cur.size } : { items: [], color: '#EDEAE0', size: 'm' }
  );
  const [yearly, setYearly] = useState(cur ? !!meta?.borderYearly : true);
  const [names, setNames] = useState<string[] | null>(null);
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    get<string[]>('api/clip/list').then(setNames, e => setErr('Couldn’t load the pictures: ' + (e as Error).message));
  }, []);
  useEffect(() => onPreview(b.items.length ? b : null), [b, onPreview]);
  const close = () => {
    onPreview(undefined);
    onClose();
  };
  const have = (n: string) => !!names?.includes(n);
  const add = (n: string) => {
    if (b.items.includes(n)) return;
    if (b.items.length >= 8) return setErr('Up to 8 pictures - take one out first');
    setErr('');
    setB({ ...b, items: [...b.items, n] });
  };
  async function save(border: Border | null) {
    try {
      await post('api/border', { ym, border, yearly });
      close();
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  const found = names ? searchClip(names, q) : [];
  return (
    <Sheet title={`Border for ${monthName}`} onClose={close} id="borderSheet">
      <div className="sublbl">Ready-made - then add or take out pictures</div>
      <div className="segs">
        {PRESETS.map(([label, list, color]) => {
          const items = list.split(' ').filter(have);
          if (!items.length) return null;
          return (
            <button
              type="button"
              key={label}
              className="seg"
              onClick={() => setB({ ...b, items: items.slice(0, 8), color })}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div className="sublbl">In the border (up to 8, repeated around the calendar; tap one to take it out)</div>
      <div className="bpicks">
        {!b.items.length && <div className="sublbl">Nothing yet</div>}
        {b.items.map((n, i) => (
          <button
            type="button"
            key={n}
            className="ctile"
            aria-label={'Take out ' + clipLabel(n)}
            onClick={() => setB({ ...b, items: b.items.filter((_, k) => k !== i) })}
          >
            <img alt="" src={clipSrc(n, b.color)} />
          </button>
        ))}
      </div>
      <input
        type="search"
        className="clipq"
        placeholder="Add pictures: pumpkin, mummy, corn, snowman…"
        value={q}
        onChange={e => setQ(e.target.value)}
        aria-label="Find pictures"
      />
      {q.trim() && (
        <div className="cgrid">
          {!found.length && <div className="empty">Nothing for “{q}” - try another word</div>}
          {found.map(n => (
            <button type="button" key={n} className="ctile" title={clipLabel(n)} onClick={() => add(n)}>
              <img alt={clipLabel(n)} loading="lazy" src={clipSrc(n, b.color)} />
            </button>
          ))}
        </div>
      )}
      <div className="sublbl">Color for the chalk drawings (the one-color pictures)</div>
      <Colors value={b.color} onChange={c => c && setB({ ...b, color: c })} set={CHALK} label="Drawing color" />
      <div className="sublbl">Size</div>
      <Segs
        value={b.size}
        onChange={size => setB({ ...b, size })}
        options={[
          ['s', 'Small'],
          ['m', 'Medium'],
          ['l', 'Large']
        ]}
      />
      <label className="tick">
        <input type="checkbox" checked={yearly} onChange={e => setYearly(e.target.checked)} /> Every year in {monthName}
      </label>
      <div className="err">{err}</div>
      <div className="actions">
        <Btn kind="warn" className="left" onClick={() => save(null)}>
          No border
        </Btn>
        <Btn onClick={close}>Cancel</Btn>
        <Btn kind="go" onClick={() => save(b.items.length ? b : null)}>
          Save
        </Btn>
      </div>
    </Sheet>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
