// The frame of every page: the ☰ menu, the page's title and its buttons
import { useState } from 'react';
import type { ReactNode } from 'react';
import type { Who } from '../lib/who.ts';
import { Menu } from './Menu.tsx';

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
