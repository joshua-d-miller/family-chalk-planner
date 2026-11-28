/*
===============================================================================
 Family Chalk Planner | Screens | Helpers | later.tsx
===============================================================================
 Version:   1.3.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-26
 Updated:   2026-11-26

 Purpose:
     A part of the screens downloaded on its own, when it's first needed
     (or fetched ahead with .fetch()), so a wall doesn't load what only
     editing uses. Once its code is here it shows straight away: React's
     lazy() alone would still wait a moment, showing nothing.

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

import { Suspense, createElement, lazy } from 'react';
import type { ComponentType } from 'react';

export function later<P extends object>(get: () => Promise<ComponentType<P>>) {
  let ready: ComponentType<P> | null = null;
  const fetch = () => get().then(c => (ready = c));
  const Waiting = lazy(() => fetch().then(c => ({ default: c })));
  const Later = (p: P) => (
    <Suspense fallback={null}>{createElement((ready || Waiting) as ComponentType<P>, p)}</Suspense>
  );
  // fetched ahead: a failure is tried again when it's needed
  return Object.assign(Later, { fetch: () => void fetch().catch(() => {}) });
}
