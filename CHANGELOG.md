# Changelog

What changed in each release. `deploy/update.sh` installs the newest release; the notes for each
one also appear on the GitHub Releases page. Versions follow [semantic versioning](https://semver.org/)
(while below 1.0, a new minor version can change how things work).

## 0.12.1 — borders keep the art on its day
- Fixed: adding a holiday border to a month that already had drawings, stamps or words left them where
  they were while the days moved in, so they ended up on the wrong spot. Art on the calendar now moves
  and shrinks with the days (and back when the border comes off or changes size). The first tablet or
  family screen that shows the month saves the move for everyone.
- Fixed: an extra-large month title in a tall font (Pacifico with an outline) was cut off at the top of
  the board. It's now shrunk just enough to fit and kept off the edge.

## 0.12.0 — chores
- **🧹 Chores:** a family checklist kept on the board — every day, every week, every month — that
  resets by itself. Swipe left on the calendar to see it (or 🧹 Chores on the tablet); big and easy to read.
- **On your phone:** open the board’s address with `/chores` at the end, sign in, and add it to the Home
  Screen. Tick chores off and **✎ Change the list** from there or from the tablet.
- Chores can be shared (done once, by any of them) or **each their own**, and can count more than once
  a week (“Fold laundry, 3 times”). **Start with an example** fills in a typical family schedule.
- **🧒 Kid’s tablet** (new kind of screen in the admin console): opens on that kid’s own chores, and they
  can tick off only theirs. The calendar is a swipe away, view only. Family screens can tick anyone’s;
  the wall just shows them.

## 0.11.0 — holiday borders and chalk drawings
- **🖼 Border** around the calendar, per month: ready-made Halloween, Thanksgiving, Christmas and more,
  or any pictures you pick (up to 8, repeated around the edge), in a color and size you choose. Comes
  back every year in that month unless you untick it. Works on the wall, tablets and family screens.
- **Chalk drawings** in Clipart (their groups are marked with one of their own drawings): about 115 hand-picked one-color drawings from game-icons.net
  (CC BY 3.0) — witches, mummies, vampires, pumpkins, cornucopias, scarecrows, snowmen and more — in any
  color.

## 0.10.0 — big days stand out
- **Size on the board** for an event: Normal, Large or Extra large (birthdays, big days). Board-only like
  the color, and follows "Just this one / All of them" for repeating events.
- Month title: new **XL** size.
- Tapping a day with events shows them all with **Add** at the bottom; an empty day goes straight to
  adding one (tablet and family screens). Tapping an event still opens it directly.

## 0.9.1 — Apple Pencil fix
- Drawing with the Apple Pencil works with Scribble turned on: the board claims Pencil touches on the
  drawing surface so iPadOS can't take the stroke away (fingers behave as before).

## 0.9.0 — kids pick what goes in their jar
- **Add a…** in a jar's card: a big button for every kind of piece, so a kid can ask for exactly the one
  they want. **+** still adds the jar's usual pieces in turn (now picked with a compact row of icons),
  and **−** takes out the last one added.
- Each jar remembers every piece in the order it went in. Jars from before look exactly the same, and
  a screen that hasn't reloaded yet can't scramble them.
- Updated libraries: Express 5 (web server), SimpleWebAuthn 14 (passkeys) and ical.js 2 (calendars).
  Nothing changes for you; passkey sign-up and sign-in were checked in a real browser.

## 0.8.5 — install and update scripts are tested
- Fixed: a fresh install with `install.sh` on 0.7.0–0.8.3 stopped silently before finishing (the same
  missing-`server.conf` bug as below).
- Fixed: if a step failed inside the update (for example installing packages), the previous version
  wasn't put back as promised.
- CI now runs the real install and update scripts (fresh install; updates with and without an old
  `.env` / `server.conf`; already up to date; a failed update being undone) on every change.
- docs/install.md → Troubleshooting: how to get a board stuck on 0.7.0–0.8.3 going again.
- Family screens: no Month title button (fonts and hand-lettering are set from a tablet, since family
  screens don't do freehand drawing), and "Art instead" beside the month name points to Decorate.

## 0.8.4 — update fix
- `deploy/update.sh` stopped without a message once the old `.env` had been moved aside (and the update
  channel wasn't set in the console). Fixed, and the script now always says where it stopped if
  anything goes wrong. Same fix for `install.sh`, `reset-admin.sh` and `setting.sh`.

## 0.8.3 — family screens can restyle
- Family screens can now change the board style (background, look, seasonal pattern) and the photos,
  like the tablet. Still tablet-only: freehand drawing, deleting saved stamps and GIFs,
  calendar settings. An unsaved style left open is put back after 5 quiet minutes.

## 0.8.2 — popups fit every screen
- Popups (events, Board style, photos, month title…) are never taller than the screen: they scroll inside
  instead, the Save / Cancel row always stays in view, and on smaller screens everything is a bit more
  compact. Before, on a short touch screen the event popup's title and Save button were off the screen.

## 0.8.1 — safer updates
- `deploy/update.sh` puts the previous version back if a step fails before the restart (for example
  installing packages), instead of leaving new files next to the old running board.
- **The board's fonts (and its other packages) are always installed:** `deploy/update.sh` checks that
  every package is present at the right version and installs any that are missing, even when the board
  is already up to date, so running it again repairs an earlier update that stopped partway.
- If the fonts are still missing, the log and ⚙️ Board say so and how to fix it, and browsers aren't told
  to keep the incomplete font list (it showed as Comic Sans-style fallback fonts).

## 0.8.0 — more backgrounds, a calmer console
- New backgrounds: **dark wood**, **black glass**, **linen paper** and **pegboard** (Board style).
- **Change with the season** (optional, off by default): a faint pattern for the month shown — snowflakes,
  blossoms, suns, leaves, hearts in February and pumpkins in October. Seasons flip south of the equator.
- The admin console uses your device's normal font for everything but the headings, so codes, addresses
  and dates are easier to read. Colors and layout still match the board.

## 0.7.0 — no more settings file
- **Every setting lives in the admin console (⚙️ Board) and the database.** New **On your network**
  section: the board's https address, the reverse proxy's address (with a one-click button using the
  address the board sees), whether unpaired devices may view, release or main updates, the source link;
  plus the Google sign-in return address.
- **Upgrading:** the first start reads an old `.env` once and moves everything into the database;
  `deploy/update.sh` then renames it to `.env.moved-to-admin-console`. The environment no longer decides
  any of these settings afterwards.
- Encrypted at rest with the key kept outside the database: passwords and the Google client secret (never
  shown again), and now also the calendar account name, the photo album link and calendar links (shown
  to admins).
- Where the board listens and keeps data (`PORT`, `BIND`, `DATA_DIR`, `BACKUP_DIR`) is set by
  `install.sh` in the service definition (`--port`, `--bind`, `--data`, `--backup-dir`).
- `deploy/setting.sh get|set KEY [VALUE]` (Docker: `node server/chalkboard.js --setting …`) to fix a
  setting from the server if the console can't be reached. The time zone defaults to the server's.
- 🛡 Security: "Trust only <proxy>" button.
- The encryption key (`data/secret.key`) is copied into the backup folder immediately and whenever it
  changes, ⚙️ Board shows where it is and whether the backup copy is current, and docs/install.md
  explains exactly what it unlocks (and that losing it only means re-entering those values).

## 0.6.0 — more calendars, calendar links, and settings for outside the US
- **More calendars from the same account** (iCloud/CalDAV or Google): admin console → ⚙️ Board →
  *List my calendars*, tick them and pick a color. Shown together on the board; their events can be
  changed like the main calendar's. The account password only ever goes to that account's server.
- **Calendar links** (iCal / .ics / webcal://): school, sports teams, published work calendars —
  read-only, in their own color, checked every 15 minutes (the last good copy is kept if a site is
  down). Problems show in ⚙️ Board.
- **Weeks can start on Monday**, **24-hour times**, and holidays for **Canada** and the
  **United Kingdom** (as well as the US, or none).
- Google setup now pastes the codes in the console instead of editing `.env`.

## 0.5.0 — Docker and settings in the admin console
- **Docker:** `compose.yaml` + image for amd64 and arm64 (published to GitHub Container Registry with
  each release). Runs as an unprivileged user, keeps everything in `./data`, prints the setup code in
  the log. Optional face finder build. Guide: docs/docker.md.
- **⚙️ Board in the admin console:** board name, time zone, holidays, weather town (search by name),
  temperature unit, calendar (iCloud/CalDAV with **Find my calendars**, or Google client ID/secret)
  and the photo album link — no more editing files on the server. Saving restarts the board in a few
  seconds. Console values win over `.env`; empty fields fall back to `.env`.
- Passwords saved in the console are encrypted with a key kept outside the database
  (`data/secret.key` or `SECRET_KEY`), copied into the nightly backup; never shown again, and
  changes are logged in 🛡 Activity by name only. Losing the key only means entering them again.
- `TZ` works as the time zone too (the usual container variable). The service restarts 2 seconds
  after stopping instead of 5.

## 0.4.4 — security and release housekeeping
- Fonts are bundled with the board (SIL Open Font License, via npm `@fontsource/*`): screens no longer
  contact Google Fonts, and the board looks right without internet.
- Strict browser content policy on the board pages: everything must come from the board itself.
- The admin console warns when it's opened without HTTPS, and the 🛡 Security tab flags a missing
  https `PUBLIC_URL` and suggests `TRUST_PROXY` with the proxy address it sees.
- Unused uploaded/linked GIFs older than 30 days are removed daily (nothing on any month, in the GIF
  library or in a stamp still uses them).
- `deploy/update.sh` installs the newest tagged release by default (`UPDATE_CHANNEL=main` follows
  every change on main). GitHub Releases are created from tags with these notes.
- Dependabot, CONTRIBUTING.md, issue and pull request templates.

## 0.4.3 — GIFs from a link
- Paste a GIF link (GIPHY, Tenor, KLIPY, any .gif or a page that shares one) in the GIFs tab; the
  board downloads its own copy so it keeps working offline. Never fetches local-network addresses.

## 0.4.2 — family screens behave like the wall
- No wood frame, double tap for the photo frame, overnight slideshow, back to this month and out of
  Decorate after 5 quiet minutes, updates itself.

## 0.4.1 — real clipart
- 3,000+ full-color clipart pictures (Fluent Emoji by Microsoft, MIT), grouped and searchable,
  served by the board. No zoom on family screens.

## 0.4.0 — backgrounds and decorating
- Backgrounds: black slate, green or blue chalkboard, cork, kraft paper, whiteboard; colors only change
  where they'd be hard to read.
- Family screens can decorate (stamps, clipart, emoji, GIFs, words) without freehand drawing.
- New 👤 account menu; the admin console link shows only for admins.
- Passkey failures on the device are logged in Activity. Buttons no longer let text spill out.

## 0.3.x — admin console, paired screens, passkeys
- `/admin` console: pair screens with a code, invite people, passkeys or password + authenticator,
  per-sign-in and per-passkey control, Security tab with activity log and automatic cleanup.
  Replaced the old PIN. `deploy/reset-admin.sh` for when nobody can sign in.

## 0.2.x — Google Calendar and Google Photos
- Google Calendar with full editing; Google Photos shared albums; resize anything; Today and Photos
  views in Notes.

## 0.1.0
- First release: chalkboard calendar on iCloud/CalDAV, drawing, stamps, meal plan, reward jars,
  countdowns, weather, trash day, photos and overnight slideshow.
