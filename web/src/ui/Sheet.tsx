/*
===============================================================================
 Family Chalk Planner | Screens | UI | Sheet.tsx
===============================================================================
 Version:   1.1.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Updated:   2026-11-17

 Purpose:
     A card over the page, for adding or changing one thing. The ✕ at its
     top right, Escape, or a tap outside closes it (the same as Cancel:
     nothing is saved).
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

 0.17.0    2026-11-14   joshua    A card can open without focusing anything
                        claude    (Pictures: its search box would bring up the
                                  keyboard on a touch screen every time).

 1.1.0    2026-11-17   joshua    A ✕ at the top right of every card, so a
                        claude    long one can be closed without scrolling
                                  down to Cancel or tapping outside it. Its
                                  title row stays put while the card scrolls.
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
  id,
  focus = true
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  id?: string;
  focus?: boolean; // focus the first field when it opens (not where that brings up a keyboard for nothing)
}) {
  const ref = useRef<HTMLDivElement>(null);
  const down = useRef(false);
  const close = useRef(onClose);
  close.current = onClose;
  // the first field is ready to type in when it opens (only then: focusing again each time the card
  // redraws scrolled it back to the top while you were picking further down)
  useEffect(() => {
    if (focus)
      ref.current
        ?.querySelector<HTMLElement>('input, select, textarea, button:not(.closex)')
        ?.focus({ preventScroll: true });
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
        {/* the title and the ✕: stay at the top while a long card scrolls */}
        <div className="shead">
          <h3>{title}</h3>
          <CloseX onClose={onClose} />
        </div>
        {children}
      </div>
    </div>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------- //
// | The ✕ | //
// --------- //
// The close button at a card's (or the ☰ menu's) top right: big enough for  //
// a child's finger, and named "Close" for screen readers.                   //
export function CloseX({ onClose, label = 'Close' }: { onClose: () => void; label?: string }) {
  return (
    <button type="button" className="closex" aria-label={label} title={label} onClick={onClose}>
      <span aria-hidden="true">✕</span>
    </button>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
