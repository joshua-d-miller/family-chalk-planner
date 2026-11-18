/*
===============================================================================
 Family Chalk Planner | Tests | newday.test.ts
===============================================================================
 Version:   1.1.1
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-18
 Updated:   2026-11-18

 Purpose:
     A new day: every screen is told once when the board's date changes
     (and not while it stays the same), so the wall moves to today without
     a reload.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.1.1    2026-11-18   joshua    New file.
                        claude
===============================================================================
*/

import test from 'node:test';
import assert from 'node:assert';
import { watchDay } from '../server/newday.ts';

test('every screen is told once when the day changes', async () => {
  let day = '2026-11-17';
  const sent: [string, unknown][] = [];
  const stop = watchDay(
    () => day,
    (e, d) => sent.push([e, d]),
    20
  );
  await new Promise(r => setTimeout(r, 70));
  assert.deepEqual(sent, [], 'the same day: nothing');
  day = '2026-11-18';
  await new Promise(r => setTimeout(r, 70));
  assert.deepEqual(sent, [
    ['calendar', { ym: 'any', newDay: '2026-11-18' }],
    ['countdowns', {}]
  ]);
  stop();
});
