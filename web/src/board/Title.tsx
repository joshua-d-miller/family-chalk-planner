// The month's name above the calendar, in the month's own style (font, color, outline, size), or left
// empty for a hand-lettered one. Shrinks a wide or tall font so it never runs into the arrows or off the top.
import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { fontCss } from './Art.tsx';
import { readable } from './color.ts';
import { measure } from './geom.ts';

export type TitleStyle = { f: number; c: string; o: string | null; z: number };
export const DEFAULT_TITLE: TitleStyle = { f: 7, c: '#F6B3CB', o: '#F3A35E', z: 68 };

const MAX_W = 520;
const TOP = 3; // the letters stay between these (board pixels from the top of the slate)
const BOTTOM = 84;

export function Title({
  text,
  year,
  style,
  hand,
  bg
}: {
  text: string;
  year?: number;
  style: TitleStyle;
  hand: boolean;
  bg: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [fit, setFit] = useState({ z: style.z, dy: 0 });
  useLayoutEffect(() => {
    const mn = ref.current;
    let z = style.z;
    const m = measure(fontCss(style.f, z), text);
    if (!mn || !m) return setFit({ z, dy: 0 });
    if (m.width > MAX_W) z = Math.floor((z * MAX_W) / m.width);
    const out = (style.o ? Math.max(3, style.z / 15) / 2 : 0) + 1;
    const ink = (zz: number) => {
      const g = measure(fontCss(style.f, zz), text)!;
      return {
        a: g.actualBoundingBoxAscent + out,
        d: g.actualBoundingBoxDescent + out,
        fa: g.fontBoundingBoxAscent,
        fd: g.fontBoundingBoxDescent
      };
    };
    let g = ink(z);
    if (!(g.a + g.d > 0)) return setFit({ z, dy: 0 }); // a browser that can't measure letters
    if (g.a + g.d > BOTTOM - TOP) {
      z = Math.floor((z * (BOTTOM - TOP)) / (g.a + g.d));
      g = ink(z);
    }
    // where the line box sits on the slate (offsetTop is in board pixels, whatever the screen's scale)
    let top0 = 0;
    for (let n: HTMLElement | null = mn; n && !n.classList.contains('slate'); n = n.offsetParent as HTMLElement | null)
      top0 += n.offsetTop;
    const lineH = mn.offsetHeight;
    const base = top0 + (lineH - (g.fa + g.fd)) / 2 + g.fa;
    const t = base - g.a;
    const b = base + g.d;
    let dy = 0;
    if (t < TOP) dy = Math.min(TOP - t, BOTTOM - b);
    else if (b > BOTTOM) dy = Math.max(BOTTOM - b, TOP - t);
    setFit(f => (f.z === z && f.dy === Math.round(dy) ? f : { z, dy: Math.round(dy) }));
  }, [text, style.f, style.z, style.o]);

  const outline = style.o ? readable(style.o, bg, 1.5) : null;
  return (
    <h1
      id="monthName"
      className={(hand ? 'hand' : '') + (outline ? '' : ' noout')}
      style={
        outline ? ({ '--tout': outline, '--toutw': Math.max(3, style.z / 15) + 'px' } as CSSProperties) : undefined
      }
    >
      <span
        ref={ref}
        className="mn"
        data-text={text}
        style={{ font: fontCss(style.f, fit.z), color: readable(style.c, bg, 3), top: fit.dy }}
      >
        {text}
      </span>
      {year !== undefined && <small>{year}</small>}
    </h1>
  );
}
