/*
===============================================================================
 Family Chalk Planner | Screens | Drawing | Library.tsx
===============================================================================
 Version:   0.16.1
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-07
 Updated:   2026-11-11

 Purpose:
     ★ Stamps: clipart and chalk drawings, emoji, GIFs (her own and
     animated emoji) and the family's own saved stamps. Pick one, then tap
     the board where it should go.

 Used by:
     web/src/board/Board.tsx
     web/src/board/draw/Find.tsx
     web/src/board/draw/Tools.tsx
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

 0.14.0    2026-11-07   joshua    Clipart in 8 styles, or all of them side by
                        claude    side.

 0.14.1    2026-11-08   joshua    Clipart is placed with its path, so the
                        claude    board saves it.

 0.16.0    2026-11-11   joshua    A picture goes up in its own shape (a garland
                        claude    long and thin).

 0.16.1    2026-11-11   joshua    Garland & trims is a group in the everyday
                        claude    clipart (right after Favorites) and found by
                                  searching; picking its style shows all of it.
===============================================================================
*/

import { useEffect, useMemo, useState } from 'react';
import { get, post, upload, url } from '../../lib/api.ts';
import { Segs } from '../../ui/bits.tsx';
import { CHALK, Colors } from '../../ui/Colors.tsx';
import { Sheet } from '../../ui/Sheet.tsx';
import { Art } from '../Art.tsx';
import type { ArtItem } from '../Art.tsx';
import { clipLabel, clipPath, clipSrc, searchClip } from '../clip.ts';
import { unionBox } from '../geom.ts';
import { FindPane } from './Find.tsx';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------- //
// | Stamps | //
// ---------- //
export type Stamp = { name: string; items: ArtItem[] };
const SIZES: [string, string][] = [
  ['0.6', 'Small'],
  ['1', 'Normal'],
  ['1.5', 'Big']
];
const SETS: [string, string][] = [
  [
    '⭐ Favorites',
    'red-heart star glowing-star sparkles sun rainbow balloon wrapped-gift birthday-cake cupcake party-popper confetti-ball trophy crown house dog-face cat-face teddy-bear unicorn rocket'
  ],
  [
    '🍂 Fall',
    'jack-o-lantern maple-leaf fallen-leaf ghost bat spider spider-web candy lollipop turkey sunflower red-apple pie mushroom chestnut'
  ],
  [
    '❄️ Winter',
    'snowflake snowman christmas-tree wrapped-gift santa-claus menorah gloves scarf hot-beverage cookie candle ice-skate skier'
  ],
  [
    '🌷 Spring',
    'tulip blossom cherry-blossom rabbit-face egg hatching-chick four-leaf-clover rainbow umbrella-with-rain-drops butterfly lady-beetle seedling bouquet'
  ],
  [
    '☀️ Summer',
    'sun beach-with-umbrella watermelon soft-ice-cream ice-cream tropical-drink sunglasses palm-tree crab tent camping fireworks'
  ],
  [
    '🎓 School & sports',
    'school graduation-cap books pencil backpack crayon artist-palette soccer-ball basketball baseball american-football volleyball tennis ballet-shoes guitar musical-notes'
  ],
  [
    '🍕 Food',
    'pizza hamburger taco spaghetti hot-dog pancakes croissant cooking green-salad sushi doughnut popcorn strawberry banana grapes'
  ],
  [
    '🐶 Animals',
    'dog-face cat-face rabbit-face bear panda fox monkey-face unicorn horse cow-face pig-face chicken penguin owl turtle fish dolphin sauropod t-rex'
  ],
  [
    '🚗 Going places',
    'house airplane automobile bus bicycle sailboat train hospital church stadium tent world-map luggage'
  ]
];
const EMOJI: [string, string][] = [
  [
    'Holidays',
    '🎂 🎉 🎈 🎁 🎊 🥳 🍰 🕯️ ❤️ 💝 💘 🌹 🍀 ☘️ 🐣 🐰 🥚 🌷 🇺🇸 🎆 🎇 🗽 🎃 👻 🦇 🍬 🍭 🦃 🍂 🥧 🎄 🎅 🤶 ⛄ ❄️ 🕎 ✡️ 🪔'
  ],
  ['Feelings', '😀 😄 😁 😊 🥰 😍 😎 🤩 🥳 😂 😴 🤒 🤗 😮 😢 😡 👍 👏 🙌 💪 🙏 👋 ❤️ 💯 ✨ 🌟 🏆 🥇'],
  ['Activities', '⚽ 🏀 ⚾ 🏈 🎾 🏐 🏒 🥋 🏊 🚴 ⛸️ 🎿 🎣 🎹 🎸 🥁 🎻 🎤 🎨 📚 ✏️ 🎒 🏫 🎭 🎬 🎮 🧩 🎲 🎳 💃'],
  ['Food', '🍕 🍔 🌮 🌯 🍝 🍣 🍜 🥞 🧇 🥓 🍳 🥪 🥗 🍗 🌭 🍟 🧁 🍰 🍪 🍩 🍦 🍫 🍎 🍌 🍓 🍉 🍇 🍿 ☕ 🥤 🧃 🍽️'],
  ['Places', '🏠 🏡 🏫 🏥 ⛪ 🏖️ ⛰️ 🏕️ 🏞️ 🎡 🎢 🏟️ ✈️ 🚗 🚌 🚲 🚂 ⛵ 🧳 🗺️ 🛒 💈 🦷 🏦 📮'],
  ['Nature', '☀️ 🌤️ ⛅ 🌧️ ⛈️ 🌈 ❄️ 🌙 ⭐ 🌻 🌸 🌼 🌵 🍁 🌲 🌊 🐶 🐱 🐾 🐟 🐢 🦋 🐝 🐞 🦉 🐴 🦄 🐻 🐧'],
  ['Reminders', '🗑️ ♻️ 🧺 🧹 🧽 🛁 💊 🩺 📅 ⏰ ⏳ 💡 🔔 📞 📬 💰 🧾 📝 📌 🔑 🧸 🐕 🌱 🚿']
];
const GIF_MODES: [string, string][] = [
  ['gentle', 'Now and then'],
  ['loop', 'All the time'],
  ['still', 'Never moves']
];
type Gif = { id: string; src: string; still: string; w: number; h: number };
type Anim = { cp: string; tags: string; cat: string };

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------------- //
// | The library | //
// --------------- //
export function Library({
  onPick,
  onClose,
  bg
}: {
  onPick: (s: Stamp, k: number) => void;
  onClose: () => void;
  bg: number;
}) {
  const [pane, setPane] = useState<'clip' | 'emoji' | 'find' | 'gif' | 'mine'>('clip');
  const [k, setK] = useState('1');
  const pick = (s: Stamp) => onPick(s, +k);
  return (
    <Sheet title="Stamps" onClose={onClose} id="libSheet">
      <div className="libtabs">
        <Segs
          value={pane}
          onChange={setPane}
          label="Kind"
          options={[
            ['clip', 'Clipart'],
            ['emoji', 'Emoji'],
            ['find', 'Find more'],
            ['gif', 'GIFs'],
            ['mine', 'My stamps']
          ]}
        />
        <Segs value={k} onChange={setK} options={SIZES} label="Size" />
      </div>
      <div className="lscroll">
        {pane === 'clip' && <ClipPane pick={pick} />}
        {pane === 'emoji' && <EmojiPane pick={pick} />}
        {pane === 'find' && <FindPane pick={pick} />}
        {pane === 'gif' && <GifPane pick={pick} />}
        {pane === 'mine' && <MinePane pick={pick} bg={bg} />}
      </div>
    </Sheet>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------ //
// | Clip art | //
// ------------ //
// own: pictures of its own (the garland set), not the everyday ones redrawn
type ClipStyle = { prefix: string; name: string; credit: string; count: number; own?: boolean };
const FLUENT = { prefix: '', name: 'Fluent', credit: 'Fluent Emoji by Microsoft (MIT)', count: 1 };
function ClipPane({ pick }: { pick: (s: Stamp) => void }) {
  const [names, setNames] = useState<string[] | null>(null);
  const [groups, setGroups] = useState<Record<string, string[]>>({});
  const [styles, setStyles] = useState<ClipStyle[]>([]);
  const [style, setStyle] = useState(''); // '' Fluent (and the chalk drawings), a set's short name, or 'all'
  const [others, setOthers] = useState<Record<string, string[]>>({}); // each style's names, once loaded
  const [err, setErr] = useState('');
  const [set, setSet] = useState(0);
  const [q, setQ] = useState('');
  const [color, setColor] = useState('#EDEAE0');
  useEffect(() => {
    get<string[]>('api/clip/list').then(setNames, e => setErr('Couldn’t load clipart: ' + (e as Error).message));
    get<Record<string, string[]>>('api/clip/drawings').then(setGroups, () => {});
    get<ClipStyle[]>('api/clip/styles').then(setStyles, () => {});
  }, []);
  // a style's names, the first time it's chosen (or every style's, for All)
  useEffect(() => {
    // (the sets with pictures of their own are wanted from the start: they're in the everyday view too)
    const own = styles.filter(s => s.own && s.count).map(s => s.prefix);
    const want = [...own, ...(style === 'all' ? styles.map(s => s.prefix) : style ? [style] : [])];
    for (const p of want)
      if (!others[p])
        get<string[]>('api/clip/list?style=' + p).then(
          l => setOthers(o => ({ ...o, [p]: l })),
          e => setErr((e as Error).message)
        );
  }, [style, styles, others]);
  const sets = useMemo(
    () => [
      ...SETS.slice(0, 1),
      // a set of its own pictures (Garland & trims) as a group, right after Favorites
      ...(style
        ? []
        : styles
            .filter(s => s.own && others[s.prefix]?.length)
            .map(s => ['🎄 ' + s.name, others[s.prefix].join(' ')] as [string, string])),
      ...SETS.slice(1),
      ...(style ? [] : Object.entries(groups).map(([g, l]) => [g, l.join(' ')] as [string, string]))
    ],
    [groups, style, styles, others]
  );
  // the everyday view: Fluent, the chalk drawings, and the sets with pictures of their own
  const everyday = useMemo(
    () => (names ? names.concat(...styles.filter(s => s.own).map(s => others[s.prefix] || [])) : null),
    [names, styles, others]
  );
  // the Fluent names in a group or search, as this style draws them (where it has one)
  const inStyle = (base: string[], p: string) => {
    const have = new Set(others[p] || []);
    return base.map(n => p + '-' + n).filter(n => have.has(n));
  };
  const strip = (l: string[], p: string) => l.map(n => n.slice(p.length + 1));
  let list: string[] = [];
  if (names && everyday) {
    const group = (sets[set]?.[1] || '').split(' ');
    const own = styles.find(s => s.prefix === style)?.own;
    if (!style) list = q.trim() ? searchClip(everyday, q, 120) : group.filter(n => everyday.includes(n));
    // a set of its own pictures: all of them (it has few of the everyday ones)
    else if (own && !q.trim()) list = others[style] || [];
    else {
      const ps = style === 'all' ? ['', ...styles.map(s => s.prefix)] : [style];
      const per = ps.map(p => {
        if (!p) return q.trim() ? searchClip(names, q, 40) : group.filter(n => names.includes(n));
        const mine = others[p] || [];
        return q.trim()
          ? searchClip(strip(mine, p), q, style === 'all' ? 30 : 120).map(n => p + '-' + n)
          : inStyle(group, p);
      });
      // All: each picture in every style, side by side
      const longest = Math.max(0, ...per.map(l => l.length));
      for (let i = 0; i < longest; i++) for (const l of per) if (l[i]) list.push(l[i]);
      list = list.slice(0, 160);
    }
  }
  const credit =
    style === 'all'
      ? 'every style (choose one to see who made it; all are credited in NOTICE)'
      : (styles.find(s => s.prefix === style) || FLUENT).credit +
        (style ? '' : ' · Chalk drawings: game-icons.net (CC BY 3.0)');
  const place = (n: string) => {
    const s = clipPath(n, color); // the board keeps the path; the full address only works on this screen
    const put = (w: number, h: number) =>
      pick({ name: clipLabel(n), items: [{ id: 0, k: 'g', x: 0, y: 0, w, h, src: s, still: s, mode: 'still' }] });
    // in its own shape: a square picture 96 across, a long garland 240 wide
    const img = new Image();
    img.onload = () => {
      const nw = img.naturalWidth || 1;
      const nh = img.naturalHeight || 1;
      const long = Math.max(nw, nh) / Math.min(nw, nh) > 1.8 ? 240 : 96;
      const k = long / Math.max(nw, nh);
      put(Math.round(nw * k), Math.round(nh * k));
    };
    img.onerror = () => put(96, 96);
    img.src = clipSrc(n, color);
  };
  return (
    <>
      <input
        type="search"
        className="clipq"
        placeholder="Search pictures and chalk drawings: pumpkin, mummy, cake…"
        value={q}
        onChange={e => setQ(e.target.value)}
        aria-label="Search pictures"
      />
      {styles.length > 0 && (
        <div className="segs cstyles" role="radiogroup" aria-label="Picture style">
          {[FLUENT, ...styles, { prefix: 'all', name: 'All styles', credit: '', count: 1 }].map(s => (
            <button
              type="button"
              key={s.prefix || 'fluent'}
              role="radio"
              aria-checked={style === s.prefix}
              className={'seg' + (style === s.prefix ? ' on' : '')}
              disabled={!s.count}
              title={s.count ? undefined : 'Still being unpacked on the board - try again in a minute'}
              onClick={() => {
                setStyle(s.prefix);
                setSet(0);
              }}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      <div className="segs">
        {sets.map(([label], i) => (
          <button
            type="button"
            key={label}
            className={'seg' + (!q && i === set ? ' on' : '')}
            onClick={() => {
              setSet(i);
              setQ('');
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {list.some(n => n.startsWith('gi-')) && (
        <>
          <div className="sublbl">Color for the chalk drawings</div>
          <Colors value={color} onChange={c => c && setColor(c)} set={CHALK} label="Drawing color" />
        </>
      )}
      <div className="cgrid big">
        {err && <div className="empty">{err}</div>}
        {names && !list.length && q && <div className="empty">Nothing for “{q}” - try another word</div>}
        {list.map(n => (
          <button
            type="button"
            key={n}
            className="ctile"
            title={clipLabel(n)}
            aria-label={clipLabel(n)}
            onClick={() => place(n)}
          >
            <img alt="" loading="lazy" src={clipSrc(n, color)} />
          </button>
        ))}
      </div>
      <div className="sublbl">Clipart: {credit}</div>
    </>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------- //
// | Emoji | //
// --------- //
function EmojiPane({ pick }: { pick: (s: Stamp) => void }) {
  const [cat, setCat] = useState(0);
  return (
    <>
      <div className="segs">
        {EMOJI.map(([n], i) => (
          <button type="button" key={n} className={'seg' + (i === cat ? ' on' : '')} onClick={() => setCat(i)}>
            {n}
          </button>
        ))}
      </div>
      <div className="emojis">
        {[...new Set(EMOJI[cat][1].split(' '))].map(e => (
          <button
            type="button"
            key={e}
            className="emoji"
            aria-label={'Emoji ' + e}
            onClick={() =>
              pick({ name: e, items: [{ id: 0, k: 't', x: 0, y: 0, s: e, f: 0, z: 64, c: '#FFFFFF', m: true }] })
            }
          >
            {e}
          </button>
        ))}
      </div>
    </>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------- //
// | GIFs | //
// -------- //
// The first frame of a picture, for GIFs that rest between plays            //
function stillOf(src: string): Promise<{ still: Blob | null; w: number; h: number }> {
  return new Promise((ok, fail) => {
    const im = new Image();
    im.onload = () => {
      const w = im.naturalWidth || 100;
      const h = im.naturalHeight || 100;
      const c = document.createElement('canvas');
      const k = Math.min(1, 400 / Math.max(w, h));
      c.width = Math.max(1, Math.round(w * k));
      c.height = Math.max(1, Math.round(h * k));
      c.getContext('2d')!.drawImage(im, 0, 0, c.width, c.height);
      c.toBlob(b => ok({ still: b, w, h }), 'image/png');
    };
    im.onerror = () => fail(new Error('That picture didn’t open'));
    im.src = src;
  });
}

function GifPane({ pick }: { pick: (s: Stamp) => void }) {
  const [mode, setMode] = useState('gentle');
  const [mine, setMine] = useState<Gif[]>([]);
  const [anim, setAnim] = useState<Anim[] | null>(null);
  const [q, setQ] = useState('');
  const [link, setLink] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => {
    get<Gif[]>('api/gifs').then(setMine, () => {});
    get<Anim[]>('api/anim/list').then(setAnim, e => setNote('Couldn’t load animated emoji: ' + (e as Error).message));
  }, []);
  const place = (src: string, still: string, w: number, h: number) => {
    const k = Math.min(1, 110 / Math.max(w, h));
    pick({
      name: 'GIF',
      items: [{ id: 0, k: 'g', x: 0, y: 0, w: Math.round(w * k), h: Math.round(h * k), src, still, mode }]
    });
  };
  async function add(file: Blob | null, haveSrc?: string) {
    setNote(haveSrc ? 'Adding it…' : 'Uploading…');
    try {
      const local = haveSrc ? haveSrc : URL.createObjectURL(file!);
      const { still, w, h } = await stillOf(local);
      if (!haveSrc) URL.revokeObjectURL(local);
      const animated = haveSrc ? /\.(gif|webp)$/.test(haveSrc) : /gif|webp/.test(file!.type);
      const src = haveSrc || (await upload(file!)).src;
      const st = animated && still ? (await upload(still)).src : src;
      const g = await post<Gif>('api/gifs/add', { src, still: st, w, h });
      setMine(m => [g, ...m]);
      setNote('');
      place(g.src, g.still, g.w, g.h);
    } catch (e) {
      setNote('⚠ ' + (e as Error).message);
    }
  }
  const shown = (anim || []).filter(
    a => !q.trim() || (a.tags + ' ' + a.cat).toLowerCase().includes(q.trim().toLowerCase())
  );
  return (
    <>
      <Segs value={mode} onChange={setMode} options={GIF_MODES} label="How it moves" />
      <div className="sublbl">Yours</div>
      <div className="cgrid big">
        <label className="ctile up">
          + Upload
          <input
            type="file"
            accept="image/gif,image/webp,image/png,image/jpeg"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) add(f);
              e.target.value = '';
            }}
          />
        </label>
        {mine.map(g => (
          <div key={g.id} className="ctile" role="button" tabIndex={0} onClick={() => place(g.src, g.still, g.w, g.h)}>
            <img alt="" loading="lazy" src={url(g.still)} />
            <button
              type="button"
              className="x"
              aria-label="Remove from the library"
              onClick={e => {
                e.stopPropagation();
                if (!confirm('Remove this GIF from your library? (Copies already on the board stay.)')) return;
                post('api/gifs/delete', { id: g.id }).then(() => setMine(m => m.filter(x => x.id !== g.id)));
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="row">
        <input
          type="url"
          className="clipq"
          placeholder="Or paste a link to a GIF"
          value={link}
          onChange={e => setLink(e.target.value)}
          aria-label="Link to a GIF"
        />
        <button
          type="button"
          className="seg"
          disabled={!link.trim()}
          onClick={async () => {
            setNote('Getting it…');
            try {
              const r = await post<{ src: string }>('api/media/fromlink', { url: link.trim() });
              setLink('');
              add(null, r.src);
            } catch (e) {
              setNote('⚠ ' + (e as Error).message);
            }
          }}
        >
          Add
        </button>
      </div>
      <div className="sublbl">{note}</div>
      <div className="sublbl">Animated emoji (Noto, Google, CC BY 4.0)</div>
      <input
        type="search"
        className="clipq"
        placeholder="Search: party, cat, heart…"
        value={q}
        onChange={e => setQ(e.target.value)}
        aria-label="Search animated emoji"
      />
      <div className="cgrid big">
        {anim && !shown.length && <div className="empty">Nothing found - try another word</div>}
        {shown.slice(0, 90).map(a => (
          <button
            type="button"
            key={a.cp}
            className="ctile"
            title={a.tags}
            onClick={() => place(`/api/anim/${a.cp}/gif`, `/api/anim/${a.cp}/svg`, 80, 80)}
          >
            <img alt={a.tags} loading="lazy" src={`api/anim/${a.cp}/gif`} />
          </button>
        ))}
      </div>
    </>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------- //
// | Saved stamps | //
// ---------------- //
function MinePane({ pick, bg }: { pick: (s: Stamp) => void; bg: number }) {
  const [list, setList] = useState<(Stamp & { id: number })[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    get<(Stamp & { id: number })[]>('api/stamps').then(setList, () => setErr('Couldn’t load the stamps'));
  }, []);
  return (
    <div className="stamps">
      {err && <div className="empty">{err}</div>}
      {list && !list.length && (
        <div className="empty">No stamps yet. Select part of a drawing and tap ★ Save as stamp.</div>
      )}
      {list?.map(st => (
        <div key={st.id} className="stamp" role="button" tabIndex={0} onClick={() => pick(st)}>
          <Thumb items={st.items} bg={bg} />
          <div className="nm">{st.name}</div>
          <button
            type="button"
            className="x"
            aria-label={'Delete stamp ' + st.name}
            onClick={e => {
              e.stopPropagation();
              if (!confirm(`Delete the “${st.name}” stamp from the library?`)) return;
              post('api/stamps/delete', { id: st.id }).then(() => setList(l => (l || []).filter(x => x.id !== st.id)));
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------------- //
// | A thumbnail | //
// --------------- //
// A stamp, small: its drawing scaled to fit                                 //
export function Thumb({ items, bg }: { items: ArtItem[]; bg: number }) {
  const b = unionBox(items) || { x1: 0, y1: 0, x2: 1, y2: 1 };
  const w = Math.max(1, b.x2 - b.x1);
  const h = Math.max(1, b.y2 - b.y1);
  const k = Math.min(130 / w, 90 / h, 1.5);
  return (
    <div className="thumb">
      <div
        style={{
          position: 'absolute',
          left: 70 - (b.x1 + w / 2) * k,
          top: 50 - (b.y1 + h / 2) * k,
          transform: `scale(${k})`,
          transformOrigin: '0 0',
          width: 1252,
          height: 642
        }}
      >
        <Art items={items.map((x, i) => ({ ...x, id: i + 1 }))} bg={bg} res={2} gifsPlay={false} />
      </div>
    </div>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
