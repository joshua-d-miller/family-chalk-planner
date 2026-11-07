// The overnight slideshow on the wall: a photo, or a collage of 2-3, framed on the people in them, with
// a clock in whichever corner covers the fewest faces. Optional extras (from Colby Way's board): today's
// weather, events and reminders on a translucent card, or in a panel down the left side.
// A tap shows the calendar for 5 minutes; a double tap on the calendar turns the photo frame on any time.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RemindersView } from '../../../shared/lists.ts';
import { useLive } from '../lib/live.ts';
import { fmtTime } from '../lib/today.ts';
import { isDone } from '../pages/Reminders.tsx';
import { frameFor, photoSrc } from './photos.ts';
import type { Photo, PhotoCfg, Photos } from './photos.ts';
import './slides.css';

const hm = (s: string) => {
  const m = /^(\d\d):(\d\d)$/.exec(s || '');
  return m ? +m[1] * 60 + +m[2] : null;
};
export function nightNow(cfg: PhotoCfg | undefined, d = new Date()) {
  if (!cfg?.night) return false;
  const f = hm(cfg.from);
  const t = hm(cfg.to);
  if (f === null || t === null || f === t) return false;
  const m = d.getHours() * 60 + d.getMinutes();
  return f < t ? m >= f && m < t : m >= f || m < t;
}

// Whether the slideshow is showing, and the taps that change it
export function useSlides(photos: Photos | null, wall: boolean) {
  const has = !!photos?.photos.length;
  const [manual, setManual] = useState(false); // the photo frame, turned on by a double tap
  const [peekUntil, setPeekUntil] = useState(0); // a tap at night: the calendar for a while
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick(n => n + 1), 30 * 1000);
    return () => clearInterval(t);
  }, []);
  const night = wall && has && (new URLSearchParams(location.search).has('slides') || nightNow(photos?.cfg));
  const on = has && (manual || (night && Date.now() > peekUntil));
  const since = useRef(0); // taps right after a change belong to it
  const mark = () => (since.current = Date.now());
  return {
    on,
    // a tap on the slideshow: leave it (at night, for 5 minutes)
    tapSlides: useCallback(() => {
      if (Date.now() - since.current < 1500) return;
      mark();
      setManual(false);
      if (night) setPeekUntil(Date.now() + 5 * 60 * 1000);
    }, [night]),
    // a double tap on the calendar: back to the slideshow during a peek, or the photo frame on
    doubleTap: useCallback(() => {
      if (Date.now() - since.current < 700) return;
      mark();
      if (peekUntil > Date.now()) setPeekUntil(0);
      else if (has) setManual(true);
    }, [peekUntil, has]),
    justChanged: () => Date.now() - since.current < 900
  };
}

// Layouts are fractions of the screen; each tile says which photo shape suits it
type Kind = 'p' | 'l' | 'any';
const LAYOUTS: { n: string; w: number; tiles: { x: number; y: number; w: number; h: number; k: Kind }[] }[] = [
  { n: 'one', w: 6, tiles: [{ x: 0, y: 0, w: 1, h: 1, k: 'any' }] },
  {
    n: 'two portraits',
    w: 2,
    tiles: [
      { x: 0, y: 0, w: 0.5, h: 1, k: 'p' },
      { x: 0.5, y: 0, w: 0.5, h: 1, k: 'p' }
    ]
  },
  {
    n: 'three portraits',
    w: 1.5,
    tiles: [
      { x: 0, y: 0, w: 1 / 3, h: 1, k: 'p' },
      { x: 1 / 3, y: 0, w: 1 / 3, h: 1, k: 'p' },
      { x: 2 / 3, y: 0, w: 1 / 3, h: 1, k: 'p' }
    ]
  },
  {
    n: 'landscape + portrait',
    w: 2,
    tiles: [
      { x: 0, y: 0, w: 0.62, h: 1, k: 'l' },
      { x: 0.62, y: 0, w: 0.38, h: 1, k: 'p' }
    ]
  },
  {
    n: 'portrait + landscape',
    w: 1.5,
    tiles: [
      { x: 0, y: 0, w: 0.38, h: 1, k: 'p' },
      { x: 0.38, y: 0, w: 0.62, h: 1, k: 'l' }
    ]
  },
  {
    n: 'big + two',
    w: 1.5,
    tiles: [
      { x: 0, y: 0, w: 0.62, h: 1, k: 'any' },
      { x: 0.62, y: 0, w: 0.38, h: 0.5, k: 'l' },
      { x: 0.62, y: 0.5, w: 0.38, h: 0.5, k: 'l' }
    ]
  },
  {
    n: 'two + big',
    w: 1,
    tiles: [
      { x: 0, y: 0, w: 0.38, h: 0.5, k: 'l' },
      { x: 0, y: 0.5, w: 0.38, h: 0.5, k: 'l' },
      { x: 0.38, y: 0, w: 0.62, h: 1, k: 'any' }
    ]
  }
];
const GAP = 10;
const portrait = (p: Photo) => (p.h || 3) > (p.w || 4) * 1.1;
type Tile = { x: number; y: number; w: number; h: number; p: Photo; fr: ReturnType<typeof frameFor>; whole: boolean };

