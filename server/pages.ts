/*
===============================================================================
 Family Chalk Planner | Server | pages.ts
===============================================================================
 Version:   0.13.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-06
 Updated:   2026-11-07

 Purpose:
     The pages themselves: the board page (wall, tablet and phone chores),
     the admin console, the app icons and install manifests, the board's
     fonts, and the board version (the wall reloads itself when it
     changes).

 Routes:
     GET    /icons/:name
     GET    /fonts.css
     GET    /fonts/:pkg/files/:file
     GET    /
     GET    /next/:page
     USE    /assets
     GET    /edit
     GET    /chores
     GET    /classic
     GET    /classic/edit
     GET    /classic/chores

 Used by:
     server/main.ts
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    Move photos, pages and the console's board
                        claude    settings into TypeScript modules.
                        colby
                                  The new screens (React + TypeScript): meal
                                  plan, reminders, timers, pantry, jars and
                                  chores.

                                  Settings (new screen), and an emoji font
                                  Chrome-based tablets can show.

                                  The board in React (wall view, next/board):
                                  month, events, art, notes column; sharp at
                                  4K.

                                  The new screens take over: /, /edit and
                                  /chores are the React board; the old one
                                  stays at /classic.
===============================================================================
*/

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import express from 'express';
import type { Express, RequestHandler } from 'express';
import { ICONS } from './icons.ts';

