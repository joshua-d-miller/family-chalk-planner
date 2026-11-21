/*
===============================================================================
 Family Chalk Planner | Screens | Helpers | wallScreen.ts
===============================================================================
 Version:   1.2.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-21
 Updated:   2026-11-21

 Purpose:
     What a screen on the wall needs from the browser (a paired screen with
     nobody signed in: the wall, a family screen, a kid's tablet):
       - no zooming the page: a pinch or a double tap doesn't zoom it (a
         tablet still pinches to zoom in and draw: that's the board's own);
       - staying awake: the screen doesn't dim or sleep while the board
         shows (the browser's Wake Lock), asked again each time the screen
         comes back on.

 How it fits:
     The Shell calls useWallScreen for a paired screen with nobody signed
     in. Kiosk apps (FreeKiosk, Fully Kiosk) and Chrome's kiosk mode have
     their own keep-awake settings too; docs/kiosk.md says which to use.

 Used by:
     web/src/ui/Shell.tsx
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.2.0    2026-11-21   joshua    New file.
                        claude
===============================================================================
*/

import { useEffect } from 'react';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------------- //
// | No zooming the page | //
// ---------------------- //
// The viewport says "don't scale", the page's touch-action takes pinches   //
// and double taps away from the browser, and Safari's own gesture events   //
// are turned down.                                                          //
const VIEW = 'width=device-width, initial-scale=1, viewport-fit=cover';
function lockZoom(on: boolean) {
  const meta = document.querySelector<HTMLMetaElement>('meta[name=viewport]');
  if (meta) meta.content = on ? VIEW + ', maximum-scale=1, user-scalable=no' : VIEW;
  document.documentElement.classList.toggle('nozoom', on);
  const stop = (e: Event) => e.preventDefault();
  if (!on) return () => {};
  document.addEventListener('gesturestart', stop);
  return () => document.removeEventListener('gesturestart', stop);
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------ //
// | Staying awake | //
// ------------------ //
// A wake lock while the page shows; the browser lets it go when the page  //
// is hidden (the screen turned off), so it's asked for again when it's     //
// back. A browser without one (or that says no) is left to its own        //
// setting.                                                                  //
interface WakeLock {
  release: () => Promise<void>;
}
function keepAwake() {
  let lock: WakeLock | null = null;
  let gone = false;
  const ask = async () => {
    if (gone || document.visibilityState !== 'visible' || lock) return;
    try {
      const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLock> } }).wakeLock;
      if (!wl) return;
      lock = await wl.request('screen');
      (lock as unknown as EventTarget).addEventListener?.('release', () => (lock = null));
    } catch {
      lock = null; // (not allowed here: the kiosk app's own setting keeps it awake)
    }
  };
  const seen = () => void ask();
  void ask();
  document.addEventListener('visibilitychange', seen);
  return () => {
    gone = true;
    document.removeEventListener('visibilitychange', seen);
    void lock?.release().catch(() => {});
  };
}

export function useWallScreen(on: boolean) {
  useEffect(() => {
    if (!on) return;
    const a = lockZoom(true);
    const b = keepAwake();
    return () => {
      a();
      b();
      lockZoom(false);
    };
  }, [on]);
}
