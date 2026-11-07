/*
===============================================================================
 Family Chalk Planner | Screens | UI | Sheet.tsx
===============================================================================
 Version:   0.13.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Updated:   2026-11-07

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
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', key);
    ref.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
    return () => removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <div className="scrim" onPointerDown={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} ref={ref} id={id}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
