/*
===============================================================================
 Family Chalk Planner | Screens | Helpers | live.ts
===============================================================================
 Version:   1.1.1
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-07
 Updated:   2026-11-18

 Purpose:
     Live updates: one connection to the board (/api/stream) for the whole
     page. A change anywhere arrives as an event ("chores", "meals"...),
     and whatever shows that list fetches it again.

 Used by:
     web/src/board/Alerts.tsx
     web/src/board/Board.tsx
     web/src/board/Notes.tsx
     web/src/board/Slideshow.tsx
     web/src/board/Weather.tsx
     web/src/lib/favorites.ts
     web/src/lib/timers.ts
     web/src/lib/today.ts
     web/src/lib/who.ts
     web/src/pages/Chores.tsx
     web/src/pages/Jars.tsx
     web/src/pages/Meals.tsx
     web/src/pages/Pantry.tsx
     web/src/pages/Reminders.tsx
     web/src/pages/Settings.tsx
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    The new screens (React + TypeScript): meal
                        colby     plan, reminders, timers, pantry, jars and
                        claude    chores.

                                  The new screens take over: /, /edit and
                                  /chores are the React board; the old one
                                  stays at /classic.

 1.1.1    2026-11-18   joshua    A screen that wakes up reads everything
                        claude    again (it may have missed a new day while
                                  asleep).
===============================================================================
*/

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, get, url } from './api.ts';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------------- //
// | The one connection | //
// ---------------------- //
// Opened by the first thing that subscribes, shared by everything on the    //
// page. A new board version (the hello event) reloads the page; after a     //
// reconnect everything is fetched again, since anything may have changed    //
// meanwhile.                                                                //
type Handler = (data: unknown) => void;
const handlers = new Map<string, Set<Handler>>();
let source: EventSource | null = null;
let version: string | null = null;

function connect() {
  if (source) return;
  source = new EventSource(url('api/stream'));
  source.addEventListener('hello', e => {
    const v = (JSON.parse((e as MessageEvent).data) as { v: string }).v;
    // a new version of the board was installed: load it (the page's own state is all on the server)
    if (version && v !== version) location.reload();
    version = v;
    emit('hello', {}); // after a reconnect: everything may have changed meanwhile
  });
  source.onmessage = null;
  source.onopen = () => setOnline(true);
  source.onerror = () => setOnline(false); // EventSource keeps trying by itself
  // a screen that was asleep (turned off overnight, a kiosk app in the background) may have missed
  // updates, a new day among them: everything is read again as soon as it's seen
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') emit('hello', {});
  });
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------------- //
// | Online or not | //
// ----------------- //
// The board shows "Offline" when the connection has been down for a while.  //
let online = true;
const onlineSubs = new Set<(v: boolean) => void>();
function setOnline(v: boolean) {
  if (v === online) return;
  online = v;
  for (const f of onlineSubs) f(v);
}
export function useOnline() {
  const [v, setV] = useState(online);
  useEffect(() => {
    connect();
    onlineSubs.add(setV);
    return () => {
      onlineSubs.delete(setV);
    };
  }, []);
  return v;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------------------- //
// | Listening for an event | //
// -------------------------- //
function emit(event: string, data: unknown) {
  for (const h of handlers.get(event) || []) h(data);
}
// a change made on this screen that other parts of it show (the pins in the menu and in the bar)
export const tellThisScreen = (event: string) => emit(event, {});
const known = new Set<string>(['hello']);

export function subscribe(event: string, h: Handler) {
  connect();
  if (!known.has(event)) {
    known.add(event);
    source!.addEventListener(event, e => emit(event, JSON.parse((e as MessageEvent).data || '{}')));
  }
  if (!handlers.has(event)) handlers.set(event, new Set());
  handlers.get(event)!.add(h);
  return () => handlers.get(event)!.delete(h);
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------------------------------------- //
// | Something from the server, kept up to date | //
// ---------------------------------------------- //
// Something from the server, kept up to date: fetched now, and again        //
// whenever one of `events` arrives                                          //
export function useLive<T>(path: string, events: string[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const seq = useRef(0);
  const load = useCallback(() => {
    const n = ++seq.current;
    get<T>(path).then(
      d => n === seq.current && (setData(d), setError(null)),
      e => n === seq.current && setError(e as ApiError)
    );
  }, [path]);
  const key = events.join(',');
  useEffect(() => {
    load();
    const offs = [...key.split(','), 'hello'].map(ev => subscribe(ev, () => load()));
    return () => offs.forEach(off => off());
  }, [load, key]);
  // a change this screen made: show the server's answer straight away
  return { data, error, reload: load, set: setData };
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
