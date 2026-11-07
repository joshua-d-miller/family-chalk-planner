// Which page this is, and whether this screen may see it (else: sign in)
import { useEffect } from 'react';
import { paintSurface, surfaceOf } from './lib/surface.ts';
import { useWho } from './lib/who.ts';
import { PAGES, pageHere } from './routes.ts';
import { Chores } from './pages/Chores.tsx';
import { Jars } from './pages/Jars.tsx';
import { Meals } from './pages/Meals.tsx';
import { Pantry } from './pages/Pantry.tsx';
import { Reminders } from './pages/Reminders.tsx';
import { Timers } from './pages/Timers.tsx';
import { SignIn } from './ui/SignIn.tsx';
import type { Who } from './lib/who.ts';

const VIEWS: Record<string, (p: { who: Who | null }) => React.JSX.Element> = {
  chores: Chores,
  meals: Meals,
  reminders: Reminders,
  timers: Timers,
  pantry: Pantry,
  jars: Jars
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
  if (who.data.rank < def.need)
    return (
      <SignIn who={who.data} why={`Sign in to see the ${def.title.toLowerCase()}.`} onDone={() => location.reload()} />
    );
  return <View who={who.data} />;
}
