/*
===============================================================================
 Family Chalk Planner | Screens | UI | Menu.tsx
===============================================================================
 Version:   0.14.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-07
 Updated:   2026-11-07

 Purpose:
     The ☰ menu: every page, what this screen may open; ☆ keeps one on the
     strip (up to 4).

 Used by:
     web/src/board/Strip.tsx
     web/src/ui/Page.tsx
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    The new screens (React + TypeScript): meal
                        colby     plan, reminders, timers, pantry, jars and
                        claude    chores.

 0.14.0    2026-11-07   joshua    One Calendar entry instead of The board
                        claude    and Edit the board.

                                  📌 pins, and More as a sheet from the bottom.
===============================================================================
*/

import { post } from '../lib/api.ts';
import { MAX_FAVORITES, useFavorites } from '../lib/favorites.ts';
import type { Who } from '../lib/who.ts';
import { PAGES, homeHref, isHome } from '../routes.ts';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------- //
// | The ☰ menu | //
// -------------- //
// Every page this screen may open, in groups; pins up to 3 to the bar.      //
// Signed in: who, and Sign out. `up`: a sheet from the bottom (More, on a   //
// phone or tablet) instead of a panel from the left.                        //
const GROUPS: [string, string][] = [
  ['pages', 'Pages'],
  ['account', 'Account']
];

export function Menu({
  who,
  here,
  up = false,
  onClose
}: {
  who: Who | null;
  here: string;
  up?: boolean;
  onClose: () => void;
}) {
  const fav = useFavorites();
  const rank = who?.rank || 0;
  const admin = who?.user?.role === 'admin';
  const mayOpen = (need: number, id: string) => (id === 'admin' ? admin : rank >= need);
  const onBoard = isHome(here, who);
  // pinned for whom: this screen when nobody is signed in on it, else the person
  const forScreen = !who?.user;
  return (
    <>
      <div className="menuScrim" onClick={onClose} />
      <nav
        className={'menu' + (up ? ' up' : '')}
        aria-label="Menu"
        id="menuPanel"
        onClick={e => (e.target as Element).closest('a') && onClose()}
      >
        {/* the Calendar: the board this screen uses (to change it if it may, else to look at it) */}
        <a
          className={'item board' + (onBoard ? ' here' : '')}
          href={homeHref(who)}
          aria-current={onBoard ? 'page' : undefined}
        >
          <span className="ic" aria-hidden="true">
            📅
          </span>
          <span className="lbl">Calendar</span>
        </a>
        {GROUPS.map(([g, title]) => {
          const items = PAGES.filter(p => p.group === g && mayOpen(p.need, p.id));
          if (!items.length) return null;
          return (
            <section key={g}>
              <h4>{title}</h4>
              {items.map(p => {
                const on = fav.items.includes(p.id);
                return (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center' }}>
                    <a
                      className={'item' + (p.id === here ? ' here' : '')}
                      href={p.href}
                      aria-current={p.id === here ? 'page' : undefined}
                    >
                      <span className="ic" aria-hidden="true">
                        {p.icon}
                      </span>
                      <span className="lbl">{p.title}</span>
                    </a>
                    {fav.canSave && p.group === 'pages' && (
                      <button
                        type="button"
                        className={'pin' + (on ? ' on' : '')}
                        aria-pressed={on}
                        aria-label={on ? `Unpin ${p.title}` : `Pin ${p.title}`}
                        title={
                          on
                            ? forScreen
                              ? 'Pinned to this screen'
                              : 'Pinned for you'
                            : fav.items.length >= MAX_FAVORITES
                              ? `Pin (up to ${MAX_FAVORITES}: the oldest comes off)`
                              : forScreen
                                ? 'Pin to this screen'
                                : 'Pin for you'
                        }
                        onClick={() => fav.toggle(p.id)}
                      >
                        📌
                      </button>
                    )}
                  </div>
                );
              })}
            </section>
          );
        })}
        <div className="who">
          {who?.user ? (
            <>
              Signed in as {who.user.name}.{' '}
              <button
                type="button"
                className="item"
                style={{ display: 'inline', width: 'auto', minHeight: 0, padding: 0, color: 'var(--pink)' }}
                onClick={() => post('api/account/logout').then(() => location.reload())}
              >
                Sign out
              </button>
            </>
          ) : who?.device ? (
            <>This screen: {who.device.name}</>
          ) : null}
        </div>
      </nav>
    </>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
