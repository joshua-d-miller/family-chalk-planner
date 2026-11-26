/*
===============================================================================
 Family Chalk Planner | Screens | App.tsx
===============================================================================
 Version:   1.3.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-07
 Updated:   2026-11-26

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

                                  🗓️ Week, its own page (changes the week where
                                  the screen may).

 1.0.0     2026-11-14   joshua    Inside Home Assistant: its people go
                        claude    straight to the board, and its sidebar
                                  hides while the board is open.

 1.1.1    2026-11-18   joshua    A family screen opens the board to edit even
                        claude    when someone is also signed in on it (it
                                  showed the wall instead).

 1.3.0    2026-11-26   joshua    The pages besides the board are downloaded
                        claude    when first opened, not by every wall.
===============================================================================
*/

import { Suspense, lazy, useEffect } from 'react';
import type { ComponentType } from 'react';
import { paintSurface, surfaceOf } from './lib/surface.ts';
import { RANK, kidOf, useWho } from './lib/who.ts';
import { PAGES, homeHref } from './routes.ts';
import { navigate, useHere } from './lib/nav.ts';
import { useHaSidebarHidden } from './lib/haSidebar.ts';
import { Shell } from './ui/Shell.tsx';
import { Board } from './board/Board.tsx';
import { Settings } from './pages/Settings.tsx';
import { SignIn } from './ui/SignIn.tsx';
import { Pair } from './ui/Pair.tsx';
import type { Who } from './lib/who.ts';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------- //
// | The pages | //
// ------------- //
// The pages besides the board are downloaded on their own, so a wall (which //
// only ever shows the board) doesn't load them; a screen that can open them //
// fetches them as soon as it's up, so a page opens without a blank moment   //
type Page = ComponentType<{ who: Who | null }>;
const CODE: Record<string, () => Promise<Page>> = {
  chores: () => import('./pages/Chores.tsx').then(m => m.Chores),
  jars: () => import('./pages/Jars.tsx').then(m => m.Jars),
  meals: () => import('./pages/Meals.tsx').then(m => m.Meals),
  pantry: () => import('./pages/Pantry.tsx').then(m => m.Pantry),
  reminders: () => import('./pages/Reminders.tsx').then(m => m.Reminders),
  timers: () => import('./pages/Timers.tsx').then(m => m.Timers)
};
const ready: Record<string, Page> = {};
const fetchPage = (id: string) => CODE[id]().then(c => (ready[id] = c));
// once its code is here a page shows straight away (lazy() would still wait a moment, with no page and no cork)
const later = (id: string): Page => {
  const Waiting = lazy(() => fetchPage(id).then(c => ({ default: c })));
  return p => {
    const Shown = ready[id] || Waiting;
    return <Shown {...p} />;
  };
};
function usePagesAhead(w: Who | null) {
  const opens = !!w && (w.rank > RANK.view || !!kidOf(w)); // a view-only wall never opens them
  useEffect(() => {
    if (opens) for (const id of Object.keys(CODE)) fetchPage(id).catch(() => {}); // (tried again when opened)
  }, [opens]);
}
const VIEWS: Record<string, Page> = {
  board: Board,
  edit: p => <Board {...p} edit />,
  // the week: changes it where this screen may change the calendar
  week: p => <Board {...p} edit={(p.who?.rank || 0) >= RANK.family && !kidOf(p.who)} weekly />,
  chores: later('chores'),
  meals: later('meals'),
  reminders: later('reminders'),
  timers: later('timers'),
  pantry: later('pantry'),
  jars: later('jars'),
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
  useHaSidebarHidden(!!who.data?.ha?.inside); // inside Home Assistant: the board takes the whole width
  usePagesAhead(who.data);
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
    // a family screen edits right on the board, whether or not someone is also signed in on it
    if (w.device?.role === 'family') return go('edit');
    if (w.ha?.person && w.rank >= RANK.family) return go('edit'); // inside Home Assistant: its people edit
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
      <Suspense fallback={null}>
        <View key={here} who={w} />
      </Suspense>
    </Shell>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
