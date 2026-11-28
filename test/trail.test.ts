/*
===============================================================================
 Family Chalk Planner | Tests | trail.test.ts
===============================================================================
 Version:   1.3.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-28
 Updated:   2026-11-28

 Purpose:
     Flight paths (web/src/board/trail.ts): each style lays down its marks
     along the line, the same every time, and a picture riding on it lands
     at its end facing the way it goes.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.3.0     2026-11-28   joshua    New file.
                        claude
===============================================================================
*/

import test from 'node:test';
import assert from 'node:assert';
import { endOf, trail } from '../web/src/board/trail.ts';

const across = [0, 100, 100, 100, 200, 100, 300, 100]; // left to right, 300 long

test('each path style: dashes are lines, dots and hearts are shapes', () => {
  const dash = trail(across, 4, 'dash', 1);
  assert.ok(dash.line.length > 0 && dash.fill === '');
  assert.ok((dash.line.match(/M/g) || []).length > 5, 'many dashes, not one line');
  const dots = trail(across, 4, 'dots', 1);
  assert.ok(dots.line === '' && (dots.fill.match(/Z/g) || []).length > 10);
  const both = trail(across, 4, 'dashdot', 1);
  assert.ok(both.line && both.fill);
  const hearts = trail(across, 4, 'hearts', 1);
  assert.ok(hearts.line === '' && (hearts.fill.match(/C/g) || []).length > 0);
  assert.deepStrictEqual(trail(across, 4, 'dash', 1), dash, 'the same every time');
  assert.deepStrictEqual(trail([5, 5], 4, 'dash', 1), { line: '', fill: '' }, 'a single point draws nothing');
});

test('a picture on a path lands at its end, facing the way it goes', () => {
  assert.deepStrictEqual(endOf(across), { x: 300, y: 100, deg: 0 });
  const down = endOf([100, 0, 100, 50, 100, 100]);
  assert.strictEqual(down.deg, 90);
  // a jitter at the very end doesn't turn it
  assert.ok(Math.abs(endOf([...across, 301, 101]).deg) < 5);
});
