/*
===============================================================================
 Family Chalk Planner | Screens | UI | Menu.tsx
===============================================================================
 Version:   1.3.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-07
 Updated:   2026-11-28

 Purpose:
     The ☰ menu, only for getting places: every page this screen may open
     as a big tile (a long press pins one to the bar, up to 3). As the
     drawer of the ☰ button it comes from that side, with the calendar's
     tools as a row of chips at the top. At the bottom, 🖥️ This screen…
     (its menu, look and the rest, in ⚙️ Settings), ↻ Reload, and who's
     signed in.

 Used by:
     web/src/board/Strip.tsx
     web/src/ui/Page.tsx
     web/src/ui/Shell.tsx
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

 0.17.0    2026-11-12   joshua    From the right or the left (the ☰ button's
                        colby     drawer), with the calendar's tools at the
                        claude    top; "This screen's menu" at the bottom.

 1.1.0    2026-11-17   joshua    A ✕ at the top right to close it (a tap
                        claude    outside still closes it too).
                                  🎨 Look of cards and menus, at the bottom.

 1.1.1    2026-11-18   joshua    Reload the board, now that there's no pull-
                        claude    to-refresh.

 1.2.0    2026-11-21   joshua    Tiles: the pages as big tiles (a long press
                        claude    pins one), the calendar's tools as chips,
                                  and 🖥️ This screen… and ↻ Reload at the
                                  bottom. This screen's menu and its look
                                  moved to ⚙️ Settings → This screen.

 1.3.0    2026-11-28   joshua    📷 Albums only with more than one album.
                        claude
===============================================================================
*/

import { useEffect, useRef, useState } from 'react';
import type { PointerEvent, ReactNode } from 'react';
import { post } from '../lib/api.ts';
import { MAX_FAVORITES, useFavorites } from '../lib/favorites.ts';
import { RANK } from '../lib/who.ts';
import type { Who } from '../lib/who.ts';
import { CloseX } from './Sheet.tsx';
import { openSettings, showSettings } from '../pages/Settings.tsx';
import { PAGES, homeHref, isHome } from '../routes.ts';
import { hidden, useAlbums } from '../lib/albums.ts';
import { useShell } from './Shell.tsx';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------- //
// | The ☰ menu | //
// -------------- //
// Only for getting places. At the top, the calendar's tools as a row of    //
// chips (`tools`: the ☰ button's drawer, on the calendar); then every page //
// this screen may open as a big tile; at the bottom 🖥️ This screen… (its   //
// menu, its look and the rest: ⚙️ Settings → This screen), ↻ Reload, and  //
// who's signed in. `up`: a sheet from the bottom (More, on a phone or      //
// tablet) instead of a panel from the side.                                //
const LONG_PRESS = 550; // ms: a long press on a tile pins it (or takes it off)

