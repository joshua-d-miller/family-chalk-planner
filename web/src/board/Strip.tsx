/*
===============================================================================
 Family Chalk Planner | Screens | Board | Strip.tsx
===============================================================================
 Version:   0.17.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Updated:   2026-11-12

 Purpose:
     The cork under the board when it's being changed: on a family
     screen, the pages (☰ Menu, 📅 Calendar, the pinned ones) and the
     board's tools in a drawer; on a phone or tablet, just the tools.

     A screen that picked the ☰ button instead: no cork. The button sits
     in a bottom corner; its drawer has + Add event and the board's tools
     above the pages. Drawing, the drawer goes away and the drawing tools
     float down that side (no cork) until Done.
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

 0.17.0    2026-11-12   joshua    The ☰ button, its drawer and the drawing
                        colby     rail, on the right or the left, for a screen
                        claude    that picked them instead of the cork.
===============================================================================
*/

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Menu } from '../ui/Menu.tsx';
import { CorkNav, MenuFab, useBarZoom, useShell } from '../ui/Shell.tsx';

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
  const { kind, side } = useShell();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (drawing) setOpen(true);
  }, [drawing]);
  if (kind === 'cork' && side)
    return (
      <SideStrip side={side} drawing={drawing} tools={tools} add={add}>
        {children}
      </SideStrip>
    );
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
// ------------------------------- //
// | The ☰ button, on the board | //
// ------------------------------- //
// Put on the page itself (not in the board, which is scaled and moved), so  //
// the button, the drawer and the rail keep their size and place. Not        //
// drawing: the button, and its drawer with + Add event and the board's      //
// buttons over the pages. Drawing: ✏️ Done and the drawing tools float     //
// down that side (the board steps aside for them, only while drawing).     //
function SideStrip({
  side,
  drawing,
  tools,
  add,
  children
}: {
  side: 'left' | 'right';
  drawing: boolean;
  tools?: ReactNode;
  add?: ReactNode;
  children: ReactNode;
}) {
  const { who, here } = useShell();
  const [open, setOpen] = useState(false);
  const z = useBarZoom();
  useEffect(() => {
    if (drawing) setOpen(false);
  }, [drawing]);
  // the rail's width on the screen: the board leaves room for it, and the zoom buttons move over
  useEffect(() => {
    const c = document.documentElement;
    c.style.setProperty('--railw', drawing ? RAIL_W * z + 'px' : '0px');
    c.classList.toggle('rail-left', drawing && side === 'left');
    c.classList.toggle('rail-right', drawing && side === 'right');
    return () => {
      c.style.removeProperty('--railw');
      c.classList.remove('rail-left', 'rail-right');
    };
  }, [drawing, side, z]);
  if (drawing)
    return createPortal(
      <div className={'cork rail ' + side} aria-label="Drawing tools" style={{ zoom: z }}>
        {children}
        {tools}
      </div>,
      document.body
    );
  return createPortal(
    <>
      <MenuFab side={side} open={open} onClick={() => setOpen(true)} label="Menu and the calendar's tools" />
      {open && (
        <Menu
          who={who}
          here={here}
          side={side}
          toolsTitle="The calendar"
          tools={
            <>
              {add}
              {children}
            </>
          }
          onClose={() => setOpen(false)}
        />
      )}
    </>,
    document.body
  );
}
// the drawing rail's width in the cork's own pixels (the board leaves this much room beside it)
export const RAIL_W = 72;
// how much of the bottom of the screen the ☰ button takes, in the cork's own pixels (the button, and
// the gap under and over it): the Notes column's list stops above it
export const FAB_BAND = 16 + 58 + 8;

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