function planner() {
  const bags: Record<Kind, string[]> = { p: [], l: [], any: [] };
  let lastLayout = '';
  // a shuffle bag per photo shape; skips photos already in this slide
  const drawFrom = (list: Photo[], kind: Kind, used: string[]) => {
    const pool = list.filter(p => kind === 'any' || (kind === 'p') === portrait(p));
    if (!pool.length) return null;
    for (let round = 0; round < 2; round++) {
      if (!bags[kind].length) {
        bags[kind] = pool.map(p => p.id);
        for (let i = bags[kind].length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [bags[kind][i], bags[kind][j]] = [bags[kind][j], bags[kind][i]];
        }
      }
      for (let k = bags[kind].length - 1; k >= 0; k--) {
        const id = bags[kind][k];
        if (!used.includes(id)) {
          bags[kind].splice(k, 1);
          return pool.find(p => p.id === id) || null;
        }
      }
      bags[kind] = [];
    }
    return null;
  };
  return (list: Photo[], W: number, H: number): Tile[] | null => {
    const nP = list.filter(portrait).length;
    const nL = list.length - nP;
    let options = LAYOUTS.filter(L => {
      if (L.n === 'one') return true;
      if (list.length < 3 || L.n === lastLayout) return false; // collages need variety; never the same twice in a row
      const needP = L.tiles.filter(t => t.k === 'p').length;
      const needL = L.tiles.filter(t => t.k === 'l').length;
      return nP >= needP && nL >= needL && list.length >= L.tiles.length;
    });
    for (let attempt = 0; attempt < 6 && options.length; attempt++) {
      let r = Math.random() * options.reduce((a, L) => a + L.w, 0);
      let L = options[0];
      for (const o of options) {
        r -= o.w;
        if (r <= 0) {
          L = o;
          break;
        }
      }
      const used: string[] = [];
      const tiles: Tile[] = [];
      let ok = true;
      for (const t of L.tiles) {
        const x = Math.round(t.x * W + (t.x > 0 ? GAP / 2 : 0));
        const y = Math.round(t.y * H + (t.y > 0 ? GAP / 2 : 0));
        const w = Math.round(t.w * W - (t.x > 0 ? GAP / 2 : 0) - (t.x + t.w < 0.999 ? GAP / 2 : 0));
        const h = Math.round(t.h * H - (t.y > 0 ? GAP / 2 : 0) - (t.y + t.h < 0.999 ? GAP / 2 : 0));
        let placed = false;
        // a photo whose people won't fit this tile gets swapped for another
        for (let tries = 0; tries < 3 && !placed; tries++) {
          const p = drawFrom(list, t.k, used);
          if (!p) break;
          const fr = frameFor(p, w, h);
          if (fr.fits || L.n === 'one') {
            used.push(p.id);
            tiles.push({ x, y, w, h, p, fr, whole: !fr.fits });
            placed = true;
          }
        }
        if (!placed) {
          ok = false;
          break;
        }
      }
      if (ok && tiles.length) {
        lastLayout = L.n;
        return tiles;
      }
      options = options.filter(o => o !== L);
    }
    return null;
  };
}

