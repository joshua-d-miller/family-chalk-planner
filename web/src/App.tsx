// Which page this is, and whether this screen may see it (else: sign in)
import { useEffect } from 'react';
import { paintSurface, surfaceOf } from './lib/surface.ts';
import { kidOf, useWho } from './lib/who.ts';
import { PAGES, pageHere } from './routes.ts';
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

// the slate behind every page, as sharp as the screen (2× or 3× on phones and 4K walls)
function useSlate() {
  useEffect(() => {
    try {
      document.body.style.backgroundImage = paintSurface(surfaceOf('slate'), '', Math.min(3, devicePixelRatio || 1));
    } catch {
      /* plain dark background */
    }
  }, []);
}

export function App() {
  useSlate();
  const here = pageHere();
  const who = useWho();
  const def = PAGES.find(p => p.id === here);
  const View = VIEWS[here];
  useEffect(() => {
    if (def) document.title = def.title;
  }, [def]);
  if (!View || !def)
    return (
      <div className="page empty">
        There’s no page here. <a href="./">Back to the board</a>
      </div>
    );
  if (!who.data) return null;
  const w = who.data;
  const go = (to: string) => (location.replace(new URL(to, document.baseURI).href), null);
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
  if (w.rank < def.need)
    return (
      <SignIn who={who.data} why={`Sign in to see the ${def.title.toLowerCase()}.`} onDone={() => location.reload()} />
    );
  return <View who={who.data} />;
}
