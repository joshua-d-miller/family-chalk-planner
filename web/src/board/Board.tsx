// The board: the month, the art on it, and the right-hand column, on the board's surface. It's laid out
// at 1252 x 642 board pixels and scaled to fill the screen. Text and art are vector, so they're sharp at
// any size; the surface texture is painted at the screen's real resolution (4K included).
import { useEffect, useMemo, useState } from 'react';
import { useLive } from '../lib/live.ts';
import { paintSurface, seasonOf, surfaceOf } from '../lib/surface.ts';
import type { Who } from '../lib/who.ts';
import { Art } from './Art.tsx';
import type { ArtItem } from './Art.tsx';
import { MONTHS, Month } from './Month.tsx';
import type { Bins, Border, MonthData } from './Month.tsx';
import type { Photos } from './photos.ts';
import { DEFAULT_TITLE, Title } from './Title.tsx';
import type { TitleStyle } from './Title.tsx';
import { TitlePhotos, titlePool } from './TitlePhotos.tsx';
import type { Side } from './TitlePhotos.tsx';
import { Notes } from './Notes.tsx';
import { themeCss, themeVals } from './theme.ts';
import type { Theme } from './theme.ts';
import './board.css';

const W = 1252;
const H = 642;

export type MonthMeta = {
  hideTitle?: boolean;
  title?: TitleStyle;
  defaultTitle?: TitleStyle;
  side?: Side;
  border?: Border;
  artPad: number;
  boardPad?: number;
};

// how big the board is on this screen (with its frame, if it has one), and how many screen pixels each
// board pixel gets
function useFit(pad: number) {
  const calc = () => {
    const scale = Math.min(innerWidth / (W + 2 * pad), innerHeight / (H + 2 * pad));
    return { scale, res: Math.max(1, Math.min(4, Math.round(scale * (devicePixelRatio || 1) * 2) / 2)) };
  };
  const [fit, setFit] = useState(calc);
  useEffect(() => {
    const on = () => setFit(calc());
    on();
    addEventListener('resize', on);
    return () => removeEventListener('resize', on);
  }, [pad]);
  return fit;
}

export function Board({ who }: { who: Who | null }) {
  void who;
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
  const meta = useLive<MonthMeta>(shown ? `api/meta?ym=${shown}` : 'api/today', ['meta']).data;
  const photos = useLive<Photos>('api/photos', ['photos']).data;
  const pad = meta && 'artPad' in meta ? meta.boardPad || 0 : 0;
  const { scale, res } = useFit(pad);
  const extras = useLive<{ bins: Bins }>('api/extras', ['extras']).data;
  const theme = useLive<Theme>('api/theme', ['theme']).data;
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

  const tv = useMemo(() => themeVals(theme), [theme]);
  const css = useMemo(() => themeCss(tv, sf.lum), [tv, sf.lum]);
  const m = month.data && 'grid' in month.data ? month.data : null;
  const mm = meta && 'artPad' in meta ? meta : null;
  const items = Array.isArray(art.data) ? art.data : [];
  const titleStyle = mm?.title || mm?.defaultTitle || DEFAULT_TITLE;
  const photosOn = mm?.side ? mm.side.mode === 'photos' : !!photos?.cfg?.frame;
  const pool = photos?.photos && photosOn ? titlePool(photos.photos, mm?.side) : [];
  const monthName = m ? MONTHS[m.grid.m - 1] : '';
  return (
    // one continuous surface across the whole screen, so the bands beside the board match it
    <div id="stage" className={sf.lum > 0.18 ? 'light' : ''} style={{ backgroundImage: bg }}>
      <div
        id="board"
        style={{
          transform: `scale(${scale})`,
          padding: pad,
          width: W + 2 * pad,
          height: H + 2 * pad,
          background: pad ? sf.frame || 'var(--wood)' : undefined
        }}
      >
        <div className="slate" data-surface={sf.id}>
          <style>{css}</style>
          {m && (
            <Month
              data={m}
              bins={extras?.bins || null}
              bg={sf.lum}
              today={{ shape: tv.todayS, color: tv.todayC }}
              border={mm?.border || null}
              title={
                <Title
                  text={monthName}
                  year={m.grid.y !== Number(m.today.slice(0, 4)) ? m.grid.y : undefined}
                  style={titleStyle}
                  hand={!!mm?.hideTitle}
                  bg={sf.lum}
                />
              }
            />
          )}
          {m && (
            <TitlePhotos
              pool={pool}
              art={items}
              layoutKey={`${monthName}|${JSON.stringify(titleStyle)}|${mm?.border?.size || ''}`}
            />
          )}
          <Notes time24={!!today?.time24} />
          <Art items={items} bg={sf.lum} res={res} gifsPlay={false} />
        </div>
      </div>
    </div>
  );
}
