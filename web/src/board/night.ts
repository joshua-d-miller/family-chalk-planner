/*
===============================================================================
 Family Chalk Planner | Screens | Board | night.ts
===============================================================================
 Version:   1.3.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-26
 Updated:   2026-11-26

 Purpose:
     Whether it's the board's overnight hours now (⚙️ Settings → 🌙
     Overnight hours): the first window (from, until, on its days) or any of
     up to 3 more. A window past midnight belongs to the day it starts: Fri
     21:00 to 06:00 is Friday night and Saturday's early morning. No days
     saved: every day (as before 1.3.0).

 Used by:
     web/src/board/Slideshow.tsx
     test/night.test.ts
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.3.0     2026-11-26   joshua    New file (nightNow, from Slideshow.tsx),
                        claude    with days and more windows.
===============================================================================
*/

export type NightWindow = { from: string; to: string; days?: number[] }; // days: 0 Sunday … 6 Saturday
export type NightCfg = NightWindow & { night: boolean; more?: NightWindow[] };

const hm = (s: string) => {
  const m = /^(\d\d):(\d\d)$/.exec(s || '');
  return m ? +m[1] * 60 + +m[2] : null;
};
function inWindow(w: NightWindow, d: Date) {
  const f = hm(w.from);
  const t = hm(w.to);
  if (f === null || t === null || f === t) return false;
  const m = d.getHours() * 60 + d.getMinutes();
  const on = (day: number) => !w.days || w.days.includes(day);
  if (f < t) return on(d.getDay()) && m >= f && m < t;
  return (on(d.getDay()) && m >= f) || (on((d.getDay() + 6) % 7) && m < t); // past midnight: the day before's
}
export function nightNow(cfg: NightCfg | undefined, d = new Date()) {
  if (!cfg?.night) return false;
  return inWindow(cfg, d) || (cfg.more || []).some(w => inWindow(w, d));
}
