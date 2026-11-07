/*
===============================================================================
 Family Chalk Planner | Server | clipstyles.ts
===============================================================================
 Version:   0.14.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-07
 Updated:   2026-11-07

 Purpose:
     More picture sets for Stamps, each in its own style (Streamline,
     Noto, OpenMoji, Twitter, Firefox, EmojiOne, IconPark). Installed with
     the board (npm), so they work offline. Each is unpacked once into the
     clipart cache, one file per picture, so the board doesn't keep tens
     of megabytes of pictures in memory. A picture's name starts with its
     set's short name: "no-jack-o-lantern" is Noto's jack-o'-lantern.

 How it fits:
     server/clipart.ts serves them: /api/clip/styles lists the sets and
     whether each is unpacked yet, /api/clip/list?style=no lists one set's
     names, and /api/clip/no-<name>.svg is one picture.

 Used by:
     server/clipart.ts
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.14.0    2026-11-07   joshua    New file.
                        claude
===============================================================================
*/

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const NAME = /^[a-z0-9-]{1,60}$/;

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------ //
// | The sets | //
// ------------ //
export interface ClipStyle {
  prefix: string;
  name: string; // shown in Stamps
  pkg: string; // @iconify-json/<pkg>
  credit: string; // for the line under the pictures (and NOTICE)
}
export const STYLES: ClipStyle[] = [
  { prefix: 'se', name: 'Streamline', pkg: 'streamline-emojis', credit: 'Streamline Emojis by Streamline (CC BY 4.0)' },
  { prefix: 'no', name: 'Noto', pkg: 'noto', credit: 'Noto Emoji by Google (Apache 2.0)' },
  { prefix: 'om', name: 'OpenMoji', pkg: 'openmoji', credit: 'OpenMoji (CC BY-SA 4.0)' },
  { prefix: 'tw', name: 'Twitter', pkg: 'twemoji', credit: 'Twemoji by Twitter (CC BY 4.0)' },
  { prefix: 'fx', name: 'Firefox', pkg: 'fxemoji', credit: 'Firefox OS Emoji by Mozilla (Apache 2.0)' },
  { prefix: 'eo', name: 'EmojiOne', pkg: 'emojione', credit: 'EmojiOne (CC BY 4.0)' },
  { prefix: 'ip', name: 'IconPark', pkg: 'icon-park', credit: 'IconPark by ByteDance (Apache 2.0)' }
];
export const stylePrefix = (name: string) => STYLES.find(s => name.startsWith(s.prefix + '-'));

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------- //
// | What a set looks like | //
// ------------------------- //
interface IconSet {
  icons: Record<string, { body: string; width?: number; height?: number; left?: number; top?: number }>;
  aliases?: Record<string, { parent: string }>;
  width?: number;
  height?: number;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------------ //
// | Unpacking and finding them | //
// ------------------------------ //
// Each set is unpacked once per version, one file per picture, one set at a //
// time in the background after the board starts (the first start takes a    //
// minute).                                                                  //
export function makeStyles(cacheDir: string) {
  const ready = new Map<string, string[]>(); // prefix -> its names, once unpacked
  const dirOf = (s: ClipStyle) => {
    let ver = '0';
    try {
      ver = (require(`@iconify-json/${s.pkg}/package.json`) as { version: string }).version;
    } catch {
      /* not installed */
    }
    return path.join(cacheDir, 'styles', `${s.prefix}-${ver}`);
  };

  async function unpack(s: ClipStyle) {
    const dir = dirOf(s);
    const index = path.join(dir, 'index.json');
    if (fs.existsSync(index)) {
      ready.set(s.prefix, JSON.parse(fs.readFileSync(index, 'utf8')));
      return;
    }
    let file: string;
    try {
      file = require.resolve(`@iconify-json/${s.pkg}/icons.json`);
    } catch {
      return; // not installed: that style just isn't offered
    }
    const j = JSON.parse(await fs.promises.readFile(file, 'utf8')) as IconSet;
    const tmp = dir + '.tmp';
    await fs.promises.rm(tmp, { recursive: true, force: true });
    await fs.promises.mkdir(tmp, { recursive: true });
    const names: string[] = [];
    const all: [string, string][] = Object.keys(j.icons).map(n => [n, n]);
    for (const [a, v] of Object.entries(j.aliases || {})) if (j.icons[v.parent]) all.push([a, v.parent]);
    for (let k = 0; k < all.length; k += 200) {
      await Promise.all(
        all.slice(k, k + 200).map(async ([n, src]) => {
          if (!NAME.test(n)) return;
          const i = j.icons[src];
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${i.left || 0} ${i.top || 0} ${i.width || j.width || 16} ${i.height || j.height || 16}" width="256" height="256">${i.body}</svg>`;
          await fs.promises.writeFile(path.join(tmp, n + '.svg'), svg);
          names.push(n);
        })
      );
    }
    names.sort();
    await fs.promises.writeFile(path.join(tmp, 'index.json'), JSON.stringify(names));
    await fs.promises.rm(dir, { recursive: true, force: true });
    await fs.promises.rename(tmp, dir);
    ready.set(s.prefix, names);
  }
  const unpacking = (async () => {
    await new Promise(r => setTimeout(r, 2000));
    for (const s of STYLES)
      try {
        await unpack(s);
      } catch (e) {
        console.warn(`Chalk Planner: couldn't unpack the ${s.name} pictures: ${(e as Error).message}`);
      }
  })();

  return {
    unpacking,
    list: () =>
      STYLES.map(s => ({ prefix: s.prefix, name: s.name, credit: s.credit, count: ready.get(s.prefix)?.length || 0 })),
    names: (prefix: string) => ready.get(prefix)?.map(n => prefix + '-' + n) || null,
    // the file for "no-jack-o-lantern", or null
    fileOf(name: string) {
      const s = stylePrefix(name);
      const n = s && name.slice(s.prefix.length + 1);
      if (!s || !n || !NAME.test(n) || !ready.get(s.prefix)) return null;
      return path.join(dirOf(s), n + '.svg');
    }
  };
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
