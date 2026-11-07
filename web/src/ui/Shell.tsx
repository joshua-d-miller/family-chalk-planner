/*
===============================================================================
 Family Chalk Planner | Screens | UI | Shell.tsx
===============================================================================
 Version:   0.14.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-07
 Updated:   2026-11-07

 Purpose:
     The bar that stays at the bottom while the pages change. A family
     touch screen (and a computer) gets the cork: ☰ Menu, 📅 Calendar and
     the pages pinned to it, then the tools of the page it's on. A phone
     or tablet gets a tab bar like its own apps (Liquid Glass on an iPhone
     or iPad, Material on Android). The wall gets neither.

 Used by:
     web/src/App.tsx
     web/src/board/Board.tsx
     web/src/board/Strip.tsx
     web/src/pages/Chores.tsx
     web/src/ui/Page.tsx
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.14.0    2026-11-07   joshua    New file.
                        claude
===============================================================================
*/

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useFavorites } from '../lib/favorites.ts';
import type { Who } from '../lib/who.ts';
import { PAGES, homeHref, isHome } from '../routes.ts';
import { Menu } from './Menu.tsx';
import './shell.css';

export type ShellKind = 'none' | 'cork' | 'tabs';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------------ //
// | Which bar this screen gets | //
// ------------------------------ //
// iPhones, iPads (which call themselves a Mac) and Android phones and       //
// tablets get the tab bar; a paired family screen always gets the cork.     //
export function osOf(): 'ios' | 'android' | 'other' {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  return 'other';
}
export function shellKind(who: Who | null): ShellKind {
  if (!who?.rank) return 'none';
  if (!who.user && who.device?.role === 'view') return 'none'; // the wall
  if (!who.user && who.device?.role === 'family') return 'cork';
  return osOf() === 'other' ? 'cork' : 'tabs';
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------------- //
// | What the pages need to know | //
// ------------------------------- //
// The kind of bar, where a page puts its tools on the cork, and how much of //
// the bottom of the screen the tab bar takes.                               //
interface ShellState {
  kind: ShellKind;
  who: Who | null;
  here: string;
  slot: HTMLElement | null;
  navH: number;
}
const Ctx = createContext<ShellState>({ kind: 'none', who: null, here: 'board', slot: null, navH: 0 });
export const useShell = () => useContext(Ctx);

export function Shell({ who, here, children }: { who: Who | null; here: string; children: ReactNode }) {
  const kind = shellKind(who);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [navH, setNavH] = useState(0);
  const onBoard = here === 'board' || here === 'edit';
  useEffect(() => {
    const c = document.documentElement.classList;
    c.toggle('shell-cork', kind === 'cork');
    c.toggle('shell-tabs', kind === 'tabs');
    c.toggle('os-ios', osOf() === 'ios');
    c.toggle('os-android', osOf() === 'android');
  }, [kind]);
  useEffect(() => {
    if (kind !== 'tabs') setNavH(0);
  }, [kind]);
  return (
    <Ctx.Provider value={{ kind, who, here, slot: kind === 'cork' && !onBoard ? slot : null, navH }}>
      {children}
      {kind === 'cork' && !onBoard && <CorkBar onSlot={setSlot} />}
      {kind === 'tabs' && <TabBar onHeight={setNavH} />}
    </Ctx.Provider>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------------------- //
// | The cork's left end | //
// ----------------------- //
// Menu, Calendar, the pinned pages (with their names), and the page this    //
// screen is on when it isn't one of those. The board's own cork starts with //
// this too, so it looks the same on every page.                             //
export function CorkNav({ compact = false }: { compact?: boolean }) {
  const { who, here } = useShell();
  const [menu, setMenu] = useState(false);
  const pins = usePins();
  const home = isHome(here, who);
  const cur = PAGES.find(p => p.id === here);
  const pinned = pins.some(p => p.id === here);
  return (
    <>
      <button type="button" className="pill" id="menuBtn" aria-expanded={menu} onClick={() => setMenu(true)}>
        <span className="ic" aria-hidden="true">
          ☰
        </span>{' '}
        Menu
      </button>
      <a className={'pill nav' + (home ? ' here' : '')} href={homeHref(who)} aria-current={home ? 'page' : undefined}>
        <span className="ic" aria-hidden="true">
          📅
        </span>{' '}
        Calendar
      </a>
      {!compact &&
        pins.map(p => (
          <a
            key={p.id}
            className={'pill nav pinned' + (p.id === here ? ' here' : '')}
            href={p.href}
            aria-current={p.id === here ? 'page' : undefined}
          >
            <span className="ic" aria-hidden="true">
              {p.icon}
            </span>{' '}
            {p.title}
          </a>
        ))}
      {!home && !pinned && cur && (
        <a className="pill nav here" href={cur.href} aria-current="page">
          <span className="ic" aria-hidden="true">
            {cur.icon}
          </span>{' '}
          {cur.title}
        </a>
      )}
      {menu && <Menu who={who} here={here} onClose={() => setMenu(false)} />}
    </>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------------- //
// | The pinned pages | //
// -------------------- //
// the pages pinned to this screen (or person) that it may open, up to 3     //
export function usePins() {
  const { who } = useShell();
  const fav = useFavorites();
  const rank = who?.rank || 0;
  return fav.items
    .map(id => PAGES.find(p => p.id === id))
    .filter((p): p is (typeof PAGES)[number] => !!p && p.group === 'pages' && rank >= p.need)
    .slice(0, 3);
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------------------- //
// | The cork, on the pages | //
// -------------------------- //
// The same size as the board's cork on this screen, so going from the board //
// to a page and back, only the middle changes. The page's own tools go in   //
// at the right end.                                                         //
const BOARD_W = 1252;
const BOARD_H = 642 + 50;
function corkZoom() {
  return Math.max(0.6, Math.min(innerWidth / BOARD_W, innerHeight / BOARD_H));
}
function CorkBar({ onSlot }: { onSlot: (el: HTMLElement | null) => void }) {
  const [z, setZ] = useState(corkZoom);
  useEffect(() => {
    const on = () => setZ(corkZoom());
    addEventListener('resize', on);
    return () => removeEventListener('resize', on);
  }, []);
  useEffect(() => {
    document.documentElement.style.setProperty('--corkh', 50 * z + 'px');
  }, [z]);
  return (
    <nav className="cork corkbar" aria-label="Pages" style={{ zoom: z }}>
      <CorkNav />
      <span className="gap" />
      <span className="groove" aria-hidden="true" />
      <div className="corktools" ref={onSlot} />
    </nav>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------------- //
// | The tab bar | //
// --------------- //
// Calendar, the pinned pages and More (every other page, pinning, the admin //
// console and signing out), styled like the phone's own apps.               //
function TabBar({ onHeight }: { onHeight: (h: number) => void }) {
  const { who, here } = useShell();
  const pins = usePins();
  const [more, setMore] = useState(false);
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      onHeight(Math.max(0, innerHeight - r.top));
      document.documentElement.style.setProperty('--navh', Math.max(0, innerHeight - r.top) + 'px');
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      removeEventListener('resize', measure);
    };
  }, [onHeight]);
  const home = isHome(here, who);
  const onMore = !home && !pins.some(p => p.id === here);
  const tab = (key: string, href: string, icon: string, label: string, on: boolean) => (
    <a key={key} className={'tab' + (on ? ' on' : '')} href={href} aria-current={on ? 'page' : undefined}>
      <span className="ti" aria-hidden="true">
        {icon}
      </span>
      <span className="tl">{label}</span>
    </a>
  );
  return (
    <>
      <nav className="tabbar" id="tabbar" aria-label="Pages" ref={ref}>
        {tab('home', homeHref(who), '📅', 'Calendar', home)}
        {pins.map(p => tab(p.id, p.href, p.icon, shortTitle(p.title), p.id === here))}
        <button
          type="button"
          className={'tab' + (onMore || more ? ' on' : '')}
          id="moreBtn"
          aria-expanded={more}
          onClick={() => setMore(true)}
        >
          <span className="ti more" aria-hidden="true">
            •••
          </span>
          <span className="tl">More</span>
        </button>
      </nav>
      {more && <Menu who={who} here={here} up onClose={() => setMore(false)} />}
    </>
  );
}
const shortTitle = (t: string) => ({ 'Meal plan': 'Meals', 'Reward jars': 'Jars' })[t] || t;

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
