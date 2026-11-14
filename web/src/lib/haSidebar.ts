/*
===============================================================================
 Family Chalk Planner | Screens | Lib | haSidebar.ts
===============================================================================
 Version:   1.0.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-14
 Updated:   2026-11-14

 Purpose:
     Inside Home Assistant (the app's panel), the board takes the whole
     width: Home Assistant's sidebar is hidden while the board is open
     (Home Assistant's own "Always hide the sidebar", which leaves its ☰
     button), and put back as it was when the board closes. The panel is
     on Home Assistant's own address, so the board can ask its page. For a
     wall screen with nothing of Home Assistant around it, pair a screen
     at the board's own address instead (port 3002).

 Used by:
     web/src/App.tsx
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.0.0     2026-11-14   joshua    New file.
                        claude
===============================================================================
*/

import { useEffect } from 'react';

type Dock = 'docked' | 'always_hidden' | 'auto';
const KEY = 'chalkHaSidebarWas'; // what it was before the board hid it (if the board closed without putting it back)

// Home Assistant's page around the board, if the board is in its panel
function homeAssistant(): { el: Element; store: Storage } | null {
  try {
    if (window.parent === window) return null;
    const el = window.parent.document.querySelector('home-assistant');
    return el ? { el, store: window.parent.localStorage } : null;
  } catch {
    return null; // another site's page: not Home Assistant's panel
  }
}
const dockNow = (s: Storage): Dock => {
  try {
    const v = JSON.parse(s.getItem('dockedSidebar') || '"docked"');
    return v === 'always_hidden' || v === 'auto' ? v : 'docked';
  } catch {
    return 'docked';
  }
};
const dock = (el: Element, d: Dock) =>
  el.dispatchEvent(new CustomEvent('hass-dock-sidebar', { detail: { dock: d }, bubbles: true, composed: true }));

export function useHaSidebarHidden(inside: boolean) {
  useEffect(() => {
    if (!inside) return;
    const ha = homeAssistant();
    if (!ha) return;
    let was = dockNow(ha.store);
    try {
      // hidden by the board last time and never put back: what it was before that
      const saved = ha.store.getItem(KEY) as Dock | null;
      if (was === 'always_hidden' && saved) was = saved;
      ha.store.setItem(KEY, was);
    } catch {
      /* fine */
    }
    if (was !== 'always_hidden') dock(ha.el, 'always_hidden');
    const restore = () => {
      if (was !== 'always_hidden' && dockNow(ha.store) === 'always_hidden') dock(ha.el, was);
      try {
        ha.store.removeItem(KEY);
      } catch {
        /* fine */
      }
    };
    window.addEventListener('pagehide', restore);
    return () => {
      window.removeEventListener('pagehide', restore);
      restore();
    };
  }, [inside]);
}
