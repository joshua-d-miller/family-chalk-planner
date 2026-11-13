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
     above the pages; a ✏️ Draw button can sit beside the ☰ too (the
     screen's choice). Drawing, the tools pop over just above the buttons
     (hide them to draw underneath), and ✏️ Done takes the ☰'s corner.
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
                        colby     tools popping over beside it, on the right or
                        claude    the left, for a screen that picked them
                                  instead of the cork.
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
  onDraw,
  drawLabel = 'Draw',
  tools,
  add,
  children
}: {
  drawing: boolean;
  onDraw?: () => void; // ✏️ Draw / Decorate, and Done
  drawLabel?: string; // what ✏️ says on this screen (Draw, or Decorate on a family screen)
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
      <SideStrip side={side} drawing={drawing} onDraw={onDraw} drawLabel={drawLabel} tools={tools} add={add}>
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
// the buttons and the drawer keep their size and place. Not drawing: the ☰  //
// (and ✏️ beside it, if this screen wants it), and the drawer with + Add    //
// event and the board's buttons over the pages. Drawing: the tools pop over //
// just above the buttons, 🎨 hides or shows them (to draw underneath), and  //
// ✏️ Done sits in the ☰'s corner. The board never moves for any of it.     //
function SideStrip({
  side,
  drawing,
  onDraw,
  drawLabel,
  tools,
  add,
  children
}: {
  side: 'left' | 'right';
  drawing: boolean;
  onDraw?: () => void;
  drawLabel: string;
  tools?: ReactNode;
  add?: ReactNode;
  children: ReactNode;
}) {
  const { who, here, drawBtn } = useShell();
  const [open, setOpen] = useState(false); // the drawer
  const [shown, setShown] = useState(true); // the drawing tools' pop-over
  const z = useBarZoom();
  useEffect(() => {
    if (drawing) {
      setOpen(false);
      setShown(true); // every time drawing starts, the tools are out
    }
  }, [drawing]);
  // the buttons, the ☰ (or ✏️ Done) always in the corner
  return createPortal(
    <>
      <div className={'fabwrap ' + side} style={{ zoom: z }}>
        {drawing && shown && (
          <div className="cork drawpop" id="drawPop" aria-label="Drawing tools">
            {tools}
          </div>
        )}
        <div className="fabrow">
          {drawing ? (
            <>
              <button
                type="button"
                className={'menufab inrow small' + (shown ? ' on' : '')}
                id="toolsFab"
                aria-label={shown ? 'Hide the drawing tools' : 'Show the drawing tools'}
                aria-expanded={shown}
                onClick={() => setShown(v => !v)}
              >
                <span aria-hidden="true">🎨</span>
              </button>
              <button type="button" className="menufab inrow done" id="doneFab" onClick={onDraw}>
                <span aria-hidden="true">✏️</span> Done
              </button>
            </>
          ) : (
            <>
              {drawBtn && onDraw && (
                <button type="button" className="menufab inrow" id="drawFab" aria-label={drawLabel} onClick={onDraw}>
                  <span aria-hidden="true">✏️</span>
                </button>
              )}
              <MenuFab
                side={side}
                open={open}
                onClick={() => setOpen(true)}
                label="Menu and the calendar's tools"
                inRow
              />
            </>
          )}
        </div>
      </div>
      {open && !drawing && (
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
// how much of the bottom of the screen the ☰ button takes, in the cork's own pixels (the button, and
// the gap under and over it): the Notes column's list stops above it
export const FAB_BAND = 16 + 58 + 8;

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
