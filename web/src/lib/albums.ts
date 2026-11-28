/*
===============================================================================
 Family Chalk Planner | Screens | Helpers | albums.ts
===============================================================================
 Version:   1.3.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-28
 Updated:   2026-11-28

 Purpose:
     The photo albums there are: the board's own first, then the admin's
     more albums. With more than one, the 📷 Albums page shows (in the ☰
     menu, the pins and the swipe).

 Used by:
     web/src/pages/Albums.tsx
     web/src/ui/Menu.tsx
     web/src/ui/Shell.tsx
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.3.0     2026-11-28   joshua    New file.
                        claude
===============================================================================
*/

import { useLive } from './live.ts';
import type { Album } from '../board/photos.ts';

export function useAlbums(): Album[] {
  return useLive<{ albums: Album[] }>('api/photos/albums', ['photos']).data?.albums || [];
}
// the 📷 Albums page: only once there's more than one album to pick from
export const hidden = (id: string, albums: Album[]) => id === 'albums' && albums.length < 2;
