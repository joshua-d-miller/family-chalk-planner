# Contributing

Thanks for helping! Family Chalk Planner is a small, self-hosted family wall calendar. The goal is a
board that a non-technical family can live with every day: calm to look at, easy to edit, safe on a
home network, and fully working without the internet once set up.

## Run it locally
You need Node.js 22 (it uses the built-in `node:sqlite`).

```bash
git clone https://github.com/joshua-d-miller/family-chalk-planner.git
cd family-chalk-planner
npm ci
npm test                      # starts real servers with mock calendars/albums on localhost
npx playwright install chromium   # once, for the browser tests
npm run test:e2e              # the board in a real browser: tablet, wall, family screen, kid's tablet, phone
PORT=3002 DATA_DIR=./data node server/chalkboard.js
```

Open `http://localhost:3002/admin`, create the admin with the setup code from the log
(or `data/setup-code.txt`), then pair a browser tab as a screen or sign in at `/edit`.
For a calendar without real accounts, use the tests' mock CalDAV server: `node test/mock-caldav.js 5232 &`,
then in the console → ⚙️ Board → Calendar enter `http://127.0.0.1:5232/`, any username and password, and
**Find my calendars**. (Settings live in the database; environment variables with the same names are
read once, on a fresh data folder's first start — handy for tests and scripts.)

## Making a change
1. Branch from `main`, keep the change focused, and add or update a test in `test/` for anything
   the server does (`node --test test/<file>.test.js` runs one file), and a browser test in `test/e2e/`
   for anything you can see or tap (`npx playwright test chores` runs one file). Browser tests describe what
   the board does, not how it's built, so they keep working when the code underneath changes.
2. CI must pass: `npm ci`, `node --check server/chalkboard.js`, `npm test`, `npm run test:e2e`,
   `npm audit --omit=dev --audit-level=high`, ShellCheck on `deploy/*.sh`, and `test/deploy-scripts.sh`
   (runs the real install and update scripts as root with systemd stubbed out: `sudo env "PATH=$PATH" bash test/deploy-scripts.sh`).
3. Open a pull request with what changed and how you tested it (screenshots for anything visible).
   `main` only accepts pull requests that pass CI and are approved by the maintainer
   (see `.github/CODEOWNERS`); the maintainer merges.
4. Add a line to the top section of `CHANGELOG.md` in plain words a family member would understand.

## How the code is laid out
- `server/chalkboard.js`: the board's server (calendar, art, meals, jars, photos, settings).
- `server/access.js`: who may do what — screens, people, sign-in, passkeys, the Security tab.
- `public/index.html`: the board (wall, tablet editor, family screens); `public/admin.html`: the console.
- `deploy/`: install, update (with rollback), reset-admin, systemd unit.
- `docs/`: install, user guide, Google Calendar, photos.

## Ground rules
- **Security first.** Every `/api` route is covered by the rank check in `server/access.js`; new
  write routes are editor-only unless there's a reason. Never fetch a URL a user typed without the
  private-network guard used by "Add from link". Secrets never go in the repo or the log.
- **Works offline.** Anything shown on the wall is served by the board itself (fonts, clipart, GIFs).
- **Plain words.** Messages and docs are for families, not engineers.
- **Licensing.** The project is AGPL-3.0-or-later. Third-party assets must have a compatible license
  and an entry in `NOTICE`.

## Releasing (maintainers)
Bump `version` in `package.json` (and `package-lock.json`), move the notes into a `## x.y.z` section of
`CHANGELOG.md`, merge, then tag the merge commit `vx.y.z` and push the tag. The Release workflow
checks the tag, runs the tests and publishes the GitHub Release; boards pick it up with
`deploy/update.sh`.

## Reporting security problems
Please don't open a public issue — see [SECURITY.md](SECURITY.md).
