/*
===============================================================================
 Family Chalk Planner | Screens | Board editors | PhotosEditor.tsx
===============================================================================
 Version:   0.14.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-07
 Updated:   2026-11-07

 Purpose:
     📷 Beside the month name: the family's photos (a random few, or ones
     she picks, in order) or room to draw. The slideshow's own settings
     are in ⚙️ Settings.

 Used by:
     web/src/board/Board.tsx
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    The new screens take over: /, /edit and
                        colby     /chores are the React board; the old one
                        claude    stays at /classic.

 0.14.0    2026-11-07   joshua    Opens for a month saved by an older board
                        claude    (no picked photos).
===============================================================================
*/

import { useState } from 'react';
import { post } from '../../lib/api.ts';
import { Btn, Segs } from '../../ui/bits.tsx';
import { Sheet } from '../../ui/Sheet.tsx';
import type { MonthMeta } from '../Board.tsx';
import { photoSrc } from '../photos.ts';
import type { Photos } from '../photos.ts';
import type { Side } from '../TitlePhotos.tsx';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------------------------- //
// | Photos beside the title | //
// --------------------------- //
export function PhotosEditor({
  ym,
  monthName,
  meta,
  photos,
  onClose
}: {
  ym: string;
  monthName: string;
  meta: MonthMeta | null;
  photos: Photos | null;
  onClose: () => void;
}) {
  const sd = meta?.side;
  const [d, setD] = useState<Side>(
    // (a month saved by an older board may be missing some of these)
    sd
      ? {
          mode: sd.mode === 'art' ? 'art' : 'photos',
          pick: sd.pick === 'chosen' ? 'chosen' : 'random',
          ids: [...(sd.ids || [])]
        }
      : { mode: photos?.cfg?.frame ? 'photos' : 'art', pick: 'random', ids: [] }
  );
  const [err, setErr] = useState('');
  const key = d.mode === 'art' ? 'art' : d.pick;
  const list = (photos?.photos || []).filter(p => p && p.id);
  async function save() {
    const side = d.pick === 'chosen' && !d.ids.length ? { ...d, pick: 'random' as const } : d;
    try {
      await post('api/meta', { ym, side });
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  return (
    <Sheet title="Photos" onClose={onClose} id="photosSheet">
      <div className="sublbl">Beside the month name in {monthName}</div>
      <Segs
        value={key}
        onChange={v => setD(v === 'art' ? { ...d, mode: 'art' } : { ...d, mode: 'photos', pick: v as Side['pick'] })}
        options={[
          ['random', 'Random photos'],
          ['chosen', 'Photos I pick'],
          ['art', 'Room to draw']
        ]}
        label="Beside the month name"
      />
      {!list.length && <div className="sublbl">No photos yet: add the family album in the admin console.</div>}
      {key === 'chosen' && (
        <div className="ppick">
          {list.map(p => {
            const n = d.ids.indexOf(p.id);
            return (
              <button
                type="button"
                key={p.id}
                className={n >= 0 ? 'on' : ''}
                aria-pressed={n >= 0}
                onClick={() =>
                  setD({
                    ...d,
                    ids: n >= 0 ? d.ids.filter(x => x !== p.id) : d.ids.length < 8 ? [...d.ids, p.id] : d.ids
                  })
                }
              >
                <img alt="" loading="lazy" src={photoSrc(p)} />
                {n >= 0 && <b>{n + 1}</b>}
              </button>
            );
          })}
        </div>
      )}
      <div className="sublbl">
        The overnight slideshow: <a href="settings">⚙️ Settings</a>
      </div>
      <div className="err">{err}</div>
      <div className="actions">
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn kind="go" onClick={save}>
          Save
        </Btn>
      </div>
    </Sheet>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
