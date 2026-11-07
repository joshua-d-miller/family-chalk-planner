/*
===============================================================================
 Family Chalk Planner | Screens | Helpers | favorites.ts
===============================================================================
 Version:   0.13.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Updated:   2026-11-07

 Purpose:
     The person's (or this screen's) favorites: kept on the strip, starred
     in the ☰ menu
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

import { useCallback } from 'react';
import { post } from './api.ts';
import { useLive } from './live.ts';

export const MAX_FAVORITES = 4;

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------- //
// | Favorites | //
// ------------- //
export function useFavorites() {
  const f = useLive<{ items: string[]; saved: boolean }>('api/favorites', ['favorites']);
  const toggle = useCallback(
    async (id: string) => {
      const now = f.data?.items || [];
      const items = now.includes(id) ? now.filter(x => x !== id) : [...now, id].slice(-MAX_FAVORITES);
      f.set({ items, saved: true });
      f.set(await post('api/favorites', { items }));
    },
    [f]
  );
  return { items: f.data?.items || [], canSave: !!f.data?.saved, toggle };
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
