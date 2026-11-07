/*
===============================================================================
 Family Chalk Planner | Screens | Helpers | timers.ts
===============================================================================
 Version:   0.13.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Updated:   2026-11-07

 Purpose:
     Timers count down on each screen (corrected by the server's clock);
     when one ends, a screen marks it done, and the screens chosen for it
     say its name out loud.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    The new screens (React + TypeScript): meal
                        colby     plan, reminders, timers, pantry, jars and
                        claude    chores.
===============================================================================
*/

import { useEffect, useRef, useState } from 'react';
import type { Timer, TimersView } from '../../../shared/lists.ts';
import { post } from './api.ts';
import { useLive } from './live.ts';

const SPEAK_KEY = 'fcp:speakTimers';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------------------------- //
// | Speaking on this screen | //
// --------------------------- //
// Only the screens chosen for it say a timer's name out loud (kept on this  //
// device).                                                                  //
export function speaksHere() {
  try {
    return localStorage.getItem(SPEAK_KEY) === '1';
  } catch {
    return false;
  }
}
export function setSpeaksHere(on: boolean) {
  try {
    localStorage.setItem(SPEAK_KEY, on ? '1' : '0');
  } catch {
    /* (private browsing) */
  }
}
export function say(text: string) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch {
    /* no speech on this screen */
  }
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------- //
// | Time left | //
// ------------- //
export const left = (t: Timer, now: number) =>
  t.state === 'running' ? Math.max(0, (t.endsAt || 0) - now) : t.state === 'paused' ? t.left || 0 : 0;
export function fmtLeft(ms: number) {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h
    ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
    : `${m}:${String(ss).padStart(2, '0')}`;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------------------------- //
// | The timers, counting down | //
// ----------------------------- //
// Corrected by the server's clock, ticking only while one runs. The first   //
// screen to see one end marks it done.                                      //
export function useTimers() {
  const live = useLive<TimersView>('api/timers', ['timers']);
  const [now, setNow] = useState(Date.now());
  const skew = useRef(0); // the server's clock minus this screen's
  const spoken = useRef(new Set<string>());
  useEffect(() => {
    if (live.data) skew.current = live.data.now - Date.now();
  }, [live.data]);
  const running = live.data?.items.some(t => t.state === 'running');
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now() + skew.current), 250);
    return () => clearInterval(t);
  }, [running]);
  // one ended: mark it done (whichever screen sees it first), and speak where chosen
  useEffect(() => {
    for (const t of live.data?.items || []) {
      if (t.state !== 'running' || (t.endsAt || 0) > now) continue;
      const key = t.id + ':' + t.endsAt;
      if (spoken.current.has(key)) continue;
      spoken.current.add(key);
      if (speaksHere()) say(`${t.name} timer is done`);
      post<TimersView>('api/timers/item', { timer: { ...t, state: 'done', doneAt: t.endsAt } })
        .then(live.set)
        .catch(() => {});
    }
  }, [now, live]);
  const change = async (t: Partial<Timer>) => live.set(await post<TimersView>('api/timers/item', { timer: t }));
  const remove = async (id: string) => live.set(await post<TimersView>('api/timers/item/delete', { id }));
  return { timers: live.data?.items || [], now, change, remove, loaded: !!live.data };
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
