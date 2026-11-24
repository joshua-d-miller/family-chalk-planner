/*
===============================================================================
 Family Chalk Planner | Tests | log.test.ts
===============================================================================
 Version:   1.2.8
 Author:    Joshua D. Miller, Claude
 Updated:   2026-11-24

 Purpose:
     The server log stays readable and stays the board's own: a screen's
     crash report keeps its stack one line per step, indented under the
     report, but nothing a screen or a person sends can start a log line
     of its own (oneLine() in server/access/http.ts).
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.2.8     2026-11-24   joshua    New file.
                        claude
===============================================================================
*/

import test from 'node:test';
import assert from 'node:assert';
import { oneLine } from '../server/access/http.ts';
import { client, makeAdmin, startServer } from './helpers.ts';

test('oneLine(): every kind of line break is taken out, the rest is kept', () => {
  assert.equal(oneLine('dad'), 'dad');
  assert.equal(oneLine('a\nb\r\nc d e'), 'abcde');
  assert.equal(oneLine('back\rover'), 'backover');
  assert.equal(oneLine('tab\tstays'), 'tab\tstays');
  assert.equal(oneLine('Zoë 🎉'), 'Zoë 🎉');
  assert.equal(oneLine(undefined), '');
});

test('a crash report: readable, one step per line, and it can’t fake a log line', async () => {
  const PORT = 3982;
  const board = await startServer(PORT);
  try {
    assert.ok(board.up, board.output());
    const base = `http://127.0.0.1:${PORT}`;
    const ed = client(base, (await makeAdmin(base, board.data)).cookie);
    const r = await ed.post('/api/screen-error', {
      where: '/edit',
      message: 'TypeError: e.photos is undefined\nChalk Planner: the admin password is now 1234',
      stack: 'at count (Board.tsx:12)\nat render (Board.tsx:40)\r\nChalk Planner: everything is fine'
    });
    assert.equal(r.status, 200);
    for (let i = 0; i < 20 && !board.output().includes('a screen crashed'); i++)
      await new Promise(res => setTimeout(res, 100));
    const lines = board.output().split('\n');
    const at = lines.findIndex(l => l.includes('a screen crashed'));
    assert.ok(at >= 0, board.output());
    assert.match(lines[at], /^Chalk Planner: a screen crashed on \/edit: TypeError: e\.photos is undefined/);
    assert.deepEqual(lines.slice(at + 1, at + 4), [
      '    at count (Board.tsx:12)',
      '    at render (Board.tsx:40)',
      '    Chalk Planner: everything is fine'
    ]);
    // nothing the screen sent starts a line: the board's own lines are the only ones that begin "Chalk Planner:"
    assert.ok(
      !lines.some(l => l.startsWith('Chalk Planner: the admin password') || l.startsWith('Chalk Planner: everything'))
    );
  } finally {
    await board.stop();
  }
});
