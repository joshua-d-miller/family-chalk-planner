// Weather that moves: gentle rain, snow or a storm across the board when it's actually happening,
// for about 20 seconds every 10 minutes. ?wx=rain / snow / storm to see it any time.
import { useEffect, useMemo, useState } from 'react';
import { useLive } from '../lib/live.ts';

export function WeatherMotion({ wall }: { wall: boolean }) {
  const x = useLive<{ weather: { now: { kind: string } } | null }>('api/extras', ['extras']).data;
  let kind = new URLSearchParams(location.search).get('wx') || x?.weather?.now?.kind || '';
  if (!/^(rain|snow|storm)$/.test(kind)) kind = '';
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!kind) return setOn(false);
    let off: ReturnType<typeof setTimeout>;
    const show = () => {
      setOn(true);
      off = setTimeout(() => setOn(false), 20000);
    };
    show();
    const t = setInterval(show, 10 * 60 * 1000);
    return () => {
      clearInterval(t);
      clearTimeout(off);
    };
  }, [kind]);
  const bits = useMemo(() => {
    const r = (a: number, b: number) => a + Math.random() * (b - a);
    if (kind === 'snow')
      return Array.from({ length: 40 }, (_, i) => {
        const sz = r(2.5, 6).toFixed(1) + 'px';
        return (
          <div
            key={i}
            className="snow"
            style={{
              width: sz,
              height: sz,
              left: r(0, 1252),
              opacity: +r(0.45, 0.95).toFixed(2),
              animationDuration: r(7, 13).toFixed(1) + 's',
              animationDelay: -r(0, 13).toFixed(1) + 's'
            }}
          />
        );
      });
    if (kind)
      return Array.from({ length: wall ? 64 : 46 }, (_, i) => (
        <div
          key={i}
          className={'rain' + (wall ? ' far' : '')}
          style={{
            left: r(0, 1300),
            animationDuration: r(0.7, 1.1).toFixed(2) + 's',
            animationDelay: -r(0, 1.1).toFixed(2) + 's'
          }}
        />
      ));
    return [];
  }, [kind, wall]);
  if (!kind) return null;
  return (
    <div className={'wx' + (on ? ' on' : '')} aria-hidden="true">
      {on && bits}
      {on && kind === 'storm' && <div className="flash" />}
    </div>
  );
}
