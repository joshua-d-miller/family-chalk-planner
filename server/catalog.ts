/*
===============================================================================
 Family Chalk Planner | Server | catalog.ts
===============================================================================
 Version:   0.17.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-14
 Updated:   2026-11-14

 Purpose:
     Every picture the board has, in one list Pictures can search: the
     Fluent emoji and the same emoji in the other styles, the chalk
     drawings, the board's own garland, weather and food, and the
     Openclipart pictures. One search
     always looks through all of it (no style to pick first) and answers
     with each subject once ("turkey"), its other looks alongside.

     Words come from each picture's name and, for emoji, from
     clipart/words.json (Emojibase) or, for Openclipart, its authors' own
     words, so "turkey" finds the bird and
     "pumpkin" the jack-o'-lantern. Flags, letters and signs go last unless
     they're asked for, so "turkey" doesn't put a flag on the calendar.

 How it fits:
     server/clipart.ts builds it (once the styles are unpacked) and serves
     /api/clip/search; server/packs.ts uses it to check the packs.

 Used by:
     server/clipart.ts
     server/packs.ts

 Known limitations:
     English words only. Skin-tone versions of an emoji aren't listed (the
     plain one is).
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.17.0    2026-11-14   joshua    New file. Openclipart's pictures, with
                        claude    their own words; its two or three drawings
                                  of one thing ("apple", "apple-2") as one
                                  answer with its looks.
===============================================================================
*/

import fs from 'node:fs';
import path from 'node:path';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------------- //
// | What a picture is | //
// ---------------------- //
// id: what /api/clip/<id>.svg serves ("turkey", "no-turkey", "gi-acorn")   //
// subject: what it's a picture of; the same emoji in every style shares    //
// one ("turkey"), anything else is its own                                 //
export interface Picture {
  id: string;
  subject: string;
  label: string;
  words: string[]; // its name's words and its tags, lower case
  set: string; // '' Fluent, a style's short name, 'gi' chalk drawings
  low: boolean; // a flag, letter or sign: after everything else, unless asked for
}
// what a search answers: one subject, the picture to show, and its other looks
export interface Found {
  subject: string;
  label: string;
  id: string;
  looks: string[];
}

