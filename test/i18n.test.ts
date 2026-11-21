/*
===============================================================================
 Family Chalk Planner | Tests | i18n.test.ts
===============================================================================
 Version:   1.2.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-21
 Updated:   2026-11-21

 Purpose:
     The board's wording in Spanish (shared/i18n.ts with shared/i18n-es.ts):
     exact wording, wording with numbers or names in it, parts joined with
     " · ", and words after an emoji. A number-only pattern never catches
     words ("Bottom of Notes" isn't "3 of 10"), the most particular pattern
     wins, and every pattern in the dictionary can be used.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.2.0    2026-11-21   joshua    New file.
                        claude
===============================================================================
*/

import test from 'node:test';
import assert from 'node:assert';
import { setDictionary, tr, language } from '../shared/i18n.ts';
import { ES } from '../shared/i18n-es.ts';

test('Spanish: exact wording, patterns, parts and emoji', () => {
  setDictionary(ES, 'es');
  assert.equal(language(), 'es');
  assert.equal(tr('Settings'), 'Ajustes');
  assert.equal(tr('  Settings '), '  Ajustes ', 'the spaces around it are kept');
  assert.equal(tr('3 of 10'), '3 de 10');
  assert.equal(tr('Bottom of Notes'), 'Parte de abajo de Notas', 'a number-only pattern never catches words');
  assert.equal(tr('Bottom of Notes on Kitchen'), 'Parte de abajo de Notas en Kitchen', 'a name stays as it is');
  assert.equal(tr('The board’s (English)'), 'La del tablero (English)', 'the most particular pattern wins');
  assert.equal(tr('Chrome on Android'), 'Chrome en Android');
  assert.equal(tr('Today · Tomorrow'), 'Hoy · Mañana');
  assert.equal(tr('🌤️ Weather'), '🌤️ El tiempo');
  assert.equal(tr('Ajustes'), 'Ajustes', 'already Spanish: left as it is');
  assert.equal(tr('Grandma’s birthday dinner'), 'Grandma’s birthday dinner', 'nothing for it: left as it is');
});

test('every pattern in the Spanish dictionary can be used', () => {
  const esc = (s: string) => s.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
  for (const [en, es] of Object.entries(ES)) {
    if (!/\{#?\d\}/.test(en)) continue;
    assert.doesNotThrow(() => new RegExp(esc(en).replace(/\{#?(\d)\}/g, '(?<g$1>.+?)')), 'pattern: ' + en);
    const want = (en.match(/\{#?\d\}/g) || []).map(x => x.replace('#', '')).sort();
    const got = (es.match(/\{\d\}/g) || []).sort();
    assert.deepEqual(got, want, 'the same places in: ' + en);
  }
});

test('English: everything as it is', () => {
  setDictionary(null);
  assert.equal(language(), 'en');
  assert.equal(tr('Settings'), 'Settings');
});
