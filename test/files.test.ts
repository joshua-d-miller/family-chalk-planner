/*
===============================================================================
 Family Chalk Planner | Tests | files.test.ts
===============================================================================
 Version:   1.2.8
 Author:    Joshua D. Miller, Claude
 Updated:   2026-11-24

 Purpose:
     Files the board keeps (server/files.ts): a name never leads out of its
     folder; a file is written whole, in one step; "only if it's new" never
     replaces one that's there; reading a missing file is just nothing.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.2.8     2026-11-24   joshua    New file.
                        claude

                                  The read test makes its own file.
===============================================================================
*/

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inside, readIfThere, writeIfNew, writeWhole } from '../server/files.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fcp-files-'));
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

test('a name stays inside its folder', () => {
  assert.equal(inside(dir, 'a1b2.jpg'), path.join(dir, 'a1b2.jpg'));
  for (const n of ['../secret.key', '../../etc/passwd', '/etc/passwd', 'a/../../b', '', '.'])
    assert.equal(inside(dir, n), null, n);
  // a folder whose name starts the same is still somewhere else
  assert.equal(inside(dir, `../${path.basename(dir)}-other/x`), null);
});

test('written whole, in one step; nothing left over', () => {
  const f = path.join(dir, 'whole.bin');
  writeWhole(f, Buffer.from('first'));
  writeWhole(f, 'second', 0o600);
  assert.equal(fs.readFileSync(f, 'utf8'), 'second');
  assert.equal(fs.statSync(f).mode & 0o777, 0o600);
  assert.deepEqual(
    fs.readdirSync(dir).filter(n => n.endsWith('.part')),
    [],
    'no temporary file stays behind'
  );
});

test('only if it’s new: never over one that’s there', () => {
  const f = path.join(dir, 'new.key');
  assert.equal(writeIfNew(f, 'one', 0o600), true);
  assert.equal(writeIfNew(f, 'two', 0o600), false);
  assert.equal(fs.readFileSync(f, 'utf8'), 'one');
});

test('reading a file that isn’t there is just nothing', () => {
  assert.equal(readIfThere(path.join(dir, 'missing')), null);
  fs.writeFileSync(path.join(dir, 'there.txt'), 'here');
  assert.equal(readIfThere(path.join(dir, 'there.txt'))?.toString(), 'here');
  assert.throws(() => readIfThere(dir), 'a folder is an error, not "nothing there"');
});
