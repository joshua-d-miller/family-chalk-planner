/*
===============================================================================
 Family Chalk Planner | Tests | night.test.ts
===============================================================================
 Version:   1.3.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-26
 Updated:   2026-11-26

 Purpose:
     The overnight hours (web/src/board/night.ts): a window on every day
     (as before 1.3.0), one on chosen days, one past midnight (it belongs
     to the day it starts), and more than one window.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.3.0     2026-11-26   joshua    New file.
                        claude
===============================================================================
*/

import test from 'node:test';
import assert from 'node:assert';
import { nightNow } from '../web/src/board/night.ts';

// 2026-11-27 is a Friday; the times are the screen's own
const at = (day: number, time: string) => new Date(`2026-11-${String(day).padStart(2, '0')}T${time}:00`);
const FRI = 27;
const SAT = 28;

test('the overnight hours: every day, as before', () => {
  const cfg = { night: true, from: '21:00', to: '06:00' };
  assert.equal(nightNow(cfg, at(FRI, '22:30')), true);
  assert.equal(nightNow(cfg, at(SAT, '05:59')), true);
  assert.equal(nightNow(cfg, at(SAT, '06:00')), false);
  assert.equal(nightNow(cfg, at(FRI, '12:00')), false);
  assert.equal(nightNow({ ...cfg, night: false }, at(FRI, '22:30')), false, 'turned off');
  assert.equal(nightNow({ ...cfg, to: '21:00' }, at(FRI, '21:30')), false, 'from and until the same: never');
});

test('chosen days: past midnight belongs to the day it starts', () => {
  const fri = { night: true, from: '21:00', to: '06:00', days: [5] }; // Friday nights only
  assert.equal(nightNow(fri, at(FRI, '23:00')), true);
  assert.equal(nightNow(fri, at(SAT, '03:00')), true, "Saturday's early morning is Friday night");
  assert.equal(nightNow(fri, at(SAT, '23:00')), false);
  assert.equal(nightNow(fri, at(FRI, '03:00')), false, "Friday's early morning is Thursday night");
  const school = { night: true, from: '09:00', to: '15:00', days: [1, 2, 3, 4, 5] };
  assert.equal(nightNow(school, at(FRI, '10:00')), true);
  assert.equal(nightNow(school, at(SAT, '10:00')), false);
});

test('more than one window', () => {
  const cfg = {
    night: true,
    from: '21:00',
    to: '06:00',
    more: [{ from: '09:00', to: '15:00', days: [1, 2, 3, 4, 5] }]
  };
  assert.equal(nightNow(cfg, at(FRI, '10:00')), true, 'a weekday, while everyone is out');
  assert.equal(nightNow(cfg, at(SAT, '10:00')), false);
  assert.equal(nightNow(cfg, at(SAT, '02:00')), true, 'the first window still counts');
});
