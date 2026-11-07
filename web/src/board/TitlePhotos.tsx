/*
===============================================================================
 Family Chalk Planner | Screens | Board | TitlePhotos.tsx
===============================================================================
 Version:   0.13.2
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-07
 Updated:   2026-11-07

 Purpose:
     Polaroids in the empty space either side of the month name, changing
     one at a time. The spots are measured from the real layout (the
     title's width, the arrows), and any spot the month's drawing already
     uses is skipped, so they never cover art.

 Used by:
     web/src/board/Board.tsx
     web/src/board/editors/PhotosEditor.tsx
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    The new board: the family's style, each
                        colby     month's title and holiday border, polaroids,
                        claude    drawn jars.

                                  The new screens take over: /, /edit and
                                  /chores are the React board; the old one
                                  stays at /classic.

 0.13.2    2026-11-07   joshua    Copes with a month saved by an older board.
                        claude
===============================================================================
*/

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ArtItem } from './Art.tsx';
import { itemBox, overlaps } from './geom.ts';
import { photoSrc, shuffleBag, zoomed } from './photos.ts';
import type { Photo } from './photos.ts';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------- //
// | Which photos | //
// ---------------- //
export type Side = { mode: 'photos' | 'art'; pick: 'random' | 'chosen'; ids: string[] };
type Spot = { x: number; y: number; w: number; h: number; r: number };

// the polaroids' photos: the month's chosen ones (if any are still in the album), or all of them
export function titlePool(list: Photo[], side: Side | null | undefined) {
  if (side?.mode === 'photos' && side.pick === 'chosen') {
    const mine = (side.ids || []).map(id => list.find(p => p.id === id)).filter((p): p is Photo => !!p);
    if (mine.length) return mine;
  }
  return list;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------------- //
// | Where they go | //
// ----------------- //
function spots(slate: HTMLElement, art: ArtItem[]): Spot[] {
  const row = slate.querySelector<HTMLElement>('.titlerow');
  const prev = slate.querySelector<HTMLElement>('#prev');
  const next = slate.querySelector<HTMLElement>('#next');
  const body = slate.querySelector<HTMLElement>('.calbody');
  if (!row || !prev || !next) return [];
  const x0 = row.offsetLeft;
  const top = 6;
  // stop above the calendar (its weekday names, or a holiday border)
  const h = Math.min(76, (body ? body.offsetTop + 4 : row.offsetTop + row.offsetHeight) - top - 6);
  const w = Math.round(h * 1.3);
  if (h < 30) return [];
  const sides = [
    { l: x0 + 6, r: x0 + prev.offsetLeft - 14, tilt: [-5, 3] },
    { l: x0 + next.offsetLeft + next.offsetWidth + 14, r: x0 + row.offsetWidth - 6, tilt: [4, -3] }
  ];
  const arts = art.filter(it => !it.e).map(itemBox);
  const out: Spot[] = [];
  for (const sd of sides) {
    const room = sd.r - sd.l;
    const n = Math.min(2, Math.floor(room / (w * 1.05)));
    for (let i = 0; i < n; i++) {
      const gap = (room - n * w) / (n + 1);
      const x = Math.round(sd.l + gap + i * (w + gap));
      const y = top + (i % 2 ? 2 : 0);
      if (!arts.some(b => overlaps(b, { x1: x, y1: y, x2: x + w, y2: y + h })))
        out.push({ x, y, w, h, r: sd.tilt[i % 2] });
    }
  }
  return out;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------- //
// | The photos | //
// -------------- //
export function TitlePhotos({ pool, art, layoutKey }: { pool: Photo[]; art: ArtItem[]; layoutKey: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [want, setWant] = useState<Spot[]>([]);
  useLayoutEffect(() => {
    const slate = ref.current?.closest<HTMLElement>('.slate');
    let s = slate && pool.length ? spots(slate, art) : [];
    // never more frames than photos, so none repeat
    if (s.length > pool.length)
      s = pool.length === 1 ? s.slice(0, 1) : [s[0], s[s.length - 1], s[1], s[2]].filter(Boolean).slice(0, pool.length);
    setWant(cur => (JSON.stringify(cur) === JSON.stringify(s) ? cur : s));
  }, [pool, art, layoutKey]);

  // which photo is in each frame; one changes every 40 seconds
  const [shown, setShown] = useState<(Photo | null)[]>([]);
  const next = useRef(shuffleBag<Photo>());
  useEffect(() => {
    const pick = () => {
      const out: Photo[] = [];
      for (let i = 0; i < want.length; i++) {
        const p = next.current(
          pool,
          out.map(x => x.id)
        );
        if (p) out.push(p);
      }
      return out;
    };
    setShown(pick());
    if (!want.length) return;
    let turn = 0;
    const t = setInterval(() => {
      setShown(cur => {
        const i = turn++ % want.length;
        const p = next.current(
          pool,
          cur.filter((_, k) => k !== i).map(x => x?.id || '')
        );
        const out = cur.slice();
        out[i] = p;
        return out;
      });
    }, 40 * 1000);
    return () => clearInterval(t);
  }, [want, pool]);

  return (
    <div className="ptitle" id="ptitle" ref={ref} aria-hidden="true">
      {want.map((sp, i) => (
        <Polaroid key={`${sp.x},${sp.y}`} spot={sp} photo={shown[i] || null} />
      ))}
    </div>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------- //
// | One polaroid | //
// ---------------- //
// Two images, so a new photo fades in over the old one once it has loaded   //
function Polaroid({ spot, photo }: { spot: Spot; photo: Photo | null }) {
  const [imgs, setImgs] = useState<{ a: Photo | null; b: Photo | null; on: 'a' | 'b'; ready: boolean }>({
    a: null,
    b: null,
    on: 'b',
    ready: false
  });
  useEffect(() => {
    if (!photo) return;
    setImgs(s => {
      const cur = s[s.on];
      if (cur?.id === photo.id) return s;
      const off = s.on === 'a' ? 'b' : 'a';
      return { ...s, [off]: photo };
    });
  }, [photo]);
  const bw = spot.w - 10;
  const bh = spot.h - 18;
  const img = (k: 'a' | 'b') => {
    const p = imgs[k];
    if (!p) return null;
    return (
      <img
        alt=""
        src={photoSrc(p)}
        className={imgs.on === k ? 'on' : ''}
        style={zoomed(p, bw, bh)}
        onLoad={() => setImgs(s => (s[k]?.id === p.id && s.on !== k ? { ...s, on: k, ready: true } : s))}
      />
    );
  };
  return (
    <div
      className={'tp' + (imgs.ready ? ' ready' : '')}
      style={{ left: spot.x, top: spot.y, width: spot.w, height: spot.h, transform: `rotate(${spot.r}deg)` }}
    >
      <div className="ph">
        {img('a')}
        {img('b')}
      </div>
    </div>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
