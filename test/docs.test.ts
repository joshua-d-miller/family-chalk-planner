/*
===============================================================================
 Family Chalk Planner | Tests | docs.test.ts
===============================================================================
 Version:   0.17.1
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-14
 Updated:   2026-11-14

 Purpose:
     The README and every guide in docs/ point at things that exist: each
     link to another file in the repository, each picture, and each
     #section (as GitHub makes them from the headings). A guide someone
     follows step by step can't send them to a page that isn't there.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.17.1    2026-11-14   joshua    New file.
                        claude
===============================================================================
*/

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..');
const pages = [
  'README.md',
  'CONTRIBUTING.md',
  ...fs
    .readdirSync(path.join(ROOT, 'docs'))
    .filter(f => f.endsWith('.md'))
    .map(f => 'docs/' + f)
];

// a heading's #anchor, the way GitHub makes it
const slug = (h: string) =>
  h
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
const anchors = (file: string) => {
  const seen = new Map<string, number>();
  const out = new Set<string>();
  for (const m of fs.readFileSync(file, 'utf8').matchAll(/^#{1,6}\s+(.+)$/gm)) {
    const s = slug(m[1].replace(/`/g, ''));
    const n = seen.get(s) || 0;
    seen.set(s, n + 1);
    out.add(n ? `${s}-${n}` : s);
  }
  return out;
};

test('every link, picture and #section in the README and docs exists', () => {
  const broken: string[] = [];
  for (const page of pages) {
    const file = path.join(ROOT, page);
    const text = fs.readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, '');
    const targets = [
      ...[...text.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map(m => m[1]),
      ...[...text.matchAll(/<img[^>]+src="([^"]+)"/g)].map(m => m[1])
    ];
    for (const t of targets) {
      if (/^(https?:|mailto:)/.test(t)) continue;
      const [rel, hash] = t.split('#');
      const dest = rel ? path.resolve(path.dirname(file), decodeURI(rel)) : file;
      if (!fs.existsSync(dest)) {
        broken.push(`${page}: ${t} (no such file)`);
        continue;
      }
      if (hash && dest.endsWith('.md') && !anchors(dest).has(hash)) broken.push(`${page}: ${t} (no such section)`);
    }
  }
  assert.deepEqual(broken, []);
});
