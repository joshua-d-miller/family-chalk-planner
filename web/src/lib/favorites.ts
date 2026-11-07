// The person's (or this screen's) favorites: kept on the strip, starred in the ☰ menu
import { useCallback } from 'react';
import { post } from './api.ts';
import { useLive } from './live.ts';

export const MAX_FAVORITES = 4;
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
