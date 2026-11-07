/*
===============================================================================
 Family Chalk Planner | Server | clipart.ts
===============================================================================
 Version:   0.14.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-06
 Updated:   2026-11-06

 Purpose:
     Pictures to place on the board:
      - Fluent Emoji (flat) by Microsoft, MIT: installed with the board
          (npm), so it works offline
      - chalk drawings: a hand-picked, family-friendly part of Game Icons
          (game-icons.net, CC BY 3.0), one-color
        silhouettes in any color. Named "gi-<name>", or
            "gi-<name>--<rrggbb>" for a color (default chalk white)
      - Tabler Icons (MIT), about 5,000 line drawings for "Find more":
          downloaded once, cached, searched here
        (brand logos left out: trademarks)
      - animated emoji: Noto Animated Emoji (Google, CC BY 4.0), fetched
          once and served from here, so the
        wall never depends on the internet to show one

 Routes:
     GET    /api/clip/list
     GET    /api/clip/drawings
     GET    /api/clip/:name.svg
     GET    /api/clipart/search
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
===============================================================================
*/

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { Express } from 'express';
import { makeStyles } from './clipstyles.ts';

const require = createRequire(import.meta.url);
export const CHALK = '#EDEAE0';
const TABLER_VER = '3.49.0';
const NAME = /^[a-z0-9-]{1,64}$/;
const FOREVER = 'public, max-age=31536000, immutable';

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
// -------------- //
// | The routes | //
// -------------- //
interface IconSet {
  icons: Record<string, { body: string; width?: number; height?: number; left?: number; top?: number }>;
  aliases?: Record<string, { parent: string }>;
  width?: number;
  height?: number;
}

export function setup({ app, cacheDir }: { app: Express; cacheDir: string }) {
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

  // ---- Tabler: "Find more" ----
  interface TablerIcon {
    name: string;
    words: string;
    nodes: unknown;
  }
  let tabler: TablerIcon[] | null = null;
  let tablerLoading: Promise<TablerIcon[]> | null = null;
  // ----------------------------------------- //
  // | "Find more": the Tabler line drawings | //
  // ----------------------------------------- //
  // Downloaded once (about 5,000), kept in the cache folder, searched by    //
  // name and tags. Brand logos are left out (trademarks).                   //
  function loadTabler(): Promise<TablerIcon[]> {
    if (tabler) return Promise.resolve(tabler);
    if (tablerLoading) return tablerLoading;
    const loading = (async () => {
      fs.mkdirSync(cacheDir, { recursive: true });
      const get = async (name: string) => {
        const file = path.join(cacheDir, `${TABLER_VER}-${name}`);
        if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
        const r = await fetch(`https://cdn.jsdelivr.net/npm/@tabler/icons@${TABLER_VER}/${name}`, {
          signal: AbortSignal.timeout(30000)
        });
        if (!r.ok) throw new Error(`Clipart download failed (${r.status})`);
        const text = await r.text();
        fs.writeFileSync(file, text);
        return JSON.parse(text);
      };
      const [meta, nodes] = (await Promise.all([get('icons.json'), get('tabler-nodes-outline.json')])) as [
        Record<string, { category?: string; tags?: string[] }>,
        Record<string, unknown>
      ];
      const list: TablerIcon[] = [];
      for (const [name, m] of Object.entries(meta)) {
        if (!nodes[name] || m.category === 'Brand' || name.startsWith('brand-')) continue;
        const words = [name.replace(/-/g, ' '), (m.tags || []).join(' '), m.category || ''].join(' ').toLowerCase();
        list.push({ name, words, nodes: nodes[name] });
      }
      return (tabler = list);
    })().finally(() => {
      tablerLoading = null;
    });
    tablerLoading = loading;
    return loading;
  }
  app.get('/api/clipart/search', async (req, res) => {
    const q = String(req.query.q || '')
      .toLowerCase()
      .trim()
      .slice(0, 40);
    if (!q) return res.json({ items: [] });
    try {
      const terms = q.split(/\s+/);
      const scored: [number, { name: string; nodes: unknown }][] = [];
      for (const it of await loadTabler()) {
        if (!terms.every(t => it.words.includes(t))) continue;
        if (it.name.endsWith('-off') && !q.includes('off')) continue; // crossed-out variants, unless asked for
        scored.push([it.name.includes(terms[0]) ? 0 : 1, it]); // name matches first, then tag matches
      }
      scored.sort((a, b) => a[0] - b[0] || a[1].name.length - b[1].name.length);
      res.json({
        items: scored.slice(0, 60).map(([, it]) => ({ name: it.name, nodes: it.nodes })),
        total: scored.length
      });
    } catch (e) {
      res.status(502).json({ error: (e as Error).message });
    }
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
        fs.mkdirSync(cacheDir, { recursive: true });
        const file = path.join(cacheDir, 'noto-anim-api.json');
        let data: { icons?: { codepoint: string; tags?: string[]; categories?: string[]; popularity?: number }[] };
        if (fs.existsSync(file)) data = JSON.parse(fs.readFileSync(file, 'utf8'));
        else {
          const r = await fetch('https://googlefonts.github.io/noto-emoji-animation/data/api.json', {
            signal: AbortSignal.timeout(30000)
          });
          if (!r.ok) throw new Error(`Animated emoji list download failed (${r.status})`);
          const text = await r.text();
          fs.writeFileSync(file, text);
          data = JSON.parse(text);
        }
        animIndex = (data.icons || [])
          .filter(i => /^[0-9a-f_]{2,48}$/.test(i.codepoint))
          .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
          .map(i => ({
            cp: i.codepoint,
            tags: (i.tags || []).join(' ').replace(/:/g, '').replace(/-/g, ' '),
            cat: (i.categories || [])[0] || ''
          }));
      }
      res.json(animIndex);
    } catch (e) {
      res.status(502).json({ error: (e as Error).message });
    }
  });
  app.get('/api/anim/:cp/:kind', async (req, res) => {
    const { cp, kind } = req.params;
    if (!/^[0-9a-f_]{2,48}$/.test(cp) || !['gif', 'svg'].includes(kind)) return res.sendStatus(404);
    const file = path.join(animDir, `${cp}.${kind}`);
    try {
      if (!fs.existsSync(file)) {
        const r = await fetch(
          `https://fonts.gstatic.com/s/e/notoemoji/latest/${cp}/${kind === 'gif' ? '512.gif' : 'emoji.svg'}`,
          {
            signal: AbortSignal.timeout(20000)
          }
        );
        if (!r.ok) return res.sendStatus(404);
        fs.mkdirSync(animDir, { recursive: true });
        fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
      }
      res
        .set('Cache-Control', FOREVER)
        .type(kind === 'gif' ? 'image/gif' : 'image/svg+xml')
        .sendFile(file);
    } catch {
      res.sendStatus(502);
    }
  });

  // ------------------------------------ //
  // | Is this a picture the board has? | //
  // ------------------------------------ //
  // A clipart or chalk-drawing name the board has (for borders)             //
  const pictureOk = (n: string) =>
    n.startsWith('gi-') ? drawingSet().ok.has(n.slice(3)) : !!styles.fileOf(n) || !!fluentSet().icons[n];
  return { pictureOk, styles };
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
