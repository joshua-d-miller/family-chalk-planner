/*
===============================================================================
 Family Chalk Planner | Screens | UI | perf.ts
===============================================================================
 Version:   1.3.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-28
 Updated:   2026-11-28

 Purpose:
     ?perf on any screen's address (like ?wx=rain): a small box in the
     corner with how the screen is keeping up, to check a wall on the real
     hardware: frames a second, how much of the last second went to work
     that held the screen up (long tasks), memory (Chrome only), and how
     much is drawn (page elements, pictures, art). It's loaded only with
     ?perf, so other screens never download it.

 Used by:
     web/src/main.tsx
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.3.0     2026-11-28   joshua    New file.
                        claude
===============================================================================
*/

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------------- //
// | The ?perf box | //
// ----------------- //
// Counted each animation frame (only while it's open: counting costs a     //
// little itself) and shown once a second.                                  //
export function showPerf() {
  const box = document.createElement('div');
  box.id = 'perfBox';
  box.setAttribute('role', 'status');
  box.style.cssText =
    'position:fixed;left:8px;bottom:8px;z-index:99999;padding:6px 10px;border-radius:8px;' +
    'background:rgba(0,0,0,.78);color:#9f9;font:12px/1.45 ui-monospace,monospace;white-space:pre;pointer-events:none';
  document.body.appendChild(box);
  let frames = 0;
  let busy = 0; // ms of long tasks in the last second
  try {
    new PerformanceObserver(l => l.getEntries().forEach(e => (busy += e.duration))).observe({ type: 'longtask' });
  } catch {
    // (a browser without long tasks: shown as "–")
  }
  const longOk = PerformanceObserver.supportedEntryTypes?.includes('longtask');
  const tick = () => {
    frames++;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  setInterval(() => {
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    box.textContent = [
      `${frames} fps`,
      `busy ${longOk ? Math.round(busy) + ' ms/s' : '–'}`,
      mem ? `memory ${Math.round(mem.usedJSHeapSize / 1048576)} MB` : 'memory –',
      `${document.getElementsByTagName('*').length} elements · ${document.images.length} pictures`,
      `${document.querySelectorAll('.artSvg [data-id], .gifLayer img').length} art`
    ].join('\n');
    frames = 0;
    busy = 0;
  }, 1000);
}
