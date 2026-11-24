/*
===============================================================================
 Family Chalk Planner | Server | clipart.ts
===============================================================================
 Version:   1.2.8
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-06
 Updated:   2026-11-24

 Purpose:
     Pictures to place on the board:
      - Fluent Emoji (flat) by Microsoft, MIT: installed with the board
          (npm), so it works offline
      - chalk drawings: the family-friendly part of Game Icons
          (game-icons.net, CC BY 3.0, about 3,200), one-color
        silhouettes in any color. Named "gi-<name>", or
            "gi-<name>--<rrggbb>" for a color (default chalk white)
      - animated emoji: Noto Animated Emoji (Google, CC BY 4.0), fetched
          once and served from here, so the
        wall never depends on the internet to show one

 Routes:
     GET    /api/clip/search
     GET    /api/clip/list
     GET    /api/clip/drawings
     GET    /api/clip/:name.svg
     GET    /api/anim/list
     GET    /api/anim/:cp/:kind

 Used by:
     server/main.ts
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-06   joshua    Move clipart and media into their own
                        claude    TypeScript modules.

 0.14.0    2026-11-07   joshua    Serves the 7 other picture styles too.
                        claude

 0.17.0    2026-11-14   joshua    Every family-friendly chalk drawing (not just
                        claude    the hand-picked groups); one search through
                                  every picture the board has
                                  (/api/clip/search, server/catalog.ts).
                                  "Find more" (the Tabler line drawings) is
                                  gone: the chalk drawings and the one search
                                  cover it. Openclipart's pictures are
                                  searched with their own words.

 1.2.8    2026-11-24   joshua    Animated emoji: drawn again before they're
                        claude    kept (server/images.ts), the still picture
                                  as a PNG, the list kept in the database,
                                  each file inside its folder and written in
                                  one step.
===============================================================================
*/

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { Express } from 'express';
import type { Kv } from './kv.ts';
import { inside, readIfThere, writeWhole } from './files.ts';
import { remade, svgAsPng } from './images.ts';
import { buildCatalog, search } from './catalog.ts';
import type { Picture } from './catalog.ts';
import { makeStyles, STYLES } from './clipstyles.ts';

const require = createRequire(import.meta.url);
export const CHALK = '#EDEAE0';
const NAME = /^[a-z0-9-]{1,64}$/;
const FOREVER = 'public, max-age=31536000, immutable';
const ANIM_MAX = 10 * 1024 * 1024; // far bigger than any animated emoji

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------------------------------- //
// | The chalk drawings, in groups | //
// --------------------------------- //
// The groups shown in the stamp library, each a list of Game Icons names    //
// (picked to be family-friendly).                                           //
const DRAWING_GROUPS: Record<string, string> = {
  Halloween:
    'pumpkin pumpkin-lantern pumpkin-mask witch-face witch-flight mummy-head vampire-dracula female-vampire frankenstein-creature floating-ghost ghost bat moon-bats spider-web cobweb hanging-spider cauldron magic-broom broom tombstone candle-light candles cat owl moon skeleton wizard-face pointy-hat',
  'Fall & Thanksgiving':
    'corn cornucopia acorn wheat scarecrow pilgrim-hat pumpkin falling-leaf maple-leaf oak-leaf chestnut-leaf curled-leaf oak sunflower shiny-apple pie-slice mushroom-gills mushrooms squirrel hedgehog barn-owl',
  'Winter & Christmas':
    'snowman snowflake-1 snowflake-2 present gingerbread-man ringing-bell pine-tree candy-canes star-formation sparkles winter-hat igloo penguin polar-bear',
  'Spring & Easter':
    'easter-egg rabbit rabbit-head flower-pot daisy butterfly bee ladybug clover shamrock rainbow-star umbrella sprout seedling bird-house',
  Summer:
    'sun sunrise beach-ball beach-bucket palm-tree watermelon ice-cream-cone ice-cream-scoop sailboat firework-rocket balloons kite crab',
  'Party & love':
    'cake-slice cupcake balloons party-popper present crown trophy-cup medal hearts heart-bottle love-letter',
  Animals:
    'cat dog-house horse-head cow pig sheep rooster chicken duck turtle frog unicorn dinosaur-rex elephant-head lion bear-head owl'
};

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------------------------------------- //
// | Chalk drawings not for a family board | //
// ----------------------------------------- //
// Game Icons is made for games: weapons, gore, monsters and grown-up       //
// things are left out by the words in their names (whole words, so "arm"   //
// doesn't take the farm with it). The hand-picked groups above are always  //
// in, so Halloween keeps its skeleton and tombstone.                       //
const BAD_WORDS = new Set(
  (
    'sword swords gun guns rifle pistol revolver bullet bullets cannon knife knives dagger daggers blade blades axe ' +
    'axes spear mace halberd scythe bomb bombs grenade missile missiles launcher skull skulls bone bones blood ' +
    'bloody gore corpse death dead guillotine noose hanged gallows wound wounded crossbow arrow arrows shuriken ' +
    'katana scimitar saber sabre cutlass claymore lance trident whip flail dynamite explosion explosive nuke ' +
    'radioactive poison poisoned toxic biohazard demon devil evil satan pentagram cult zombie brain brains guts ' +
    'intestines organ organs syringe drug drugs pill pills cigar cigarette beer wine whiskey alcohol kill killer ' +
    'murder assassin execution executioner prison handcuffs fist punch crime thief gamble casino poker sexy lips ' +
    'kiss bikini vomit poop toilet tentacle tentacles gibbet stab slash shot shoot sniper tank warship battle war ' +
    'weapon armor armour helmet helm shield claw claws fang fangs bite chainsaw hatchet cleaver pierced impaled ' +
    'carnage massacre flesh eyeball monster horror reaper plague virus bacteria tumor surgery scalpel amputation ' +
    'ammo cartridge holster bayonet musket blunderbuss catapult trebuchet ballista siege spiked thorns barbed ' +
    'harpoon trap snare grave coffin ghoul lich necromancer occult curse cursed hex voodoo ritual sacrifice altar ' +
    'drink hand hands finger fingers foot feet leg legs arm arms torso body bust breast naked nude bra underwear ' +
    'abstract tomahawk sai p90 convict kidney kidneys lungs liver stomach spine skeleton ak47 uzi glock flintlock ' +
    'bazooka minigun laser raygun taser knuckles burning burn fire flame flames blast bleeding broken heartbeat ' +
    'mutant alien aliens robot cyborg ninja pirate skeletal tombstone grenades shells rocket rockets plane warplane'
  ).split(' ')
);
// and inside a word, the roots that can only mean one thing (broadsword, shotgun, bomber)
const BAD_ROOTS =
  /sword|^gun|gun$|bomb|dagger|skull|knife|rifle|pistol|grenade|bullet|missile|blood|corpse|zombie|kill/;