// the clock goes in whichever corner covers the fewest faces (a slight preference for the bottom)
function clockCorner(tiles: Tile[], W: number, H: number) {
  const cw = 400;
  const ch = 150;
  const m = 40;
  const faces: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (const t of tiles) {
    let { rw, rh, x0, y0 } = t.fr;
    if (t.whole) {
      const s = Math.min(t.w / (t.p.w || 4), t.h / (t.p.h || 3));
      rw = (t.p.w || 4) * s;
      rh = (t.p.h || 3) * s;
      x0 = -(t.w - rw) / 2;
      y0 = -(t.h - rh) / 2;
    }
    for (const f of t.p.faces || [])
      faces.push({
        x1: t.x + f[0] * rw - x0,
        y1: t.y + f[1] * rh - y0,
        x2: t.x + (f[0] + f[2]) * rw - x0,
        y2: t.y + (f[1] + f[3] * 1.6) * rh - y0
      });
  }
  const corners = [
    { c: 'br', x: W - m - cw, y: H - m - ch },
    { c: 'bl', x: m, y: H - m - ch },
    { c: 'tr', x: W - m - cw, y: m },
    { c: 'tl', x: m, y: m }
  ].map(k => ({
    ...k,
    score:
      faces.reduce(
        (a, f) =>
          a +
          Math.max(0, Math.min(f.x2, k.x + cw) - Math.max(f.x1, k.x)) *
            Math.max(0, Math.min(f.y2, k.y + ch) - Math.max(f.y1, k.y)),
        0
      ) +
      (k.c[0] === 't' ? 400 : 0) +
      Math.random() * 300
  }));
  corners.sort((a, b) => a.score - b.score);
  return corners[0].c;
}

function useClock(time24: boolean) {
  const [n, setN] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setN(new Date()), 10 * 1000);
    return () => clearInterval(t);
  }, []);
  const h = time24 ? n.getHours() : n.getHours() % 12 || 12;
  return {
    time: `${h}:${String(n.getMinutes()).padStart(2, '0')}`,
    ampm: time24 ? '' : n.getHours() < 12 ? 'AM' : 'PM',
    date: n.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
  };
}

type Slide = { key: number; tiles: Tile[]; corner: string; dx: number; dy: number };
const SIDE_W = 380;

