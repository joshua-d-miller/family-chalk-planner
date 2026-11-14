/*
===============================================================================
 Family Chalk Planner | Screens | Drawing | Library.tsx
===============================================================================
 Version:   0.17.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-07
 Updated:   2026-11-14

 Purpose:
     Pictures: a search that always looks through every picture the board
     has, then Favorites (pictures pinned with ★ and the family's own saved
     designs), the packs (this month's first: Thanksgiving, Christmas,
     Birthdays...) and moving pictures (GIFs). Pick one, then tap the board
     where it goes; it's picked afterwards, to move or resize.

 Used by:
     web/src/board/Board.tsx
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

 0.16.2    2026-11-11   joshua    Garland & trims is a group in the everyday
                        claude    clipart (right after Favorites) and found by
                                  searching; picking its style shows all of it.

 0.17.0    2026-11-14   joshua    Reworked (her feedback: hard to get to, odd
                        claude    on the board, not much there): one search
                                  over every picture, Favorites, packs, GIFs
                                  as a pack. No styles, groups, sizes or
                                  separate emoji to pick first; resize after
                                  placing. Openclipart's pictures, and "Look
                                  on the web" (public domain, Openverse).
===============================================================================
*/

import { useEffect, useMemo, useState } from 'react';
import { get, post, upload, url } from '../../lib/api.ts';
import { useLive } from '../../lib/live.ts';
import { Segs } from '../../ui/bits.tsx';
import { CHALK, Colors } from '../../ui/Colors.tsx';
import { Sheet } from '../../ui/Sheet.tsx';
import { Art } from '../Art.tsx';
import type { ArtItem } from '../Art.tsx';
import { clipLabel, clipPath, clipSrc } from '../clip.ts';
import { unionBox } from '../geom.ts';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------- //
// | Stamps | //
// ---------- //
// What goes on the board: one picture, or a saved design of several pieces //
export type Stamp = { name: string; items: ArtItem[] };
const GIF_MODES: [string, string][] = [
  ['gentle', 'Now and then'],
  ['loop', 'All the time'],
  ['still', 'Never moves']
];
type Gif = { id: string; src: string; still: string; w: number; h: number };
type Anim = { cp: string; tags: string; cat: string };
type PackCard = { id: string; name: string; now: boolean; cover: string[]; count: number };
type Found = { subject: string; label: string; id: string; looks: string[] };
// where the window is: the packs, Favorites, one pack, the moving pictures
type View = { k: 'home' } | { k: 'fav' } | { k: 'gif' } | { k: 'pack'; id: string; name: string };
const CREDIT =
  'Pictures: Fluent Emoji (Microsoft), Noto (Google), Twemoji, OpenMoji, Streamline, EmojiOne, Firefox, IconPark, ' +
  'Meteocons, Iconito, Openclipart, chalk drawings from game-icons.net (CC BY 3.0), and drawn for the board. All credited in NOTICE.';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------- //
