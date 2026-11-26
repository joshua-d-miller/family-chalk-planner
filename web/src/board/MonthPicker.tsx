/*
===============================================================================
 Family Chalk Planner | Screens | Board | MonthPicker.tsx
===============================================================================
 Version:   1.3.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-26
 Updated:   2026-11-26

 Purpose:
     A tap on the month's name, on a screen that edits: any month of any
     year in two taps (the arrows go one at a time, and can be hidden),
     back to this month, or start the board again (what the tap did
     before).

 Used by:
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
import { Sheet } from '../ui/Sheet.tsx';
import { MONTHS } from './Month.tsx';

export function MonthPicker({
  shown,
  today,
  onPick,
  onClose
}: {
  shown: string; // 'YYYY-MM' on the board now
  today: string; // 'YYYY-MM' this month
  onPick: (ym: string) => void;
  onClose: () => void;
}) {
  const [year, setYear] = useState(Number(shown.slice(0, 4)));
  const ym = (m: number) => `${year}-${String(m + 1).padStart(2, '0')}`;
  return (
    <Sheet title="Go to a month" onClose={onClose} id="monthPicker" focus={false}>
      <div className="mpYear">
        <button type="button" className="btn" aria-label="Previous year" onClick={() => setYear(y => y - 1)}>
          ‹
        </button>
        <b id="mpYear">{year}</b>
        <button type="button" className="btn" aria-label="Next year" onClick={() => setYear(y => y + 1)}>
          ›
        </button>
      </div>
      <div className="mpMonths">
        {MONTHS.map((name, m) => (
          <button
            key={name}
            type="button"
            className={'seg' + (ym(m) === shown ? ' on' : '') + (ym(m) === today ? ' now' : '')}
            aria-current={ym(m) === shown ? 'true' : undefined}
            onClick={() => onPick(ym(m))}
          >
            {name.slice(0, 3)}
          </button>
        ))}
      </div>
      <div className="mpMore">
        <button type="button" className="btn go" onClick={() => onPick(today)}>
          This month
        </button>
        <button type="button" className="btn" id="mpReload" onClick={() => location.reload()}>
          ↻ Start the board again
        </button>
      </div>
    </Sheet>
  );
}
