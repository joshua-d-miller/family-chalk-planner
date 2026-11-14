/*
===============================================================================
 Family Chalk Planner | Tests | fakenow.mjs
===============================================================================
 Version:   0.17.1
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-14
 Updated:   2026-11-14

 Purpose:
     Sets every clock it's loaded into (the test runner and the board) to
     October 14, 2026, noon in New York, and lets it run from there, so the
     README's screenshots always show the same month. Loaded with
     NODE_OPTIONS="--import ./test/fakenow.mjs" (test/e2e/readme-shots.spec.ts).
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.17.1    2026-11-14   joshua    New file.
                        claude
===============================================================================
*/

const shift = Date.parse('2026-10-14T16:00:00Z') - Date.now();
const Real = Date;
class FakeDate extends Real {
  constructor(...a) {
    if (a.length) super(...a);
    else super(Real.now() + shift);
  }
  static now() {
    return Real.now() + shift;
  }
}
globalThis.Date = FakeDate;