export const notForFamily = (name: string) => name.split('-').some(w => BAD_WORDS.has(w) || BAD_ROOTS.test(w));

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------- //
// | The routes | //
// -------------- //
interface IconSet {
  icons: Record<string, { body: string; width?: number; height?: number; left?: number; top?: number }>;
  aliases?: Record<string, { parent: string }>;
  width?: number;
  height?: number;
}

export function setup({ app, cacheDir, kv }: { app: Express; cacheDir: string; kv: Kv }) {
  const animDir = path.join(cacheDir, 'anim');
  const styles = makeStyles(cacheDir);

  // loaded on first use (the files are large)
  let fluent: { icons: IconSet['icons']; w: number; h: number; names: string[] } | null = null;
  // ----------------------------- //
  // | The Fluent emoji pictures | //
  // ----------------------------- //
  // Read once from the installed package: each picture's name and file.     //
  function fluentSet() {
    if (!fluent) {
      const j = require('@iconify-json/fluent-emoji-flat/icons.json') as IconSet;
      const icons = { ...j.icons };
      for (const [a, v] of Object.entries(j.aliases || {})) if (icons[v.parent]) icons[a] = icons[v.parent];
      fluent = {
        icons,
        w: j.width || 32,
        h: j.height || 32,
        names: Object.keys(icons)
          .filter(n => NAME.test(n))
          .sort()
      };
    }
    return fluent;
  }
  let gi: { icons: IconSet['icons']; w: number; h: number; ok: Set<string>; groups: Record<string, string[]> } | null =
    null;
  // ---------------------- //
  // | The chalk drawings | //
  // ---------------------- //
  // Every Game Icons drawing that suits a family board: the hand-picked groups, and the rest of the set
  // less weapons, gore, scary and grown-up things (and abstract shapes nobody would look for)
  function drawingSet() {
    if (!gi) {
      const j = require('@iconify-json/game-icons/icons.json') as IconSet;
      const ok = new Set<string>();
      const groups: Record<string, string[]> = {};
      for (const [g, s] of Object.entries(DRAWING_GROUPS))
        groups[g] = s
          .split(' ')
          .filter(n => j.icons[n] && ok.add(n))
          .map(n => 'gi-' + n);
      for (const n of Object.keys(j.icons)) if (NAME.test(n) && !notForFamily(n)) ok.add(n);
      gi = { icons: j.icons, w: j.width || 512, h: j.height || 512, ok, groups };
    }
    return gi;
  }
  // --------------------------------- //
  // | One chalk drawing, in a color | //
  // --------------------------------- //
  // "gi-pumpkin" or "gi-pumpkin--f2d479"                                    //
  function drawingSvg(name: string) {
    const m = /^gi-([a-z0-9]+(?:-[a-z0-9]+)*?)(?:--([0-9a-f]{6}))?$/.exec(name);
    if (!m) return null;
    const g = drawingSet();
    if (!g.ok.has(m[1])) return null;
    const i = g.icons[m[1]];
    const color = m[2] ? '#' + m[2] : CHALK;
    const body = i.body.replace(/fill="#000"/g, 'fill="currentColor"').replace(/fill="#fff"/g, 'fill="none"');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${i.width || g.w} ${i.height || g.h}" width="256" height="256" color="${color}">${body}</svg>`;
  }

  // ---- Fluent and chalk drawings ----
  const notInstalled = { error: 'Clipart isn’t installed (run npm ci)' };
  // ---------------------- //
  // | Every picture name | //
  // ---------------------- //
  app.get('/api/clip/styles', (_req, res) => res.set('Cache-Control', 'no-cache').json(styles.list()));
  app.get('/api/clip/list', (req, res) => {
    // one of the other styles: its names (once it's unpacked)
    if (typeof req.query.style === 'string') {
      const n = styles.names(req.query.style);
      if (!n) return res.status(503).json({ error: 'These pictures are still being unpacked - try again in a minute' });
      return res.set('Cache-Control', 'public, max-age=86400').json(n);
    }
    try {
      res
        .set('Cache-Control', 'public, max-age=86400')
        .json(fluentSet().names.concat(...Object.values(drawingSet().groups)));
    } catch {
      res.status(500).json(notInstalled);
    }
  });
  app.get('/api/clip/drawings', (_req, res) => {
    try {
      res.set('Cache-Control', 'public, max-age=86400').json(drawingSet().groups);
    } catch {
      res.status(500).json(notInstalled);
    }
  });
  // --------------- //
  // | One picture | //
  // --------------- //
  // Cached for a long time: a name always means the same picture.           //
  app.get('/api/clip/:name.svg', (req, res) => {
    const name = req.params.name;
    if (name.startsWith('gi-')) {
      let svg: string | null;
      try {
        svg = NAME.test(name) ? drawingSvg(name) : null;
      } catch {
        return res.sendStatus(500);
      }
      if (!svg) return res.sendStatus(404);
      return res.set('Cache-Control', FOREVER).type('image/svg+xml').send(svg);
    }
    const file = styles.fileOf(name);
    if (file)
      return res
        .set('Cache-Control', FOREVER)
        .type('image/svg+xml')
        .sendFile(file, err => {
          if (err && !res.headersSent) res.sendStatus(404);
        });
    let f: ReturnType<typeof fluentSet>;
    try {
      f = fluentSet();
    } catch {
      return res.sendStatus(500);
    }
    const i = NAME.test(name) && f.icons[name];
    if (!i) return res.sendStatus(404);
    res
      .set('Cache-Control', FOREVER)
      .type('image/svg+xml')
      .send(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${i.left || 0} ${i.top || 0} ${i.width || f.w} ${i.height || f.h}" width="256" height="256">${i.body}</svg>`
      );
  });

  // ---- animated emoji ----
  let animIndex: { cp: string; tags: string; cat: string }[] | null = null;
  // ------------------ //
  // | Animated emoji | //
  // ------------------ //
  // The list comes from Google once and is kept; each emoji is fetched once //
  // and then served from here, so the wall never depends on the internet to //
  // show one.                                                               //
  app.get('/api/anim/list', async (_req, res) => {
    try {
      if (!animIndex) {
        // kept in the board's database, as the board's own short list (not Google's file), once fetched
        animIndex = kv.get<typeof animIndex>('animEmojiList');
        if (!animIndex) {
          // a board from before 1.2.8 kept Google's file itself: read once from there, so it needs no internet
          const before = readIfThere(path.join(cacheDir, 'noto-anim-api.json'));
          let data: { icons?: { codepoint: string; tags?: string[]; categories?: string[]; popularity?: number }[] };
          if (before) data = JSON.parse(before.toString('utf8'));
          else {
            const r = await fetch('https://googlefonts.github.io/noto-emoji-animation/data/api.json', {
              signal: AbortSignal.timeout(30000)
            });
            if (!r.ok) throw new Error(`Animated emoji list download failed (${r.status})`);
            data = (await r.json()) as typeof data;
          }
          animIndex = (data.icons || [])
            .filter(i => /^[0-9a-f_]{2,48}$/.test(i.codepoint))
            .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
            .map(i => ({
              cp: i.codepoint,
              tags: (i.tags || []).join(' ').replace(/:/g, '').replace(/-/g, ' ').slice(0, 300),
              cat: String((i.categories || [])[0] || '').slice(0, 40)
            }));
          kv.set('animEmojiList', animIndex);
        }
      }
      res.json(animIndex);
    } catch (e) {
      res.status(502).json({ error: (e as Error).message });
    }
  });
  // one emoji: the moving GIF, or its still picture (Google's SVG drawing, kept as a 512 × 512 PNG; the
  // address still ends in /svg, as the art on boards already has it). Each is drawn again before it's kept
  // (server/images.ts), and written in one step.
  app.get('/api/anim/:cp/:kind', async (req, res) => {
    const { cp, kind } = req.params;
    if (!/^[0-9a-f_]{2,48}$/.test(cp) || !['gif', 'svg'].includes(kind)) return res.sendStatus(404);
    const file = inside(animDir, kind === 'gif' ? `${cp}.gif` : `${cp}.still.png`);
    if (!file) return res.sendStatus(404);
    try {
      let buf = readIfThere(file);
      // a still picture kept as Google's SVG before 1.2.8: drawn as the PNG from that copy (no internet needed)
      const before = !buf && kind === 'svg' ? readIfThere(path.join(animDir, `${cp}.svg`)) : null;
      if (before) {
        buf = await svgAsPng(before);
        if (buf) writeWhole(file, buf);
      }
      if (!buf) {
        const r = await fetch(
          `https://fonts.gstatic.com/s/e/notoemoji/latest/${cp}/${kind === 'gif' ? '512.gif' : 'emoji.svg'}`,
          {
            signal: AbortSignal.timeout(20000)
          }
        );
        if (!r.ok) return res.sendStatus(404);
        const got = Buffer.from(await r.arrayBuffer());
        if (got.byteLength > ANIM_MAX) return res.sendStatus(404);
        buf = kind === 'gif' ? (await remade(got, 'gif'))?.buf || null : await svgAsPng(got);
        if (!buf) return res.sendStatus(404);
        fs.mkdirSync(animDir, { recursive: true });
        writeWhole(file, buf);
      }
      res
        .set('Cache-Control', FOREVER)
        .type(kind === 'gif' ? 'image/gif' : 'image/png')
        .send(buf);
    } catch {
      res.sendStatus(502);
    }
  });

  // --------------------------- //
  // | Every picture, searched | //
  // --------------------------- //
  // Built the first time it's wanted, and again once the other styles have  //
  // finished unpacking (until then, Fluent and the chalk drawings).         //
  let cat: Picture[] | null = null;
  let catFull = false;
  function catalog() {
    if (cat && catFull) return cat;
    const done = STYLES.every(st => styles.names(st.prefix));
    if (cat && !done) return cat;
    cat = buildCatalog({
      emoji: fluentSet().names,
      styles: STYLES.map(st => {
        const tags = styles.tags(st.prefix);
        return {
          prefix: st.prefix,
          own: !!st.own,
          names: styles.names(st.prefix) || [],
          ...(Object.keys(tags).length ? { tags } : {})
        };
      }),
      drawings: [...drawingSet().ok].map(n => 'gi-' + n)
    });
    catFull = done;
    return cat;
  }
  void styles.unpacking.then(() => {
    if (cat) catFull = false; // rebuilt with every style on the next search
  });
  app.get('/api/clip/search', (req, res) => {
    const q = String(req.query.q || '').slice(0, 60);
    try {
      res.set('Cache-Control', 'no-cache').json({ found: search(catalog(), q) });
    } catch {
      res.status(500).json(notInstalled);
    }
  });

  // ------------------------------------ //
  // | Is this a picture the board has? | //
  // ------------------------------------ //
  // A clipart or chalk-drawing name the board has (for borders)             //
  const pictureOk = (n: string) =>
    n.startsWith('gi-') ? drawingSet().ok.has(n.slice(3)) : !!styles.fileOf(n) || !!fluentSet().icons[n];
  return { pictureOk, styles, catalog };
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
