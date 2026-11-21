/*
===============================================================================
 Family Chalk Planner | Screens | Board | Split.tsx
===============================================================================
 Version:   1.2.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-21
 Updated:   2026-11-21

 Purpose:
     🗓️ Week's Split View: what goes under the week, in one or two spaces
     this screen picked (⚙️ Settings → Week). Photos one at a time, as they
     are (centered, never stretched), a swipe for the next or the last;
     room to draw (the chalkboard itself: drawings stay with the week); or
     one of the Notes column's pages: the meal plan, the pantry, the jars,
     chores, reminders or up next.

 How it fits:
     Board.tsx hands it to Month.tsx as `under` on a screen whose week is
     Split View; the Notes column then shows the weather and countdowns.

 Used by:
     web/src/board/Board.tsx
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.2.0    2026-11-21   joshua    New file (Colby Way's week and photos side
                        colby     by side, with a choice of what's beside the
                        claude    week). A tap on a jar opens the big jar.
===============================================================================
*/

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { useLive } from '../lib/live.ts';
import type { Space, WeekView } from '../lib/weekFrom.ts';
import { ChoresPage, JarsPage, MealsPage, PantryPage, RemindersPage, UpNext } from './Notes.tsx';
import { photoSrc, shuffleBag } from './photos.ts';
import { useBigJar } from '../ui/JarZoom.tsx';
import type { Photo, Photos } from './photos.ts';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------ //
// | Under the week | //
// ------------------ //
export function Split({
  view,
  edit,
  drawing = false,
  time24
}: {
  view: WeekView;
  edit: boolean;
  drawing?: boolean;
  time24: boolean;
}) {
  // a tap on a jar here opens the big jar too (a screen that edits, not while drawing)
  const { onJar, big } = useBigJar(edit && !drawing);
  const spaces = [view.a, view.b].filter((x): x is Space => x !== 'none');
  return (
    <div className={'spaces n' + spaces.length}>
      {spaces.map(s => (
        <div key={s} className={'space space-' + s} data-space={s}>
          {s === 'photos' && <SplitPhotos />}
          {s === 'draw' && edit && <span className="drawhint">✏️ Room to draw</span>}
          {s === 'meals' && <MealsPage />}
          {s === 'pantry' && <PantryPage />}
          {s === 'jars' && <JarsPage onJar={onJar} />}
          {s === 'chores' && <ChoresPage />}
          {s === 'reminders' && <RemindersPage time24={time24} />}
          {s === 'upnext' && <UpNext />}
        </div>
      ))}
      {big}
    </div>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------- //
// | Photos | //
// ---------- //
// One at a time, the whole photo (centered, never stretched or cropped),   //
// the next one every so often (the slideshow's own pace). A swipe right to //
// left: the next; left to right: back to the last ones.                    //
function SplitPhotos() {
  const ph = useLive<Photos>('api/photos', ['photos']).data;
  const bag = useRef(shuffleBag<Photo>());
  const hist = useRef<Photo[]>([]); // the photos shown so far (the last 50), for going back
  const at = useRef(-1);
  const [, shown] = useState(0); // (draw again when `at` moves)
  const list = ph?.photos;
  const forward = useCallback(() => {
    if (at.current < hist.current.length - 1) at.current++;
    else {
      const p = list?.length ? bag.current(list) : null;
      if (!p) return;
      hist.current.push(p);
      if (hist.current.length > 50) hist.current.shift();
      at.current = hist.current.length - 1;
    }
    shown(n => n + 1);
  }, [list]);
  const back = () => {
    at.current = Math.max(0, at.current - 1);
    shown(n => n + 1);
  };
  const [kick, setKick] = useState(0);
  // the space's size (in the board's own pixels), to fit each photo into
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [list?.length]);
  const every = Math.max(10, ph?.cfg?.every || 20) * 1000;
  useEffect(() => {
    if (!list?.length) return;
    if (hist.current.length === 0) forward();
    const t = setInterval(forward, every);
    return () => clearInterval(t);
  }, [list, every, forward, kick]);
  // a swipe (a tap is still the board's: it doesn't open anything here)
  const s0 = useRef<{ x: number; y: number } | null>(null);
  const down = (e: PointerEvent) => {
    e.stopPropagation(); // (not a swipe to the chores, nor a stroke)
    s0.current = e.isPrimary ? { x: e.clientX, y: e.clientY } : null;
  };
  const up = (e: PointerEvent) => {
    e.stopPropagation();
    const p = s0.current;
    s0.current = null;
    if (!p) return;
    const dx = e.clientX - p.x;
    if (Math.abs(dx) < 60 || Math.abs(e.clientY - p.y) > Math.abs(dx) / 2) return;
    if (dx < 0) forward();
    else back();
    setKick(k => k + 1); // the next one waits its full time again
  };
  if (!list?.length) return <div className="nophotos dim">No photos yet</div>;
  const p = hist.current[at.current];
  // as big as fits, its own shape (a photo is never stretched or cropped)
  const fit = p && box.w && box.h ? Math.min(box.w / (p.w || 1), box.h / (p.h || 1)) : 0;
  return (
    <div className="sphoto" ref={boxRef} onPointerDown={down} onPointerUp={up}>
      {p && fit > 0 && (
        <img
          key={p.id}
          alt=""
          src={photoSrc(p)}
          draggable={false}
          style={{ width: Math.floor((p.w || 1) * fit), height: Math.floor((p.h || 1) * fit) }}
        />
      )}
    </div>
  );
}
