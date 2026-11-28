/*
===============================================================================
 Family Chalk Planner | Screens | Pages | Albums.tsx
===============================================================================
 Version:   1.3.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-28
 Updated:   2026-11-28

 Purpose:
     📷 Albums: every photo album the admin set up, each with its first
     photo as a cover. Tap one to play it full-screen (a swipe goes to the
     next photos or back, as in the slideshow); a tap ends it.

 Used by:
     web/src/App.tsx
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.3.0     2026-11-28   joshua    New file.
                        claude
===============================================================================
*/

import { useState } from 'react';
import { useAlbums } from '../lib/albums.ts';
import { useLive } from '../lib/live.ts';
import type { Who } from '../lib/who.ts';
import { photoSrc } from '../board/photos.ts';
import type { Photos } from '../board/photos.ts';
import { Slideshow } from '../board/Slideshow.tsx';
import { Page } from '../ui/Page.tsx';
import './albums.css';

export function Albums({ who }: { who: Who | null }) {
  const albums = useAlbums();
  const [playing, setPlaying] = useState<string | null>(null);
  const time24 = !!useLive<{ time24: boolean }>('api/today', ['calendar']).data?.time24;
  const shown = useLive<Photos>(
    playing === null ? '' : playing ? `api/photos?album=${encodeURIComponent(playing)}` : 'api/photos',
    ['photos']
  ).data;
  return (
    <Page id="albums" title="Albums" who={who}>
      <div className="albumGrid">
        {albums.map(a => (
          <button
            type="button"
            key={a.id}
            className="albumTile"
            disabled={!a.count}
            onClick={() => setPlaying(a.id)}
            aria-label={`Play ${a.id ? a.name : 'Photos'}`}
          >
            {a.cover ? (
              <img alt="" src={photoSrc({ id: a.cover, w: 0, h: 0, date: 0, album: a.id || undefined })} />
            ) : (
              <span className="none">📷</span>
            )}
            <b>{a.id ? a.name : 'Photos'}</b>
            <small>{a.count === 1 ? '1 photo' : `${a.count} photos`}</small>
          </button>
        ))}
      </div>
      {playing !== null && shown && <Slideshow photos={shown} on time24={time24} onTap={() => setPlaying(null)} />}
    </Page>
  );
}
