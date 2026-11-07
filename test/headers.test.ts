/*
===============================================================================
 Family Chalk Planner | Tests | headers.test.ts
===============================================================================
 Version:   0.13.0
 Author:    Joshua D. Miller, Claude
 Updated:   2026-11-07

 Purpose:
     Every code file opens with the project's header (what it's for, who
     wrote it, and its changelog), so it can be understood on its own
     later. See "Comments" in CONTRIBUTING.md.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    New file.
                        claude
===============================================================================
*/

import test from 'node:test';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
  .split('\n')
  .filter(f => /\.(ts|tsx|js|sh|py)$/.test(f) && !f.startsWith('public/') && !f.startsWith('web/dist/'));

test('every code file has the header', () => {
  const missing: string[] = [];
  for (const f of files) {
    let top: string;
    try {
      top = readFileSync(f, 'utf8').slice(0, 8000);
    } catch {
      continue; // deleted but not yet staged
    }
    const need = [
      /^ Family Chalk Planner \| /m,
      /^ Version: {3}\d+\.\d+\.\d+$/m,
      /^ Author: {4}\S/m,
      /^ Updated: {3}\d{4}-\d\d-\d\d$/m,
      /^ CHANGELOG$/m
    ];
    const gaps = need.filter(r => !r.test(top));
    if (gaps.length) missing.push(`${f} (${gaps.map(r => r.source).join(', ')})`);
  }
  assert.deepEqual(missing, [], 'files without the header:\n' + missing.join('\n'));
});

test('header and comment lines fit in 79 columns', () => {
  const long: string[] = [];
  for (const f of files) {
    let text: string;
    try {
      text = readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    text.split('\n').forEach((l, i) => {
      // a box or divider: ends in // or ###, or is a :::: divider
      if ([...l].length > 79 && /(\/\/|###)$|^\s*(\/\/|#) :{10}/.test(l)) long.push(`${f}:${i + 1}`);
    });
  }
  assert.deepEqual(long, []);
});
