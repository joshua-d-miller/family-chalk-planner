/*
===============================================================================
 Family Chalk Planner | Screens | Board | Countdown.tsx
===============================================================================
 Version:   1.1.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-17
 Updated:   2026-11-17

 Purpose:
     The fun side of countdowns. A big card for the next one: its picture,
     the number of sleeps (or days) in big chalk numbers, and its name; on
     the day it turns into "It's today!" with a short burst of confetti.
     On a kid's tablet a paper chain hangs under it: one link a day, so one
     comes off each morning.

 How it fits:
     The card shows on a kid's tablet (above their chores) and on the
     overnight slideshow; the numbers come from /api/countdowns and the
     screen's own choice of sleeps or days (web/src/lib/countdowns.ts).

 Known limitations:
     The chain shows up to 31 links (a month); further out, it says how
     many more. Confetti is skipped when the screen asks for less motion.

 Used by:
     web/src/pages/Chores.tsx
     web/src/board/Slideshow.tsx
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.1.0    2026-11-17   joshua    New file: the big countdown card, the paper
                        claude    chain and "It's today!".
===============================================================================
*/

import { useMemo } from 'react';
import { howLong } from '../lib/countdowns.ts';
import type { Countdown } from '../lib/countdowns.ts';
import './countdown.css';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------- //
// | The big card | //
// ---------------- //
// size 'big' on a kid's tablet; 'corner' on the slideshow (smaller, calm).  //
export function CountdownCard({
  c,
  sleeps,
  size = 'big',
  chain = false
}: {
  c: Countdown;
  sleeps: boolean;
  size?: 'big' | 'corner';
  chain?: boolean;
}) {
  const today = c.days <= 0;
  const unit = sleeps ? (c.days === 1 ? 'sleep' : 'sleeps') : c.days === 1 ? 'day' : 'days';
  return (
    <section
      className={'cdcard ' + size + (today ? ' today' : '')}
      id={size === 'big' ? 'cdCard' : 'cdCorner'}
      aria-label={today ? `${c.title} is today` : `${c.title}: ${howLong(c.days, sleeps)} to go`}
    >
      {today && size === 'big' && <Confetti />}
      <div className="cdpic emoji" aria-hidden="true">
        {c.icon}
      </div>
      {today ? (
        <div className="cdtext">
          <div className="cdtoday">It’s today!</div>
          <div className="cdtitle">{c.title}</div>
        </div>
      ) : (
        <div className="cdtext">
          <div className="cdnum">
            <b>{c.days}</b> <span>{unit} to go</span>
          </div>
          <div className="cdtitle">until {c.title}</div>
        </div>
      )}
      {chain && !today && <PaperChain days={c.days} />}
    </section>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------- //
// | The paper chain | //
// ------------------- //
// One link for each day left, in the board's chalk colors; a link comes     //
// off each morning.                                                         //
const LINK_COLORS = ['#F6B3CB', '#F2D479', '#9CC9E6', '#A9D8A0', '#E8A35C', '#B49CE0'];
const MAX_LINKS = 31;
const PER_ROW = 12; // links in a row before the chain carries on below
const STEP = 40; // from one link to the next
export function PaperChain({ days }: { days: number }) {
  const n = Math.max(0, Math.min(days, MAX_LINKS));
  const rows = Array.from({ length: Math.ceil(n / PER_ROW) }, (_, r) =>
    Array.from({ length: Math.min(PER_ROW, n - r * PER_ROW) }, (_, i) => r * PER_ROW + i)
  );
  return (
    <div className="chain" role="img" aria-label={`A paper chain with ${days} links, one for each day`}>
      {rows.map((row, r) => (
        <svg key={r} width={row.length * STEP + 24} height={44} viewBox={`0 0 ${row.length * STEP + 24} 44`}>
          {/* the loops seen flat first, then the ones seen edge-on threaded through them */}
          {row.map((k, i) =>
            k % 2 ? null : (
              <rect
                key={k}
                className="link"
                x={i * STEP + 4}
                y={6}
                width={52}
                height={32}
                rx={16}
                fill="none"
                stroke={LINK_COLORS[k % LINK_COLORS.length]}
                strokeWidth={7}
              />
            )
          )}
          {row.map((k, i) =>
            k % 2 ? (
              <rect
                key={k}
                className="link side"
                x={i * STEP + 4}
                y={17}
                width={52}
                height={10}
                rx={5}
                fill={LINK_COLORS[k % LINK_COLORS.length]}
              />
            ) : null
          )}
        </svg>
      ))}
      {days > MAX_LINKS && <span className="chainmore">+{days - MAX_LINKS} more</span>}
    </div>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------ //
// | Confetti | //
// ------------ //
// A short burst when the day comes (about 3 seconds, once).                 //
function Confetti() {
  const bits = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        left: Math.round(((i * 37) % 100) + (i % 3)),
        delay: ((i * 53) % 90) / 100,
        color: LINK_COLORS[i % LINK_COLORS.length],
        turn: (i * 47) % 360
      })),
    []
  );
  return (
    <div className="confetti" aria-hidden="true">
      {bits.map((b, i) => (
        <i
          key={i}
          style={{
            left: b.left + '%',
            background: b.color,
            animationDelay: b.delay + 's',
            transform: `rotate(${b.turn}deg)`
          }}
        />
      ))}
    </div>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