const require = createRequire(import.meta.url);

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------- //
// | Fonts | //
// --------- //
// Bundled from npm (SIL Open Font License) and served by the board itself,  //
// so no screen ever calls Google and the board looks right with the         //
// internet down. Each: [name in the address, its package, the style sheets  //
// in it].                                                                   //
const fontsource = (name: string, weights: number[]): [string, string, string[]] => [
  name,
  `@fontsource/${name}`,
  weights.map(w => `${w}.css`)
];
const FONTS: [string, string, string[]][] = [
  fontsource('kalam', [400, 700]),
  fontsource('dancing-script', [700]),
  fontsource('cormorant-garamond', [600]),
  fontsource('caveat', [600]),
  fontsource('permanent-marker', [400]),
  fontsource('pacifico', [400]),
  fontsource('fredericka-the-great', [400]),
  fontsource('amatic-sc', [700]),
  fontsource('rock-salt', [400]),
  // Noto Color Emoji (in the COLRv1 format the Chrome-based wall tablets show; the fontsource copy only
  // works in Safari), for screens that have no emoji of their own: split into pieces, so a screen downloads
  // only the emoji it shows. Named 'Board Emoji', so it's only ever a fallback after the device's own
  // ('Apple Color Emoji', 'Segoe UI Emoji').
  ['noto-color-emoji', '@infolektuell/noto-color-emoji', ['index.css']]
];

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------------------- //
// | Are the fonts installed? | //
// ---------------------------- //
const installed = (spec: string) => {
  try {
    require.resolve(spec);
    return true;
  } catch {
    return false;
  }
};
const fontsMissing = () =>
  FONTS.filter(([, pkg, files]) => files.some(f => !installed(`${pkg}/${f}`))).map(([name]) => name);

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------------- //
// | Installable apps | //
// -------------------- //
// Each screen can be installed as an app (a home-screen icon): the wall     //
// opens full-screen at "/", the iPad at "/edit", and each page at its own   //
// address.                                                                  //
type Kind = 'wall' | 'edit' | 'chores' | 'meals' | 'reminders' | 'timers' | 'pantry' | 'jars' | 'settings';
const app = (name: string, path: string) => ({
  name,
  short_name: name,
  start_url: '/' + path,
  scope: '/',
  display: 'standalone',
  orientation: 'any'
});
// the screens (React). The board as it was before them stays at classic/ for a while, just in case.
export const APP_PAGES = ['meals', 'reminders', 'timers', 'pantry', 'jars', 'settings'];
const manifests = (title: string): Record<Kind, Record<string, string>> => ({
  meals: app('Meal plan', 'meals'),
  reminders: app('Reminders', 'reminders'),
  timers: app('Timers', 'timers'),
  pantry: app('Pantry', 'pantry'),
  jars: app('Reward jars', 'jars'),
  settings: app('Settings', 'settings'),
  wall: {
    name: title,
    short_name: 'Chalk Planner',
    start_url: '/',
    scope: '/',
    display: 'fullscreen',
    orientation: 'landscape'
  },
  edit: {
    name: title + ' (edit)',
    short_name: 'Planner edit',
    start_url: '/edit',
    scope: '/',
    display: 'standalone',
    orientation: 'any'
  },
  chores: {
    name: 'Chores',
    short_name: 'Chores',
    start_url: '/chores',
    scope: '/',
    display: 'standalone',
    orientation: 'any'
  }
});

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------- //
// | The routes | //
// -------------- //
export function setup({
  app,
  publicDir,
  appDir: appDir_,
  serverFile,
  title,
  sourceUrl,
  version,
  broadcast
}: {
  app: Express;
  publicDir: string;
  appDir: string;
  serverFile: string; // the server's own file: a new one means a new version
  title: string;
  sourceUrl: string;
  version: string; // 'v1.2.3'
  broadcast: (event: string, data: unknown) => void;
}) {
  // ----------------------- //
  // | Icons and manifests | //
  // ----------------------- //
  app.get('/icons/:name', (req, res) => {
    const b64 = ICONS[req.params.name];
    if (!b64) return res.sendStatus(404);
    res.set('Cache-Control', 'public, max-age=604800').type('png').send(Buffer.from(b64, 'base64'));
  });

  for (const [kind, m] of Object.entries(manifests(title))) {
    app.get(`/manifest-${kind}.webmanifest`, (_req, res) => {
      res.type('application/manifest+json').json({
        ...m,
        id: m.start_url,
        background_color: '#1c130b',
        theme_color: '#1c130b',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      });
    });
  }

  // Board version = when the page and server were last changed
  const pageFile = path.join(publicDir, 'index.html');
  const serverMtime = Math.round(fs.statSync(serverFile).mtimeMs);
  let pageMtime = 0;
  // --------------------- //
  // | The board version | //
  // --------------------- //
  // When the page and server were last changed. A new one is sent to every  //
  // open screen, which reloads itself.                                      //
  function boardVersion() {
    try {
      pageMtime = Math.round(fs.statSync(pageFile).mtimeMs);
    } catch {
      /* keep the last one */
    }
    return `${serverMtime}-${pageMtime}`;
  }
  let lastVersion = boardVersion();
  // a new index.html dropped in (no restart needed): tell every open page
  setInterval(() => {
    const v = boardVersion();
    if (v !== lastVersion) {
      lastVersion = v;
      broadcast('hello', { v });
    }
  }, 15000).unref();

  // The fonts are installed with the board's packages (npm ci). If they're missing, say so at start-up and in
  // the console (⚙️ Board), and never let browsers keep an incomplete list. deploy/update.sh installs them.
  const fontsGone = fontsMissing();
  if (fontsGone.length)
    console.error(
      `Chalk Planner: the board's fonts aren't installed (${fontsGone.join(', ')}) - screens fall back to plain fonts. Fix: sudo bash ${appDir_}/deploy/update.sh`
    );
  let fontsCss: string | null = null;
  // ------------------------- //
  // | The fonts style sheet | //
  // ------------------------- //
  // The font files' addresses are made relative, so they work wherever the  //
  // board is served from. The emoji are renamed 'Board Emoji', so they're   //
  // only ever a fallback after the screen's own.                            //
  app.get('/fonts.css', (_req, res) => {
    if (fontsCss === null) {
      // the font files' addresses are relative, so they work wherever the board is served from
      const css = FONTS.map(([name, pkg, files]) =>
        files
          .map(f => {
            try {
              return fs
                .readFileSync(require.resolve(`${pkg}/${f}`), 'utf8')
                .replace(/url\(\.\/files\//g, `url(fonts/${name}/files/`)
                .replace(/font-family: ?'Noto Color Emoji'/g, "font-family: 'Board Emoji'")
                .replace(/ tech\([^)]*\)/g, ''); // (Chrome before 108 skips a src it can't read)
            } catch {
              return '';
            }
          })
          .join('\n')
      ).join('\n');
      if (fontsMissing().length) return res.set('Cache-Control', 'no-store').type('text/css').send(css); // incomplete: never cached
      fontsCss = css;
    }
    res.set('Cache-Control', 'public, max-age=86400').type('text/css').send(fontsCss);
  });
  app.get('/fonts/:pkg/files/:file', (req, res) => {
    const { pkg, file } = req.params;
    const font = FONTS.find(([name]) => name === pkg);
    if (!font || !/^[a-z0-9-]+\.woff2?$/.test(file)) return res.sendStatus(404);
    let dir: string;
    try {
      dir = path.dirname(require.resolve(`${font[1]}/package.json`));
    } catch {
      return res.sendStatus(404);
    }
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(path.join(dir, 'files', file), err => {
      if (err && !res.headersSent) res.sendStatus(404);
    });
  });

  const safeTitle = title.replace(/[<>&"]/g, '');
  // --------------------------------- //
  // | The board as it was (classic) | //
  // --------------------------------- //
  function sendBoard(kind: Kind): RequestHandler {
    return (_req, res) => {
      fs.readFile(pageFile, 'utf8', (err, html) => {
        if (err) return res.status(500).send('Board page missing');
        res
          .set('Cache-Control', 'no-cache')
          .type('html')
          .send(
            html
              .replace(/<title>[^<]*<\/title>/, `<title>${safeTitle}</title>`)
              .replace(/__SOURCE_URL__/g, sourceUrl)
              .replace(/__APP_VERSION__/g, version)
              .replace(
                '<!--MANIFEST-->',
                `<link rel="manifest" href="/manifest-${kind}.webmanifest">\n<meta name="board-version" content="${boardVersion()}">`
              )
          );
      });
    };
  }

  // The new screens (web/dist, built by `npm run build`; releases ship it built). Every address in them is
  // relative to <base>, set here to where the board is served from.
  const appDir = path.join(appDir_, 'web', 'dist');
  // --------------- //
  // | The screens | //
  // --------------- //
  // Web/dist, built by `npm run build` (releases ship it built). Every      //
  // address in them is relative to <base>, set here to where the board is   //
  // served from.                                                            //
  function sendApp(kind: Kind): RequestHandler {
    return (_req, res) => {
      fs.readFile(path.join(appDir, 'index.html'), 'utf8', (err, html) => {
        if (err)
          return res
            .status(503)
            .type('text')
            .send('These screens aren’t built yet. On the server, in the board’s folder, run: npm ci && npm run build');
        res
          .set('Cache-Control', 'no-cache')
          .type('html')
          .send(
            html
              .replace(/<base href="[^"]*"\s*\/?>/, '<base href="/">')
              .replace(/<title>[^<]*<\/title>/, `<title>${safeTitle}</title>`)
              .replace(
                '<!--MANIFEST-->',
                `<link rel="manifest" href="manifest-${kind}.webmanifest">\n<meta name="board-version" content="${boardVersion()}">\n<meta name="app-version" content="${version}">`
              )
          );
      });
    };
  }

  // ------------------------- //
  // | Registering the pages | //
  // ------------------------- //
  // Call last: the pages, then any file in public/                          //
  function serve() {
    for (const p of APP_PAGES) app.get('/' + p, sendApp(p as Kind));
    // the addresses the new screens had while they were being built
    app.get('/next/:page', (req, res, next) => {
      const page = req.params.page;
      if (!/^[a-z-]{1,20}$/.test(page)) return next();
      const q = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
      res.redirect(301, (page === 'board' ? '/' : '/' + page) + q);
    });
    // the screens' scripts and styles: names change with every build, so they're kept for good
    app.use(
      '/assets',
      express.static(path.join(appDir, 'assets'), { immutable: true, maxAge: '365d', fallthrough: false })
    );
    app.get('/', sendApp('wall'));
    app.get('/edit', sendApp('edit'));
    app.get('/chores', sendApp('chores'));
    // the board as it was (one page, not React), kept for a while in case something's missing
    app.get('/classic', sendBoard('wall'));
    app.get('/classic/edit', sendBoard('edit'));
    app.get('/classic/chores', sendBoard('chores'));
    // the admin console (sign-in, screens, people, my account) and invite links
    for (const p of ['/admin', '/join'])
      app.get(p, (_req, res) => res.set('Cache-Control', 'no-cache').sendFile(path.join(publicDir, 'admin.html')));
    app.use(express.static(publicDir));
  }

  return { boardVersion, fontsGone, serve };
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