// the order a subject's looks are offered in (the first is the one shown)
const LOOK_ORDER = ['', 'no', 'tw', 'se', 'eo', 'fx', 'om', 'oc', 'gi', 'cp', 'dd', 'mc', 'ic', 'ip'];
const SKIN = /-(light|medium-light|medium|medium-dark|dark)$/;
// emoji groups that are flags, symbols, letters (Emojibase: 8 symbols, 9 flags)
const LOW_GROUPS = new Set([8, 9]);

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------ //
// | The words for emoji | //
// ------------------------ //
type Words = Record<string, [string, number]>;
let wordsCache: Words | null = null;
function emojiWords(): Words {
  if (!wordsCache) {
    try {
      wordsCache = JSON.parse(
        fs.readFileSync(path.join(import.meta.dirname, '..', 'clipart', 'words.json'), 'utf8')
      ) as Words;
    } catch {
      wordsCache = {};
    }
  }
  return wordsCache;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------------- //
// | Building the list | //
// ---------------------- //
// emoji: Fluent's names; styles: each style's names (with its short name,  //
// "no-turkey"), and whether its pictures are the emoji redrawn (sharing    //
// their subjects) or its own; drawings: the chalk drawings ("gi-acorn").   //
export function buildCatalog(src: {
  emoji: string[];
  styles: { prefix: string; own: boolean; names: string[]; tags?: Record<string, string> }[];
  drawings: string[];
}): Picture[] {
  const w = emojiWords();
  const out: Picture[] = [];
  const plain = new Set(src.emoji);
  // the countries with a flag (Emojibase's names, and the sets' own: Twemoji's "flag-turkey")
  const flags = new Set(Object.keys(w).filter(k => k.startsWith('flag-')));
  for (const st of src.styles)
    for (const id of st.names) {
      const n = id.slice(st.prefix.length + 1);
      if (n.startsWith('flag-')) flags.add(n);
    }
  const add = (id: string, subject: string, name: string, set: string, own?: string) => {
    const tags = own === undefined ? w[name] : undefined;
    const words = [...name.split('-'), ...(tags ? tags[0].split(' ') : []), ...(own ? own.split(' ') : [])].filter(
      Boolean
    );
    const low = (tags ? LOW_GROUPS.has(tags[1]) : false) || /^(flag|regional-indicator|keycap|letter)-/.test(name);
    // Streamline names its flags by the country alone ("turkey", "japan"): they're flags, not the bird
    if (set === 'se' && flags.has('flag-' + name)) {
      out.push({ id, subject: 'flag-' + name, label: 'flag ' + name.replace(/-/g, ' '), words, set, low: true });
      return;
    }
    out.push({ id, subject, label: name.replace(/-/g, ' '), words, set, low });
  };
  // a skin-tone version when the plain one is there: left out (one of each)
  const skin = (n: string, have: Set<string>) => SKIN.test(n) && have.has(n.replace(SKIN, ''));
  for (const n of src.emoji) if (!skin(n, plain)) add(n, n, n, '');
  for (const s of src.styles) {
    const mine = new Set(s.names.map(n => n.slice(s.prefix.length + 1)));
    for (const id of s.names) {
      const n = id.slice(s.prefix.length + 1);
      // (Twemoji names each flag three ways: "flag-turkey", "flag-for-turkey", "flag-for-flag-turkey")
      if (skin(n, mine) || n.startsWith('flag-for-')) continue;
      if (s.tags) {
        // a set with words of its own (Openclipart): "apple", "apple-2", "apple-3" are one answer
        const base = n.replace(/-\d+$/, '');
        add(id, s.prefix + '-' + base, base, s.prefix, s.tags[n] || '');
      } else add(id, s.own ? id : n, n, s.prefix);
    }
  }
  for (const id of src.drawings) add(id, id, id.slice(3), 'gi');
  return out;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------- //
// | Searching | //
// -------------- //
// Every word of the search has to be there. Best first: the whole name,   //
// then every word a word of the name, then the start of one, then a tag,   //
// then inside a word. Flags and signs after the rest unless "flag" is in   //
// the search. Each subject once, with its looks in LOOK_ORDER.             //
export function search(all: Picture[], q: string, max = 120): Found[] {
  const terms = q
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6);
  if (!terms.length) return [];
  const wantLow = terms.some(t => t === 'flag' || t === 'flags' || t === 'letter' || t === 'sign');
  const joined = terms.join(' ');
  const best = new Map<string, { score: number; pics: Picture[] }>();
  for (const p of all) {
    const name = p.label.split(' ');
    let score: number;
    if (p.label === joined) score = 100;
    else if (terms.every(t => name.includes(t) || name.includes(t.replace(/s$/, '')))) score = 80;
    else if (terms.every(t => name.some(n => n.startsWith(t)))) score = 60;
    else if (terms.every(t => p.words.includes(t) || p.words.includes(t.replace(/s$/, '')))) score = 45;
    else if (terms.every(t => t.length > 2 && name.some(n => n.includes(t))))
      score = 20; // (inside a name's word, not a tag: "sword" isn't in "password")
    else continue;
    if (p.low && !wantLow) score -= 70;
    if (p.set === 'ip')
      score -= 30; // IconPark: mostly app icons, after the real pictures
    else if (p.set !== 'gi') score += 2; // a colored picture before a chalk drawing of the same thing
    const b = best.get(p.subject);
    if (!b) best.set(p.subject, { score, pics: [p] });
    else {
      b.score = Math.max(b.score, score);
      b.pics.push(p);
    }
  }
  const order = (s: string) => {
    const i = LOOK_ORDER.indexOf(s);
    return i < 0 ? LOOK_ORDER.length : i;
  };
  // when there are real answers, the near misses (a flag nobody asked for) aren't shown at all
  const top = Math.max(0, ...[...best.values()].map(b => b.score));
  if (top >= 45) for (const [k, b] of best) if (b.score < 20) best.delete(k);
  return [...best.entries()]
    .sort((a, b) => b[1].score - a[1].score || a[0].length - b[0].length || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([subject, b]) => {
      const pics = b.pics.sort((x, y) => order(x.set) - order(y.set));
      return { subject, label: pics[0].label, id: pics[0].id, looks: pics.map(p => p.id) };
    });
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
