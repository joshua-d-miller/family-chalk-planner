/*
===============================================================================
 Family Chalk Planner | Screens | UI | JarArt.tsx
===============================================================================
 Version:   0.13.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-07
 Updated:   2026-11-07

 Purpose:
     A reward jar, drawn: the pieces stacked from the bottom in offset
     rows, a dashed line at the goal, and the jar glowing once it's full.
     New pieces drop in. The same drawing as the current board.

 Used by:
     web/src/board/Notes.tsx
     web/src/pages/Jars.tsx
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    The new board: the family's style, each
                        colby     month's title and holiday border, polaroids,
                        claude    drawn jars.
===============================================================================
*/

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { Jar, JarPiece } from '../../../shared/lists.ts';
import { hash } from '../board/geom.ts';
import './jar.css';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------- //
// | The pieces | //
// -------------- //
// Hearts, stars, lightning bolts, rainbows and a little round critter, each //
// in a few colors.                                                          //
const COLORS: Record<JarPiece, string[]> = {
  heart: ['#FF4FA3', '#F6B3CB', '#E8262B', '#FF8FC7'],
  star: ['#FFE500', '#F2D479', '#FFFFFF', '#FF8C1A'],
  bolt: ['#FFE500', '#FF8C1A'],
  critter: ['#3EC6F2', '#1FB04C', '#FF8C1A', '#8B4FD8', '#FF4FA3'],
  rainbow: ['#E8262B']
};

function Piece({ type, c }: { type: JarPiece; c: string }): ReactNode {
  if (type === 'heart') return <path d="M0 6C-9-1-5-9 0-4C5-9 9-1 0 6Z" fill={c} />;
  if (type === 'rainbow')
    return (
      <>
        <g fill="none" strokeLinecap="round">
          <path d="M-8 3A8 8 0 0 1 8 3" stroke="#E8262B" strokeWidth="2.6" />
          <path d="M-5.4 3A5.4 5.4 0 0 1 5.4 3" stroke="#FFE500" strokeWidth="2.6" />
          <path d="M-2.8 3A2.8 2.8 0 0 1 2.8 3" stroke="#3EC6F2" strokeWidth="2.6" />
        </g>
        <circle cx="-8" cy="4" r="2.2" fill="#fff" />
        <circle cx="8" cy="4" r="2.2" fill="#fff" />
      </>
    );
  if (type === 'star')
    return (
      <polygon points="0,-9 2.6,-3.4 8.6,-2.8 4.1,1.3 5.3,7.3 0,4.2 -5.3,7.3 -4.1,1.3 -8.6,-2.8 -2.6,-3.4" fill={c} />
    );
  if (type === 'bolt') return <polygon points="-1,-9 6,-9 1.5,-2 6.5,-2 -4,9.5 -1,0.5 -5.5,0.5" fill={c} />;
  // critter: an original little round monster
  return (
    <>
      <circle cx="-4.6" cy="-5.6" r="2.4" fill={c} />
      <circle cx="4.6" cy="-5.6" r="2.4" fill={c} />
      <ellipse cx="0" cy="0.5" rx="7.4" ry="6.6" fill={c} />
      <circle cx="-2.6" cy="-0.6" r="2" fill="#fff" />
      <circle cx="2.6" cy="-0.6" r="2" fill="#fff" />
      <circle cx="-2.3" cy="-0.3" r="1" fill="#141414" />
      <circle cx="2.9" cy="-0.3" r="1" fill="#141414" />
      <path d="M-1.6 3Q0 4.4 1.6 3" stroke="#141414" strokeWidth=".9" fill="none" strokeLinecap="round" />
      <circle cx="-4.6" cy="2.4" r="1.1" fill="#F6B3CB" opacity=".8" />
      <circle cx="4.6" cy="2.4" r="1.1" fill="#F6B3CB" opacity=".8" />
    </>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------- //
// | One jar | //
// ----------- //
// The pieces stack from the bottom in offset rows, with a little jitter;    //
// the dashed line is the goal. Pieces added since the last time drop in.    //
export function JarArt({ jar: j }: { jar: Jar }) {
  // the count it showed last time: the pieces added since then drop in
  const seen = useRef<number | null>(null);
  const dropFrom = seen.current != null && j.count > seen.current ? seen.current : null;
  useEffect(() => {
    seen.current = j.count;
  }, [j.count]);
  // interior roughly x -30..30, y -100..-3
  const goal = Math.max(3, j.goal);
  const s = Math.max(9, Math.min(24, Math.sqrt((60 * 92) / goal) * 0.95));
  const sc = s / 19;
  const cols = Math.max(2, Math.floor(58 / s));
  const rowH = s * 0.86;
  const shown = Math.min(j.count, Math.ceil(goal * 1.35));
  const pieces: ReactNode[] = [];
  for (let i = 0; i < shown; i++) {
    const row = Math.floor(i / cols);
    const off = row % 2 ? s / 2 : 0;
    let x = -29 + s / 2 + (i % cols) * s + off + (hash(i, 1) - 0.5) * s * 0.3;
    if (x > 29 - s / 2) x -= s;
    const y = -3 - s / 2 - row * rowH + (hash(i, 2) - 0.5) * s * 0.15;
    const type = (j.items[i] || j.pieces[i % j.pieces.length] || 'star') as JarPiece;
    const cs = COLORS[type] || COLORS.star;
    const drop = dropFrom != null && i >= dropFrom;
    pieces.push(
      <g
        key={i}
        className={'pc' + (drop ? ' drop' : '')}
        style={drop ? { animationDelay: ((i - dropFrom!) * 0.12).toFixed(2) + 's' } : undefined}
      >
        <g
          transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${Math.round((hash(i, 4) - 0.5) * 40)}) scale(${sc.toFixed(2)})`}
        >
          <Piece type={type} c={cs[Math.floor(hash(i, 3) * cs.length)]} />
        </g>
      </g>
    );
  }
  const gy = Math.max(-100, -3 - Math.ceil(goal / cols) * rowH);
  return (
    <svg className="jarart" viewBox="-45 -126 90 130" aria-hidden="true">
      {pieces}
      <line
        x1="-31"
        x2="31"
        y1={gy.toFixed(1)}
        y2={gy.toFixed(1)}
        stroke="rgba(242,212,121,.55)"
        strokeWidth="1.2"
        strokeDasharray="3 3"
      />
      <path
        className="jarline"
        d="M-26 -112 L-26 -106 Q-36 -102 -36 -92 L-36 -8 Q-36 2 -26 2 L26 2 Q36 2 36 -8 L36 -92 Q36 -102 26 -106 L26 -112"
      />
      <rect className="jarline" x="-29" y="-122" width="58" height="10" rx="3" />
    </svg>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------------------- //
// | The jars in a row | //
// --------------------- //
// The jars in a row, as on the board's Notes column                         //
export function JarRow({ jars }: { jars: Jar[] }) {
  return (
    <div className={'jars n' + jars.length}>
      {jars.map(j => (
        <div key={j.id} className={'jar' + (j.count >= j.goal ? ' full' : '')} data-id={j.id}>
          <JarArt jar={j} />
          <div className="jn chalk">{j.name}</div>
          <div className="jc">{j.count >= j.goal ? `★ Full! ${j.count}/${j.goal}` : `${j.count} / ${j.goal}`}</div>
        </div>
      ))}
    </div>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
