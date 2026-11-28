/*
===============================================================================
 Family Chalk Planner | Screens | UI | SwipeDots.tsx
===============================================================================
 Version:   1.3.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-26
 Updated:   2026-11-26

 Purpose:
     After a swipe between pages: a row of chalk dots (the calendar, then
     each page swiped through) with this one lit, fading out after about 2
     seconds.

 Used by:
     web/src/App.tsx
     web/src/board/Board.tsx
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.3.0     2026-11-26   joshua    New file.
                        claude
===============================================================================
*/

import { useState } from 'react';
import { backDots } from '../lib/swipePages.ts';

export function SwipeDots({ n, at }: { n: number; at: number }) {
  if (n < 2) return null;
  return (
    <div className="swipeDots" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <i key={i} className={i === at ? 'on' : undefined} />
      ))}
    </div>
  );
}

// the calendar, just swiped back to: the dots with the first one lit
export function BackDots() {
  const [n] = useState(backDots);
  return <SwipeDots n={n} at={0} />;
}
