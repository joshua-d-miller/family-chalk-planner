/*
===============================================================================
 Family Chalk Planner | Screens | Board | Title.tsx
===============================================================================
 Version:   1.3.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-07
 Updated:   2026-11-28

 Purpose:
     The month's name above the calendar, in the month's own style (font,
     color, outline, size), or left empty for a hand-lettered one. Shrinks
     a wide or tall font so it never runs into the arrows or off the top.

 Used by:
     web/src/board/Board.tsx
     web/src/board/editors/TitleEditor.tsx
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    The new board: the family's style, each
                        colby     month's title and holiday border, polaroids,
                        claude    drawn jars.

                                  The new board on a tablet (next/edit):
                                  events, the month's title and border, the
                                  board style.

                                  The new screens take over: /, /edit and
                                  /chores are the React board; the old one
                                  stays at /classic.

 1.3.0    2026-11-28   joshua    Lettering: a white outline like a sticker,
                        claude    inline, a drop shadow or neon; streaks; a
                                  ribbon banner behind it.
===============================================================================
*/

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { fontCss } from './Art.tsx';
import { readable } from './color.ts';
import { measure } from './geom.ts';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------- //
// | The style | //
// ------------- //
// l: lettering, 'sticker' | 'inline' | 'shadow' | 'neon' (none: an outline, as before); s: marker streaks
export type TitleStyle = { f: number; c: string; o: string | null; z: number; l?: string; s?: boolean; b?: boolean };
export const DEFAULT_TITLE: TitleStyle = { f: 7, c: '#F6B3CB', o: '#F3A35E', z: 68 };

const MAX_W = 520;
const TOP = 3; // the letters stay between these (board pixels from the top of the slate)
const BOTTOM = 84;

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------- //
// | The title | //
// ------------- //
export function Title({
  text,
  year,
  style,
  hand,
  bg,
  dashed = false
}: {
  text: string;
  year?: number;
  style: TitleStyle;
  hand: boolean;
  bg: number;
  dashed?: boolean; // a tablet: show where to hand-letter it
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [fit, setFit] = useState({ z: style.z, dy: 0 });
  // measured again once the board's fonts have arrived (before that, the letters are a stand-in font)
  const [fonts, setFonts] = useState(0);
  useEffect(() => {
    const again = () => setFonts(n => n + 1);
    document.fonts?.addEventListener?.('loadingdone', again);
    document.fonts?.ready.then(again);
    return () => document.fonts?.removeEventListener?.('loadingdone', again);
  }, []);
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
    top0 -= parseFloat(mn.style.top) || 0; // without the nudge already applied
    const lineH = mn.offsetHeight;
    const base = top0 + (lineH - (g.fa + g.fd)) / 2 + g.fa;
    const t = base - g.a;
    const b = base + g.d;
    let dy = 0;
    if (t < TOP) dy = Math.min(TOP - t, BOTTOM - b);
    else if (b > BOTTOM) dy = Math.max(BOTTOM - b, TOP - t);
    setFit(f => (f.z === z && f.dy === Math.round(dy) ? f : { z, dy: Math.round(dy) }));
  }, [text, style.f, style.z, style.o, fonts]);

  const outline = style.o ? readable(style.o, bg, 1.5) : null;
  const fill = readable(style.c, bg, 3);
  // the lettering (board.css): an outline (as before), a white one like a sticker, inline, a drop shadow or neon
  const l = !hand && style.l ? ' lt-' + style.l : '';
  const lit = l === ' lt-neon' || l === ' lt-shadow' || l === ' lt-inline'; // (these need no outline color)
  return (
    <h1
      id="monthName"
      className={
        (hand ? 'hand' + (dashed ? ' dashed' : '') : '') +
        (outline || lit || l ? '' : ' noout') +
        l +
        (style.s && !hand ? ' streaks' : '') +
        (style.b ? ' ribbon' : '')
      }
      style={
        {
          '--tout': outline || '#F3A35E',
          '--toutw': Math.max(3, style.z / 15) + 'px',
          '--tc': fill,
          '--tboard': bg > 0.18 ? '#F4F1E8' : '#151617',
          '--rib': style.o || '#F6B3CB'
        } as CSSProperties
      }
    >
      <span
        ref={ref}
        className="mn"
        data-text={text}
        style={{ font: fontCss(style.f, fit.z), lineHeight: 1.2, color: fill, top: fit.dy }}
      >
        {text}
      </span>
      {year !== undefined && <small>{year}</small>}
    </h1>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
