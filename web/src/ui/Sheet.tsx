/*
===============================================================================
 Family Chalk Planner | Screens | UI | Sheet.tsx
===============================================================================
 Version:   0.15.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Updated:   2026-11-08

 Purpose:
     A card over the page, for adding or changing one thing. Escape or a
     tap outside closes it.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    The new screens (React + TypeScript): meal
                        colby     plan, reminders, timers, pantry, jars and
                        claude    chores.

 0.15.0    2026-11-08   joshua    Focuses its first field only when it opens; a
                        claude    tap outside closes it, a drag doesn't.
===============================================================================
*/

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------- //
// | A card | //
// ---------- //
export function Sheet({
  title,
  onClose,
  children,
  id
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  id?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const down = useRef(false);
  const close = useRef(onClose);
  close.current = onClose;
  // the first field is ready to type in when it opens (only then: focusing again each time the card
  // redraws scrolled it back to the top while you were picking further down)
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, []);
  return (
    // closes on a tap outside the card: pressed and let go outside it (a drag that ends outside, like
    // scrolling a row of fonts, doesn't count)
    <div
      className="scrim"
      onPointerDown={e => (down.current = e.target === e.currentTarget)}
      onClick={e => {
        if (down.current && e.target === e.currentTarget) onClose();
        down.current = false;
      }}
    >
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} ref={ref} id={id}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
