/*
===============================================================================
 Family Chalk Planner | Screens | Board | Strip.tsx
===============================================================================
 Version:   0.14.0
 Author:    Joshua D. Miller, Claude
 Updated:   2026-11-07

 Purpose:
     The cork under the board when it's being changed: on a family
     screen, the pages (☰ Menu, 📅 Calendar, the pinned ones) and the
     board's tools in a drawer; on a phone or tablet, just the tools.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    The new board on a tablet (next/edit):
                        claude    events, the month's title and border, the
                                  board style.

 0.14.0    2026-11-07   joshua    ☰ Menu, with its word.
                        claude

                                  The pages on the cork, and the tools in a
                                  drawer (✏️ Edit the calendar).
===============================================================================
*/

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { CorkNav, useShell } from '../ui/Shell.tsx';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------- //
// | The strip | //
// ------------- //
// On a family screen (or a computer) the cork starts like on every page: ☰  //
// Menu, Calendar and the pinned pages, then + Add event and ✏ Edit the      //
// calendar, which slides the board's tools out along the cork over the      //
// pages until ✕ Done. On a phone or tablet the pages are in the tab bar, so //
// the cork is just the tools.                                               //
export function Strip({
  drawing,
  tools,
  add,
  children
}: {
  drawing: boolean;
  tools?: ReactNode; // the drawing tools, while drawing
  add?: ReactNode; // + Add event
  children: ReactNode; // the board's own buttons
}) {
  const { kind } = useShell();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (drawing) setOpen(true);
  }, [drawing]);
  if (kind !== 'cork')
    return (
      <div className="cork">
        <span className="gap" />
        {tools}
        {children}
        {add && <span className="groove" aria-hidden="true" />}
        {add}
      </div>
    );
  const shown = open || drawing;
  // + Add event stays at the right end either way; the pages and the tools take turns beside it
  return (
    <div className={'cork' + (shown ? ' open' : '')}>
      <div className="corkarea">
        <div className="corknav" inert={shown}>
          <CorkNav />
          <span className="gap" />
          <button type="button" className="pill" id="editBtn" aria-expanded={shown} onClick={() => setOpen(true)}>
            <span className="ic" aria-hidden="true">
              ✏️
            </span>{' '}
            Edit the calendar
          </button>
        </div>
        <div className="drawer" inert={!shown} aria-label="The calendar's tools">
          {!drawing && (
            <button type="button" className="pill" id="doneBtn" onClick={() => setOpen(false)}>
              <span className="ic" aria-hidden="true">
                ✕
              </span>{' '}
              Done
            </button>
          )}
          {!drawing && <span className="groove" aria-hidden="true" />}
          {tools}
          {children}
        </div>
      </div>
      {add && <span className="groove" aria-hidden="true" />}
      {add}
    </div>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