export function Slideshow({
  photos,
  on,
  time24,
  onTap
}: {
  photos: Photos;
  on: boolean;
  time24: boolean;
  onTap: () => void;
}) {
  const cfg = photos.cfg;
  const side = !!cfg.sidePanel;
  const plan = useRef(planner());
  const [slides, setSlides] = useState<[Slide | null, Slide | null]>([null, null]);
  const [cur, setCur] = useState(0);
  const curRef = useRef(0);
  const loading = useRef<{ key: number; left: number } | null>(null);
  const seq = useRef(0);

  // the next slide goes on the hidden layer; it's shown once its photos have loaded
  const next = useCallback(() => {
    const W = innerWidth - (side ? SIDE_W : 0);
    const H = innerHeight;
    const tiles = plan.current(photos.photos, W, H);
    if (!tiles) return;
    const corner = clockCorner(tiles, W, H);
    const left = corner[1] === 'l';
    const top = corner[0] === 't';
    const s: Slide = {
      key: ++seq.current,
      tiles,
      corner,
      dx: Math.round(Math.random() * 36) * (left ? 1 : -1), // drift so nothing sits still all night
      dy: Math.round(Math.random() * 20) * (top ? 1 : -1)
    };
    loading.current = { key: s.key, left: tiles.length };
    const hidden = 1 - curRef.current;
    setSlides(sl => (hidden === 1 ? [sl[0], s] : [s, sl[1]]));
    setTimeout(() => reveal(s.key), 8000); // don't wait forever on a slow photo
  }, [photos, side]);
  const reveal = (key: number) => {
    if (loading.current?.key !== key) return;
    loading.current = null;
    curRef.current = 1 - curRef.current;
    setCur(curRef.current);
  };
  const loaded = (key: number) => {
    if (loading.current?.key === key && --loading.current.left <= 0) reveal(key);
  };
  useEffect(() => {
    if (!on) return;
    next();
    const t = setInterval(next, (cfg.every || 20) * 1000);
    return () => clearInterval(t);
  }, [on, next, cfg.every]);

  const shown = slides[cur];
  const clock = useClock(time24);
  const left = !side && shown?.corner[1] === 'l';
  const top = !side && shown?.corner[0] === 't';
  const clockEl = (
    <div
      className={'clock' + (left ? ' left' : '') + (side ? ' sidepanel' : '')}
      style={
        side
          ? undefined
          : {
              left: left ? 40 : 'auto',
              right: left ? 'auto' : 40,
              top: top ? 30 : 'auto',
              bottom: top ? 'auto' : 30,
              transform: shown ? `translate(${shown.dx}px,${shown.dy}px)` : undefined,
              opacity: Math.min(1, 0.6 + ((cfg.dim || 50) / 100) * 0.5) // dims less than the photos
            }
      }
    >
      <b id="sTime">
        {clock.time}
        {clock.ampm && <small>{clock.ampm}</small>}
      </b>
      <span>{clock.date}</span>
    </div>
  );
  const info = <SlideInfo cfg={cfg} time24={time24} right={left} />;
  return (
    <div
      id="slides"
      className={(on ? 'on' : '') + (on && side ? ' sidepanel-on' : '')}
      aria-hidden="true"
      onClick={onTap}
    >
      <div className="slarea" style={side ? { left: SIDE_W } : undefined}>
        {slides.map((s, i) => (
          <div className={'sl' + (i === cur && s ? ' on' : '')} key={s ? s.key : 'none' + i}>
            {s?.tiles.map((t, k) => (
              <div className="tile" key={k} style={{ left: t.x, top: t.y, width: t.w, height: t.h }}>
                {t.whole && <img className="bg" alt="" src={photoSrc(t.p)} />}
                <img
                  className="fg"
                  alt=""
                  src={photoSrc(t.p)}
                  style={
                    t.whole
                      ? { objectFit: 'contain', transformOrigin: '50% 50%' }
                      : { objectPosition: t.fr.pos, transformOrigin: `${t.fr.ox.toFixed(1)}% ${t.fr.oy.toFixed(1)}%` }
                  }
                  onLoad={() => loaded(s.key)}
                  onError={() => loaded(s.key)}
                />
              </div>
            ))}
          </div>
        ))}
        <div className="dim" style={{ opacity: 1 - (cfg.dim || 50) / 100 }} />
      </div>
      {side ? (
        <div className="slide-sidebar">
          {clockEl}
          {info}
        </div>
      ) : (
        <>
          {clockEl}
          {info}
        </>
      )}
    </div>
  );
}

// today's weather, events and reminders, when chosen in ⚙️ Settings
function SlideInfo({ cfg, time24, right }: { cfg: PhotoCfg; time24: boolean; right: boolean }) {
  const x = useLive<{ weather: { now: { temp: number }; today: { hi: number; lo: number } } | null }>('api/extras', [
    'extras'
  ]).data;
  const u = useLive<{ today: string; events: { date: string; title: string; time: string | null }[] }>('api/upnext', [
    'calendar'
  ]).data;
  const r = useLive<RemindersView>('api/reminders', ['reminders']).data;
  const secs = [];
  if (cfg.showTemp && x?.weather)
    secs.push(
      <div className="sec" key="t">
        <h4>Today’s weather</h4>
        <div className="temp">
          <b>{x.weather.now.temp}°</b>
          <span>
            High {x.weather.today.hi}° · Low {x.weather.today.lo}°
          </span>
        </div>
      </div>
    );
  if (cfg.showEvents) {
    const evs = (u?.events || []).filter(e => e.date === u!.today);
    secs.push(
      <div className="sec" key="e">
        <h4>Today’s events</h4>
        <ul>
          {!evs.length && <li>Nothing planned today</li>}
          {evs.slice(0, 5).map((e, i) => (
            <li key={i}>
              {e.time && <small>{e.time}</small>}
              {e.title}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (cfg.showReminders && r) {
    const rs = r.items.filter(it => !isDone(it, r.today) && (it.mode === 'always' || r.nowHm >= it.time));
    secs.push(
      <div className="sec" key="r">
        <h4>Today’s reminders</h4>
        <ul>
          {!rs.length && <li>No reminders today</li>}
          {rs.slice(0, 4).map(it => (
            <li key={it.id}>
              {it.mode === 'time' && <small>{fmtTime(it.time, time24)}</small>}
              {it.title}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (!secs.length) return null;
  return <div className={'sinfo' + (right ? ' right' : '')}>{secs}</div>;
}