export function Menu({
  who,
  here,
  up = false,
  side = 'left',
  tools,
  toolsTitle,
  onClose
}: {
  who: Who | null;
  here: string;
  up?: boolean;
  side?: 'left' | 'right';
  tools?: ReactNode;
  toolsTitle?: string;
  onClose: () => void;
}) {
  const shell = useShell();
  const fav = useFavorites();
  const rank = who?.rank || 0;
  const admin = who?.user?.role === 'admin';
  const mayOpen = (need: number, id: string) => (id === 'admin' ? admin : rank >= need);
  const albums = useAlbums();
  const onBoard = isHome(here, who);
  // pinned for whom: this screen when nobody is signed in on it, else the person
  const forScreen = !who?.user;
  // the tiles: 📅 Calendar first, then the pages, then Settings and the admin console
  const tiles = [
    { id: 'calendar', title: 'Calendar', icon: '📅', href: homeHref(who), here: onBoard, pin: false },
    ...PAGES.filter(p => p.group !== 'board' && mayOpen(p.need, p.id) && !hidden(p.id, albums)).map(p => ({
      id: p.id,
      title: p.title,
      icon: p.icon,
      href: p.href,
      here: p.id === here,
      pin: fav.canSave && p.group === 'pages'
    }))
  ];
  // ------------------------- //
  // | A long press: 📌 pin | //
  // ------------------------- //
  // (a press that moves is a scroll, not a press; the tap after a long press doesn't open the page)
  const press = useRef<{ t: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  const pinned = useRef(false);
  const [note, setNote] = useState('');
  const pinNote = (id: string, title: string) => {
    const on = !fav.items.includes(id);
    const bumped = on && fav.items.length >= MAX_FAVORITES;
    fav.toggle(id);
    setNote(
      on
        ? `📌 ${title} is pinned ${forScreen ? 'to this screen' : 'for you'}${bumped ? ' (the oldest came off)' : ''}`
        : `${title} is no longer pinned`
    );
  };
  const startPress = (id: string, title: string) => (e: PointerEvent) => {
    pinned.current = false;
    const x = e.clientX;
    const y = e.clientY;
    press.current = {
      x,
      y,
      t: setTimeout(() => {
        pinned.current = true;
        press.current = null;
        pinNote(id, title);
      }, LONG_PRESS)
    };
  };
  const endPress = () => {
    if (press.current) clearTimeout(press.current.t);
    press.current = null;
  };
  const movePress = (e: PointerEvent) => {
    const p0 = press.current;
    if (p0 && Math.hypot(e.clientX - p0.x, e.clientY - p0.y) > 12) endPress();
  };
  useEffect(() => endPress, []);
  return (
    <>
      <div className="menuScrim" onClick={onClose} />
      <nav
        className={'menu tiled' + (up ? ' up' : side === 'right' ? ' right' : '')}
        aria-label="Menu"
        id="menuPanel"
        // (a press in the menu is the menu's: the board under it doesn't see it, nor take the pointer away)
        onPointerDown={e => e.stopPropagation()}
      >
        <CloseX onClose={onClose} label="Close the menu" />
        {tools && (
          <section
            className="mtools"
            aria-label={toolsTitle}
            onClick={e => (e.target as Element).closest('button') && onClose()}
          >
            {toolsTitle && <h4>{toolsTitle}</h4>}
            <div className="chips">{tools}</div>
          </section>
        )}
        <section aria-label="Go to">
          <h4>Go to</h4>
          <div className="tiles">
            {tiles.map(t => {
              const on = fav.items.includes(t.id);
              return (
                <a
                  key={t.id}
                  className={'tile' + (t.here ? ' here' : '') + (t.id === 'calendar' ? ' board' : '')}
                  href={t.href}
                  id={'tile-' + t.id}
                  aria-current={t.here ? 'page' : undefined}
                  title={t.pin ? `Press and hold to ${on ? 'unpin' : 'pin'} ${t.title}` : undefined}
                  onPointerDown={t.pin ? startPress(t.id, t.title) : undefined}
                  onPointerUp={t.pin ? endPress : undefined}
                  onPointerCancel={t.pin ? endPress : undefined}
                  onPointerMove={t.pin ? movePress : undefined}
                  onContextMenu={t.pin ? e => e.preventDefault() : undefined}
                  onClick={e => {
                    if (pinned.current) {
                      e.preventDefault(); // (that was a long press: it pinned)
                      pinned.current = false;
                      return;
                    }
                    // ⚙️ Settings: a card over the board on a wall or family screen and a computer
                    if (t.id === 'settings' && shell.kind === 'cork') {
                      e.preventDefault();
                      onClose();
                      openSettings();
                      return;
                    }
                    onClose();
                  }}
                >
                  <span className="ic" aria-hidden="true">
                    {t.icon}
                  </span>
                  <span className="lbl">{t.title}</span>
                  {t.pin && on && (
                    <span className="pinned" aria-label={forScreen ? 'Pinned to this screen' : 'Pinned for you'}>
                      📌
                    </span>
                  )}
                </a>
              );
            })}
          </div>
          {fav.canSave && (
            <p className="mnote" aria-live="polite">
              {note ||
                `Press and hold a page to pin it to ${shell.kind === 'tabs' ? 'the tab bar' : 'the bar'} (up to ${MAX_FAVORITES}).`}
            </p>
          )}
        </section>
        <div className="mfoot">
          <div className="mrow">
            {/* this screen's menu, look and the rest: ⚙️ Settings → This screen (a family screen too) */}
            {rank >= RANK.family && (
              <button
                type="button"
                className="item"
                id="thisScreenBtn"
                onClick={() => {
                  onClose();
                  showSettings('screen');
                }}
              >
                <span className="ic" aria-hidden="true">
                  🖥️
                </span>
                <span className="lbl">This screen…</span>
              </button>
            )}
            {/* reload the board: there's no pull-to-refresh any more (it reloaded wall screens by accident) */}
            <button type="button" className="item reload" id="reloadBtn" onClick={() => location.reload()}>
              <span className="ic" aria-hidden="true">
                ↻
              </span>
              <span className="lbl">Reload</span>
            </button>
          </div>
          <div className="who">
            {who?.ha?.person ? (
              <>Signed in to Home Assistant as {who.ha.person.name}.</>
            ) : who?.user ? (
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
        </div>
      </nav>
    </>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