// | The pictures | //
// ---------------- //
export function Library({
  onPick,
  onClose,
  bg
}: {
  onPick: (s: Stamp, k: number) => void;
  onClose: () => void;
  bg: number;
}) {
  const [view, setView] = useState<View>({ k: 'home' });
  const [q, setQ] = useState('');
  const [color, setColor] = useState('#EDEAE0'); // the chalk drawings' color
  const favs = useLive<{ items: string[] }>('api/clip/favorites', ['clipfav']);
  const fav = new Set(favs.data?.items || []);
  const pin = async (id: string) => {
    const on = !fav.has(id);
    favs.set({ items: on ? [id, ...(favs.data?.items || [])] : (favs.data?.items || []).filter(n => n !== id) });
    try {
      favs.set(await post<{ items: string[] }>('api/clip/favorites', { id, on }));
    } catch {
      favs.reload();
    }
  };
  const pick = (s: Stamp) => onPick(s, 1);
  // a picture goes up in its own shape: a square picture 96 across, a long garland 240 wide
  const place = (n: string) => {
    const s = clipPath(n, color); // the board keeps the path; the full address only works on this screen
    const put = (w: number, h: number) =>
      pick({ name: clipLabel(n), items: [{ id: 0, k: 'g', x: 0, y: 0, w, h, src: s, still: s, mode: 'still' }] });
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
  const tiles = { place, pin, fav, color };
  const searching = q.trim().length > 0;
  const back = !searching && view.k !== 'home';
  return (
    <Sheet title="Pictures" onClose={onClose} id="libSheet" focus={false}>
      <div className="pickhead">
        {back && (
          <button type="button" className="seg" id="picBack" onClick={() => setView({ k: 'home' })}>
            ‹ All packs
          </button>
        )}
        <label className="picsearch">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="16.5" y1="16.5" x2="21" y2="21" />
          </svg>
          <input
            type="search"
            className="clipq"
            placeholder="Search every picture: turkey, leaf, cake…"
            value={q}
            onChange={e => setQ(e.target.value)}
            aria-label="Search every picture"
          />
        </label>
      </div>
      <div className="lscroll">
        {searching ? (
          <SearchView q={q} {...tiles} setColor={setColor} pick={pick} />
        ) : view.k === 'home' ? (
          <Home open={setView} favCount={fav.size} />
        ) : view.k === 'fav' ? (
          <FavView items={favs.data?.items || []} {...tiles} setColor={setColor} pick={pick} bg={bg} />
        ) : view.k === 'gif' ? (
          <GifPane pick={pick} />
        ) : (
          <PackView id={view.id} name={view.name} {...tiles} setColor={setColor} />
        )}
      </div>
      <div className="sublbl credit">{CREDIT}</div>
    </Sheet>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------------------------- //
// | Favorites, the packs, GIFs | //
// -------------------------------- //
// Favorites first, then the packs (this month's first, marked), then the   //
// moving pictures.                                                         //
function Home({ open, favCount }: { open: (v: View) => void; favCount: number }) {
  const [packs, setPacks] = useState<PackCard[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    get<{ packs: PackCard[] }>('api/clip/packs').then(
      r => setPacks(r.packs),
      e => setErr('Couldn’t load the packs: ' + (e as Error).message)
    );
  }, []);
  return (
    <div className="packs" id="packs">
      <button type="button" className="pack fav" id="pack-fav" onClick={() => open({ k: 'fav' })}>
        <span className="cover star" aria-hidden="true">
          ★
        </span>
        <span className="pk">
          <b>Favorites</b>
          <small>{favCount ? `${favCount} pinned · your designs` : 'pin pictures with ★ · your designs'}</small>
        </span>
      </button>
      {err && <div className="empty">{err}</div>}
      {packs?.map(p => (
        <button
          type="button"
          key={p.id}
          className={'pack' + (p.now ? ' now' : '')}
          id={'pack-' + p.id}
          onClick={() => open({ k: 'pack', id: p.id, name: p.name })}
        >
          <span className="cover" aria-hidden="true">
            {p.cover.map(c => (
              <img key={c} alt="" loading="lazy" src={clipSrc(c)} />
            ))}
          </span>
          <span className="pk">
            <b>{p.name}</b>
            <small>
              {p.now && <em>This month · </em>}
              {p.count} pictures
            </small>
          </span>
        </button>
      ))}
      <button type="button" className="pack" id="pack-gif" onClick={() => open({ k: 'gif' })}>
        <span className="cover star" aria-hidden="true">
          ✨
        </span>
        <span className="pk">
          <b>Moving pictures</b>
          <small>GIFs and animated emoji</small>
        </span>
      </button>
    </div>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------------- //
// | Pictures, as tiles to tap | //
// ------------------------------- //
// Tap a picture to put it up; ★ in its corner pins it to Favorites. When  //
// chalk drawings are among them, their color comes first.                  //
type TileProps = {
  place: (n: string) => void;
  pin: (n: string) => void;
  fav: Set<string>;
  color: string;
  setColor: (c: string) => void;
};
function Tiles({
  list,
  place,
  pin,
  fav,
  color,
  setColor,
  more,
  onMore
}: TileProps & { list: string[]; more?: (n: string) => number; onMore?: (n: string) => void }) {
  return (
    <>
      {list.some(n => n.startsWith('gi-')) && (
        <div className="chalkcolor">
          <span className="sublbl">Chalk drawings in</span>
          <Colors value={color} onChange={c => c && setColor(c)} set={CHALK} label="Drawing color" />
        </div>
      )}
      <div className="cgrid big pgrid">
        {list.map(n => (
          <div key={n} className="ptile">
            <button
              type="button"
              className="ctile"
              title={clipLabel(n)}
              aria-label={clipLabel(n)}
              onClick={() => place(n)}
            >
              <img alt="" loading="lazy" src={clipSrc(n, color)} />
            </button>
            <button
              type="button"
              className={'pin' + (fav.has(n) ? ' on' : '')}
              aria-pressed={fav.has(n)}
              aria-label={(fav.has(n) ? 'Unpin ' : 'Pin ') + clipLabel(n)}
              onClick={() => pin(n)}
            >
              ★
            </button>
            {more && onMore && more(n) > 0 && (
              <button
                type="button"
                className="looksn"
                aria-label={`${more(n)} more looks for ${clipLabel(n)}`}
                onClick={() => onMore(n)}
              >
                +{more(n)}
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------ //
// | One pack | //
// ------------ //
function PackView({ id, name, ...t }: TileProps & { id: string; name: string }) {
  const [list, setList] = useState<string[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    get<{ pictures: string[] }>('api/clip/pack/' + id).then(
      r => setList(r.pictures),
      e => setErr((e as Error).message)
    );
  }, [id]);
  return (
    <>
      <h4 className="packname">{name}</h4>
      {err && <div className="empty">{err}</div>}
      {list && <Tiles list={list} {...t} />}
    </>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------- //
// | Favorites | //
// ------------- //
// The pinned pictures, then the family's own saved designs.               //
function FavView({ items, pick, bg, ...t }: TileProps & { items: string[]; pick: (s: Stamp) => void; bg: number }) {
  return (
    <>
      <h4 className="packname">Favorites</h4>
      {items.length ? (
        <Tiles list={items} {...t} />
      ) : (
        <div className="empty">Nothing pinned yet. Tap ★ on any picture to keep it here.</div>
      )}
      <h4 className="packname">Your designs</h4>
      <MinePane pick={pick} bg={bg} />
    </>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------- //
// | Searching everything | //
// ------------------------- //
// Each subject once, in its best look; "+3" on a tile means it has more    //
// looks, and tapping that shows them.                                      //
function SearchView({ q, pick, ...t }: TileProps & { q: string; pick: (s: Stamp) => void }) {
  const [found, setFound] = useState<Found[] | null>(null);
  const [looks, setLooks] = useState<Found | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    setLooks(null);
    const timer = setTimeout(() => {
      get<{ found: Found[] }>('api/clip/search?q=' + encodeURIComponent(q.trim())).then(
        r => {
          setFound(r.found);
          setErr('');
        },
        e => setErr((e as Error).message)
      );
    }, 200); // after a pause in typing
    return () => clearTimeout(timer);
  }, [q]);
  const bySubject = useMemo(() => new Map((found || []).map(f => [f.id, f])), [found]);
  return (
    <>
      {err && <div className="empty">{err}</div>}
      {found && !found.length && <div className="empty">Nothing for “{q.trim()}” - try another word</div>}
      {looks && (
        <div className="looks">
          <div className="sublbl">
            Every look for “{looks.label}”{' '}
            <button type="button" className="seg" onClick={() => setLooks(null)}>
              Done
            </button>
          </div>
          <Tiles list={looks.looks} {...t} />
        </div>
      )}
      {found && !looks && (
        <Tiles
          list={found.map(f => f.id)}
          {...t}
          more={n => (bySubject.get(n)?.looks.length || 1) - 1}
          onMore={n => setLooks(bySubject.get(n) || null)}
        />
      )}
      {found && !looks && <WebPane key={q.trim()} q={q.trim()} pick={pick} />}
    </>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------ //
// | From the web | //
// ------------------ //
// Public-domain illustrations from Openverse, only when asked for (a tap,  //
// not every letter typed), so the board stays well within what Openverse   //
// allows without an account. A picture placed is kept on the board.        //
type WebPic = { id: string; title: string; creator: string; source: string; w: number; h: number };
function WebPane({ q, pick }: { q: string; pick: (s: Stamp) => void }) {
  const [found, setFound] = useState<WebPic[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const search = async () => {
    setBusy(true);
    setNote('');
    try {
      const r = await get<{ found: WebPic[]; note?: string }>('api/clip/web?q=' + encodeURIComponent(q));
      setFound(r.found);
      setNote(r.note || (r.found.length ? '' : `Nothing on the web for “${q}” either`));
    } catch (e) {
      setNote((e as Error).message);
    }
    setBusy(false);
  };
  const place = async (p: WebPic) => {
    setNote('Bringing it onto the board…');
    try {
      const { src } = await post<{ src: string }>('api/clip/web/keep', { id: p.id });
      const img = new Image();
      img.onload = () => {
        const k = 120 / Math.max(img.naturalWidth || 1, img.naturalHeight || 1);
        const w = Math.round((img.naturalWidth || 1) * k);
        const h = Math.round((img.naturalHeight || 1) * k);
        setNote('');
        pick({
          name: p.title || 'Picture',
          items: [{ id: 0, k: 'g', x: 0, y: 0, w, h, src, still: src, mode: 'still' }]
        });
      };
      img.onerror = () => setNote('⚠ That picture didn’t open');
      img.src = url(src);
    } catch (e) {
      setNote('⚠ ' + (e as Error).message);
    }
  };
  return (
    <div className="webpics">
      {!found && (
        <button type="button" className="seg" id="webSearch" disabled={busy} onClick={search}>
          {busy ? 'Looking…' : `🌐 Look on the web for “${q}”`}
        </button>
      )}
      {found && found.length > 0 && (
        <>
          <div className="sublbl">From the web · public domain, from Openverse</div>
          <div className="cgrid big pgrid">
            {found.map(p => (
              <div key={p.id} className="ptile">
                <button
                  type="button"
                  className="ctile web"
                  title={p.title + (p.creator ? ' - ' + p.creator : '')}
                  aria-label={p.title || 'Picture from the web'}
                  onClick={() => place(p)}
                >
                  <img alt="" loading="lazy" src={url(`api/clip/web/${p.id}/thumb`)} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
      {note && <div className="empty">{note}</div>}
    </div>
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
