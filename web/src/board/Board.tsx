// The board: the month, the art on it, and the right-hand column, on the board's surface. It's laid out
// at 1252 x 642 board pixels and scaled to fill the screen. Text and art are vector, so they're sharp at
// any size; the surface texture is painted at the screen's real resolution (4K included).
import { useEffect, useMemo, useState } from 'react';
import { useLive } from '../lib/live.ts';
import { paintSurface, seasonOf, surfaceOf } from '../lib/surface.ts';
import type { Who } from '../lib/who.ts';
import { Art } from './Art.tsx';
import type { ArtItem } from './Art.tsx';
import { Month } from './Month.tsx';
import type { Bins, MonthData } from './Month.tsx';
import { Notes } from './Notes.tsx';
import './board.css';

const W = 1252;
const H = 642;

// how big the board is on this screen, and how many screen pixels each board pixel gets
function useFit() {
  const calc = () => {
    const scale = Math.min(innerWidth / W, innerHeight / H);
    return { scale, res: Math.max(1, Math.min(4, Math.round(scale * (devicePixelRatio || 1) * 2) / 2)) };
  };
  const [fit, setFit] = useState(calc);
  useEffect(() => {
    const on = () => setFit(calc());
    addEventListener('resize', on);
    return () => removeEventListener('resize', on);
  }, []);
  return fit;
}

export function Board({ who }: { who: Who | null }) {
  void who;
  const { scale, res } = useFit();
  const today = useLive<{ ym: string; time24: boolean }>('api/today', ['calendar']).data;
  const [ym, setYm] = useState<string | null>(null);
  const shown = ym || today?.ym || null;
  const month = useLive<MonthData>(shown ? `api/month?ym=${shown}` : 'api/today', ['calendar']);
  const art = useLive<ArtItem[]>(shown ? `api/art?ym=${shown}` : 'api/today', [
    'stroke',
    'remove',
    'update',
    'undo',
    'clear',
    'restore',
    'meta'
  ]);
  const extras = useLive<{ bins: Bins }>('api/extras', ['extras']).data;
  const theme = useLive<{ s?: string; z?: 1 }>('api/theme', ['theme']).data;
  const sf = surfaceOf(theme?.s || 'slate');
  const season = theme?.z && shown ? seasonOf(+shown.slice(5, 7), false) : '';
  const bg = useMemo(() => {
    try {
      return paintSurface(sf, season, res);
    } catch {
      return 'none';
    }
  }, [sf, season, res]);
  useEffect(() => {
    document.body.classList.add('boardpage');
    return () => document.body.classList.remove('boardpage');
  }, []);
  // a new day: follow it (the wall shows the current month)
  useEffect(() => {
    if (today && ym && ym !== today.ym) setYm(null);
  }, [today, ym]);

  const m = month.data && 'grid' in month.data ? month.data : null;
  return (
    // one continuous surface across the whole screen, so the bands beside the board match it
    <div id="stage" className={sf.lum > 0.18 ? 'light' : ''} style={{ backgroundImage: bg }}>
      <div id="board" style={{ transform: `scale(${scale})` }}>
        <div className="slate" data-surface={sf.id}>
          {m && <Month data={m} bins={extras?.bins || null} bg={sf.lum} />}
          <Notes time24={!!today?.time24} />
          {Array.isArray(art.data) && <Art items={art.data} bg={sf.lum} res={res} gifsPlay={false} />}
        </div>
      </div>
    </div>
  );
}
