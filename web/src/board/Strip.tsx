// The strip under the board on a tablet: ☰ every page, the family's favorites, and the board's own
// tools (the month's title and border, the style, drawing, adding an event).
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useFavorites } from '../lib/favorites.ts';
import type { Who } from '../lib/who.ts';
import { PAGES } from '../routes.ts';
import { Menu } from '../ui/Menu.tsx';

export function Strip({
  who,
  tools,
  children
}: {
  who: Who | null;
  tools?: ReactNode; // the drawing tools, while drawing
  children: ReactNode; // the board's own buttons
}) {
  const [menu, setMenu] = useState(false);
  const fav = useFavorites();
  const favs = fav.items.map(id => PAGES.find(p => p.id === id)).filter(p => p && (who?.rank || 0) >= p.need);
  return (
    <div className="cork">
      <button type="button" className="pill" id="menuBtn" aria-label="Menu" onClick={() => setMenu(true)}>
        ☰
      </button>
      {!tools &&
        favs.map(p => (
          <a key={p!.id} className="pill fav" href={p!.href} aria-label={p!.title} title={p!.title}>
            <span aria-hidden="true">{p!.icon}</span>
          </a>
        ))}
      <span className="gap" />
      {tools}
      {children}
      {menu && <Menu who={who} here="edit" onClose={() => setMenu(false)} />}
    </div>
  );
}
