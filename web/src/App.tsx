/*
===============================================================================
 Family Chalk Planner | Screens | App.tsx
===============================================================================
 Version:   0.15.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-07
 Updated:   2026-11-08

 Purpose:
     Which page this is, and whether this screen may see it (else: sign
     in)

 How it fits:
     Every address the board serves to the screens (/, /edit, /chores,
     /meals...) loads the same app; this picks the page from the address
     and checks who is looking first. An unpaired screen gets its pairing
     code; a family screen goes to /edit; a kid's tablet to their chores;
     someone who may not see a page is asked to sign in.

 Used by:
     web/src/main.tsx
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    The new screens (React + TypeScript): meal
                        colby     plan, reminders, timers, pantry, jars and
                        claude    chores.

                                  Settings (new screen), and an emoji font
                                  Chrome-based tablets can show.

                                  The board in React (wall view, next/board):
                                  month, events, art, notes column; sharp at
                                  4K.

                                  The new board on a tablet (next/edit):
                                  events, the month's title and border, the
                                  board style.

                                  The new screens take over: /, /edit and
                                  /chores are the React board; the old one
                                  stays at /classic.

 0.14.0    2026-11-07   joshua    Pages switch in place, with the bar at the
                        claude    bottom around them.

 0.15.0    2026-11-08   joshua    A screen that can't open a page keeps its bar
                        claude    and gets a way back.
===============================================================================
*/

import { useEffect } from 'react';
import { paintSurface, surfaceOf } from './lib/surface.ts';
import { kidOf, useWho } from './lib/who.ts';
import { PAGES, homeHref } from './routes.ts';
import { navigate, useHere } from './lib/nav.ts';
import { Shell } from './ui/Shell.tsx';
import { Board } from './board/Board.tsx';
import { Chores } from './pages/Chores.tsx';
import { Jars } from './pages/Jars.tsx';
import { Meals } from './pages/Meals.tsx';
import { Pantry } from './pages/Pantry.tsx';
import { Reminders } from './pages/Reminders.tsx';
import { Settings } from './pages/Settings.tsx';
import { Timers } from './pages/Timers.tsx';
import { SignIn } from './ui/SignIn.tsx';
import { Pair } from './ui/Pair.tsx';
import type { Who } from './lib/who.ts';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------- //
// | The pages | //
// ------------- //
const VIEWS: Record<string, (p: { who: Who | null }) => React.JSX.Element> = {
  board: Board,
  edit: p => <Board {...p} edit />,
  chores: Chores,
  meals: Meals,
  reminders: Reminders,
  timers: Timers,
  pantry: Pantry,
  jars: Jars,
  settings: Settings
};

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------------- //
// | The slate behind every page | //
// ------------------------------- //
// The slate behind every page, as sharp as the screen (2× or 3× on phones   //
// and 4K walls)                                                             //
function useSlate() {
  useEffect(() => {
    try {
      document.body.style.backgroundImage = paintSurface(surfaceOf('slate'), '', Math.min(3, devicePixelRatio || 1));
    } catch {
      /* plain dark background */
    }
  }, []);
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------------------------- //
// | Which page, and may this screen see it? | //
// ------------------------------------------- //
export function App() {
  useSlate();
  const here = useHere();
  const who = useWho();
  const def = PAGES.find(p => p.id === here);
  const View = VIEWS[here];
  useEffect(() => {
    if (def) document.title = def.title;
  }, [def]);
  if (!View || !def)
    return (
      <div className="page empty">
        There’s no page here. <a href="./">Back to the calendar</a>
      </div>
    );
  if (!who.data) return null;
  const w = who.data;
  const go = (to: string) => {
    queueMicrotask(() => navigate(to, { replace: true }));
    return null;
  };
  if (here === 'board') {
    // nobody yet: the admin console sets the board up; an unpaired screen shows its pairing code
    if (!w.rank && w.firstRun) return go('admin');
    if (!w.rank || (new URLSearchParams(location.search).has('pair') && !w.device)) return <Pair who={w} />;
    if (w.device?.role === 'family' && !w.user) return go('edit'); // a family screen edits right on the board
    if (kidOf(w)) return go('chores'); // a kid's tablet opens on their chores
  }
  if (!w.rank && w.firstRun) return go('admin');
  if (here === 'edit' && w.rank < def.need)
    return (
      <SignIn
        who={w}
        why={w.device ? 'This screen is paired to show the board only. Sign in to edit.' : undefined}
        onDone={() => location.reload()}
      />
    );
  if (w.rank < def.need) {
    const why = `Sign in to see the ${def.title.toLowerCase()}.`;
    if (!w.rank) return <SignIn who={w} why={why} onDone={() => location.reload()} />;
    // a paired screen (a family screen, the wall) or a kid: its own bar stays, with a way back
    return (
      <Shell who={w} here={here}>
        <SignIn who={w} why={why} onDone={() => location.reload()} back={homeHref(w)} />
      </Shell>
    );
  }
  return (
    <Shell who={w} here={here}>
      <View key={here} who={w} />
    </Shell>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
