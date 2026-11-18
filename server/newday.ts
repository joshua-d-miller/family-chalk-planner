/*
===============================================================================
 Family Chalk Planner | Server | newday.ts
===============================================================================
 Version:   1.1.1
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-18
 Updated:   2026-11-18

 Purpose:
     Tells every screen when a new day starts where the board is, so the
     wall moves to today by itself (today's ring, Up next, the countdowns,
     a new month) without anyone reloading it. It looks at the board's
     date every 30 seconds rather than setting one timer for midnight, so
     a clock change, a new time zone or a computer that slept can't make
     it miss the day.

 Used by:
     server/main.ts
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.1.1    2026-11-18   joshua    New file (the wall stayed on yesterday until
                        claude    it was reloaded: nothing told it the day had
                                  changed).
===============================================================================
*/

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------------------- //
// | Watching the date | //
// --------------------- //
// today(): the board's date (YYYY-MM-DD). When it changes, every screen     //
// is told to read the calendar again (and the countdowns). Returns a stop.  //
export function watchDay(
  today: () => string,
  broadcast: (event: string, data: unknown) => void,
  every = 30_000
): () => void {
  let last = today();
  const t = setInterval(() => {
    const now = today();
    if (now === last) return;
    last = now;
    broadcast('calendar', { ym: 'any', newDay: now });
    broadcast('countdowns', {});
  }, every);
  t.unref?.(); // (never keeps the server running by itself)
  return () => clearInterval(t);
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
