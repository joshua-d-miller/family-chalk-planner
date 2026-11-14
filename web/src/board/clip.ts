/*
===============================================================================
 Family Chalk Planner | Screens | Board | clip.ts
===============================================================================
 Version:   0.17.0
 Author:    Joshua D. Miller, Claude
 Updated:   2026-11-14

 Purpose:
     Clipart: the pictures the board has (Fluent emoji, Game Icons "gi-",
     Tabler "tb-" in art placed before 0.17), found by name or by an
     everyday word (pumpkin, halloween, birthday...). The same words as the
     current board.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    The new board on a tablet (next/edit):
                        claude    events, the month's title and border, the
                                  board style.

 0.14.0    2026-11-07   joshua    Names of the other styles show without their
                        claude    prefix.

 0.14.1    2026-11-08   joshua    clipPath: the path the board keeps for a
                        claude    picture.

 0.16.0    2026-11-11   joshua    Search words for garland, lights, ornaments
                        claude    and wreaths.

 0.17.0    2026-11-14   joshua    Names of the weather (mc-) and food (ic-)
                        claude    pictures read as words too, and
                                  Openclipart's (oc-; "apple 2" reads
                                  "apple").
===============================================================================
*/

import { url } from '../lib/api.ts';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------- //
// | A picture | //
// ------------- //
// A picture's address; one-color Game Icons drawings take a chalk color     //
// as the board keeps it in a piece of art (from the board's own address)
export const clipPath = (n: string, color?: string | null) =>
  '/api/clip/' +
  n +
  (n.startsWith('gi-') && color && color.toUpperCase() !== '#EDEAE0' ? '--' + color.slice(1).toLowerCase() : '') +
  '.svg';
// for showing it on this screen
export const clipSrc = (n: string, color?: string | null) => url(clipPath(n, color));

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------------- //
// | Finding one | //
// --------------- //
export const CLIP_SYN: Record<string, string> = {
  pumpkin: 'jack-o-lantern',
  halloween:
    'jack-o-lantern ghost bat spider-web candy gi-pumpkin-lantern gi-witch-face gi-mummy-head gi-vampire-dracula gi-bat gi-cauldron',
  christmas:
    'cp-garland-lights-twinkle cp-garland-pine cp-wreath cp-christmas-tree cp-ornament-red cp-poinsettia cp-santa-hat cp-stocking cp-jingle-bells cp-snowman cp-reindeer cp-hot-cocoa cp-candy-cane cp-gingerbread-man cp-star-twinkle cp-present cp-mittens cp-sugar-cookie christmas-tree santa-claus wrapped-gift snowman',
  garland:
    'cp-garland-lights cp-garland-pine cp-garland-holly cp-garland-tinsel cp-garland-beads cp-garland-bunting cp-garland-candy-cane cp-string-lights',
  lights: 'cp-garland-lights-twinkle cp-string-lights-twinkle cp-garland-lights cp-string-lights cp-bulb-red',
  twinkle: 'cp-garland-lights-twinkle cp-string-lights-twinkle cp-star-twinkle cp-candle',
  snowflake: 'cp-snowflake-1 cp-snowflake-2 cp-snowflake-3',
  tree: 'cp-christmas-tree',
  santa: 'cp-santa-hat cp-north-pole',
  cocoa: 'cp-hot-cocoa',
  cookie: 'cp-sugar-cookie cp-gingerbread-man',
  ornament: 'cp-ornament-red cp-ornament-gold cp-ornament-blue',
  wreath: 'cp-wreath',
  thanksgiving: 'turkey gi-cornucopia gi-corn gi-pumpkin gi-pilgrim-hat gi-wheat gi-acorn pie fallen-leaf',
  witch: 'gi-witch-face gi-witch-flight gi-pointy-hat',
  mummy: 'gi-mummy-head',
  vampire: 'gi-vampire-dracula gi-female-vampire person-vampire',
  frankenstein: 'gi-frankenstein-creature',
  harvest: 'gi-cornucopia gi-wheat gi-corn gi-scarecrow',
  easter: 'rabbit-face egg hatching-chick tulip',
  birthday: 'birthday-cake cupcake balloon wrapped-gift party-popper partying-face',
  party: 'party-popper confetti-ball balloon partying-face',
  car: 'automobile',
  bus: 'bus',
  football: 'american-football',
  bunny: 'rabbit-face',
  puppy: 'dog-face dog',
  kitty: 'cat-face cat',
  dino: 'sauropod t-rex',
  dinosaur: 'sauropod t-rex',
  valentine: 'red-heart heart-with-ribbon love-letter',
  july: 'fireworks',
  hanukkah: 'menorah',
  school: 'school bus books backpack pencil',
  vacation: 'airplane beach-with-umbrella luggage palm-tree',
  dentist: 'tooth',
  doctor: 'hospital stethoscope'
};

// the names that match what was typed: everyday words first, then names containing every word typed
export function searchClip(names: string[], q: string, max = 60) {
  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const have = new Set(names);
  const syn: string[] = [];
  for (const t of terms)
    for (const n of (CLIP_SYN[t] || '').split(' ')) if (n && have.has(n) && !syn.includes(n)) syn.push(n);
  return [...syn, ...names.filter(n => !syn.includes(n) && terms.every(t => n.includes(t)))].slice(0, max);
}
// a picture's name without its set's short name (gi- chalk drawings, tb- line drawings, se- no- om- tw- fx- eo- ip-
// the other styles, cp- the board's own, mc- weather, ic- food)
export const clipLabel = (n: string) =>
  n
    .replace(/^(gi|tb|se|no|om|tw|fx|eo|ip|cp|mc|ic|oc)-/, '')
    .replace(/-\d+$/, '')
    .replace(/-/g, ' ');

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
