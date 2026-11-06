// The pages themselves: the board page (wall, tablet and phone chores), the admin console, the app icons
// and install manifests, the board's fonts, and the board version (the wall reloads itself when it changes).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import express from 'express';
import type { Express, RequestHandler } from 'express';
import { ICONS } from './icons.ts';

const require = createRequire(import.meta.url);

// Fonts: bundled from npm (@fontsource, SIL Open Font License) and served by the board itself, so no screen
// ever calls Google and the board looks right with the internet down.
const FONTS: [string, number[]][] = [
  ['kalam', [400, 700]],
  ['dancing-script', [700]],
  ['cormorant-garamond', [600]],
  ['caveat', [600]],
  ['permanent-marker', [400]],
  ['pacifico', [400]],
  ['fredericka-the-great', [400]],
  ['amatic-sc', [700]],
  ['rock-salt', [400]]
];
const installed = (spec: string) => {
  try {
    require.resolve(spec);
    return true;
  } catch {
    return false;
  }
};
const fontsMissing = () =>
  FONTS.filter(([pkg, ws]) => ws.some(w => !installed(`@fontsource/${pkg}/${w}.css`))).map(([pkg]) => pkg);

// Installable app: the wall opens full-screen at "/", the iPad opens "/edit"
type Kind = 'wall' | 'edit' | 'chores';
const manifests = (title: string): Record<Kind, Record<string, string>> => ({
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

export function setup({
  app,
  publicDir,
  appDir,
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
      `Chalk Planner: the board's fonts aren't installed (${fontsGone.join(', ')}) - screens fall back to plain fonts. Fix: sudo bash ${appDir}/deploy/update.sh`
    );
  let fontsCss: string | null = null;
  app.get('/fonts.css', (_req, res) => {
    if (fontsCss === null) {
      const css = FONTS.map(([pkg, ws]) =>
        ws
          .map(w => {
            try {
              return fs
                .readFileSync(require.resolve(`@fontsource/${pkg}/${w}.css`), 'utf8')
                .replace(/url\(\.\/files\//g, `url(/fonts/${pkg}/files/`);
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
    if (!FONTS.some(([p]) => p === pkg) || !/^[a-z0-9-]+\.woff2?$/.test(file)) return res.sendStatus(404);
    let dir: string;
    try {
      dir = path.dirname(require.resolve(`@fontsource/${pkg}/package.json`));
    } catch {
      return res.sendStatus(404);
    }
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(path.join(dir, 'files', file), err => {
      if (err && !res.headersSent) res.sendStatus(404);
    });
  });

  const safeTitle = title.replace(/[<>&"]/g, '');
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

  // Call last: the pages, then any file in public/
  function serve() {
    app.get('/', sendBoard('wall'));
    app.get('/edit', sendBoard('edit'));
    app.get('/chores', sendBoard('chores')); // the chores page on a phone (same page, chores mode)
    // the admin console (sign-in, screens, people, my account) and invite links
    for (const p of ['/admin', '/join'])
      app.get(p, (_req, res) => res.set('Cache-Control', 'no-cache').sendFile(path.join(publicDir, 'admin.html')));
    app.use(express.static(publicDir));
  }

  return { boardVersion, fontsGone, serve };
}
