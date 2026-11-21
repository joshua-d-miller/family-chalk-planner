/*
===============================================================================
 Family Chalk Planner | Screens | UI | Page.tsx
===============================================================================
 Version:   1.2.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Updated:   2026-11-21

 Purpose:
     The frame of every page: the ☰ menu, the page's title and its buttons
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    The new screens (React + TypeScript): meal
                        colby     plan, reminders, timers, pantry, jars and
                        claude    chores.

 0.14.0    2026-11-07   joshua    No ☰ at the top: its tools go on the cork,
                        claude    or stay at the top on a phone.

 1.2.0    2026-11-21   joshua    A ✕ at the top right, like every card, back
                        colby     to the calendar (Colby Way's back button
                        claude    on Settings, for every page).
===============================================================================
*/

import { useState } from 'react';
import type { ReactNode } from 'react';
import type { Who } from '../lib/who.ts';
import { createPortal } from 'react-dom';
import { Menu } from './Menu.tsx';
import { CloseX } from './Sheet.tsx';
import { navigate } from '../lib/nav.ts';
import { homeHref, isHome } from '../routes.ts';
import { useShell } from './Shell.tsx';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------- //
// | A page | //
// ---------- //
// Its title, the ☰ menu button, its own tools, and the page itself.         //
export function Page({
  id,
  title,
  who,
  tools,
  onClose,
  children
}: {
  id: string;
  title: string;
  who: Who | null;
  tools?: ReactNode;
  onClose?: () => void; // where its ✕ goes (else back to the calendar)
  children: ReactNode;
}) {
  const [menu, setMenu] = useState(false);
  const shell = useShell();
  // a family screen: the page's tools go at the right end of the cork; a phone or tablet: top right,
  // with the pages in the tab bar; the wall (no bar): the ☰ menu up here
  const onCork = shell.kind === 'cork' && shell.slot;
  return (
    <div className="page" id={id}>
      <header className="phead">
        {shell.kind === 'none' && (
          <button
            type="button"
            className="btn round"
            aria-label="Menu"
            aria-expanded={menu}
            onClick={() => setMenu(true)}
            id="menuBtn"
          >
            ☰
          </button>
        )}
        <h2 className="chalk">{title}</h2>
        {tools && !onCork && <div className="tools">{tools}</div>}
        {/* a ✕ at the top right, like every card: back to the calendar (not on a kid's own Chores) */}
        {!isHome(id, who) && (
          <CloseX onClose={onClose || (() => navigate(homeHref(who)))} label="Back to the calendar" />
        )}
      </header>
      {tools && onCork && createPortal(tools, shell.slot!)}
      {children}
      {menu && <Menu who={who} here={id} onClose={() => setMenu(false)} />}
    </div>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
