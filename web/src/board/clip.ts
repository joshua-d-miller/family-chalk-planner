/*
===============================================================================
 Family Chalk Planner | Screens | Board | clip.ts
===============================================================================
 Version:   0.13.0
 Author:    Joshua D. Miller, Claude
 Updated:   2026-11-07

 Purpose:
     Clipart: the pictures the board has (Fluent emoji, Game Icons "gi-",
     Tabler "tb-"), found by name or by an everyday word (pumpkin,
     halloween, birthday...). The same words as the current board.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    The new board on a tablet (next/edit):
                        claude    events, the month's title and border, the
                                  board style.
===============================================================================
*/

import { url } from '../lib/api.ts';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------- //
// | A picture | //
// ------------- //
// A picture's address; one-color Game Icons drawings take a chalk color     //
export const clipSrc = (n: string, color?: string | null) =>
  url(
    'api/clip/' +
      n +
      (n.startsWith('gi-') && color && color.toUpperCase() !== '#EDEAE0' ? '--' + color.slice(1).toLowerCase() : '') +
      '.svg'
  );

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------------- //
// | Finding one | //
// --------------- //
export const CLIP_SYN: Record<string, string> = {
  pumpkin: 'jack-o-lantern',
  halloween:
    'jack-o-lantern ghost bat spider-web candy gi-pumpkin-lantern gi-witch-face gi-mummy-head gi-vampire-dracula gi-bat gi-cauldron',
  christmas: 'christmas-tree santa-claus wrapped-gift snowman',
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
export const clipLabel = (n: string) => n.replace(/^(gi|tb)-/, '').replace(/-/g, ' ');

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
