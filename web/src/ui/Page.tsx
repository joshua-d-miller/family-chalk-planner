/*
===============================================================================
 Family Chalk Planner | Screens | UI | Page.tsx
===============================================================================
 Version:   0.13.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Updated:   2026-11-07

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
===============================================================================
*/

import { useState } from 'react';
import type { ReactNode } from 'react';
import type { Who } from '../lib/who.ts';
import { Menu } from './Menu.tsx';

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
  children
}: {
  id: string;
  title: string;
  who: Who | null;
  tools?: ReactNode;
  children: ReactNode;
}) {
  const [menu, setMenu] = useState(false);
  return (
    <div className="page" id={id}>
      <header className="phead">
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
        <h2 className="chalk">{title}</h2>
        {tools && <div className="tools">{tools}</div>}
      </header>
      {children}
      {menu && <Menu who={who} here={id} onClose={() => setMenu(false)} />}
    </div>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
