# 1.3.0 plan

The working plan for 1.3.0: what gets built, in what order, where in the code, and how we know each part is done.
The ideas behind it are in [ROADMAP.md](ROADMAP.md). The chalk mockups are at
https://claude.ai/artifact/ELWuftRLPTaEZ5muo7zQEJ.

**Rules for everything in this release**
- **Fast on any screen.** Nothing runs every frame unless something is moving. Effects are made once at the
  screen's real resolution and kept. No canvas `filter` (Safari before 18 ignores it). Everything pauses while
  the screen is off or hidden.
- **Sharp on any screen.** Lines, lettering, paths and doodles are drawn as shapes. Anything made as a picture
  (grain, colored-in pictures) is made at the screen's real pixel count.
- **Nothing changes after an update unless someone turns it on.** The exception is the month arrows fading on
  family screens.
- **Every feature comes with:** Spanish words (`shared/i18n-es.ts`), a Playwright test, the user guide, the
  changelog, and checks in the Home Assistant add-on and on older wall browsers (`chrome100`, `safari15`,
  `firefox100`, the build's targets).
- **Security:** anything a screen sends is checked on the server (`server/art.ts` `cleanItem` and the like),
  and nothing loosens the security rules in `server/access/access.ts`.

**Order:** three betas, each tried on our board and Colby's for a few days before the next. The full release
comes after beta 3. The 1.4.0 photo work (several albums, 📷 Albums) stays out of this release.

## Progress
- **2026-11-26: walls download less** (part of 1). The Spanish dictionary loads only on Spanish screens, and
  the pages besides the board (jars, meals, pantry, reminders, timers, chores) load on their own. Screens that
  can open pages fetch them right after the board is up, so they open without a blank moment. A screen left
  over from before an update reloads instead of failing.
  - The wall's main file went from 180 KB to 147 KB compressed (555 KB to 459 KB uncompressed).
  - Still to split: Settings (wired into the page shell), and the editor and drawing tools inside the board.
- **Testing here:** `CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/real/chrome-linux64/chrome npx playwright test
  --trace off`, because the project's Playwright doesn't match the browser installed in this container.

---

## Beta 1: foundations and screens

### 1. Groundwork (first: everything else builds on it)
- **One way to store settings for each screen.**
  - Generalize what the Notes column does (`server/extras.ts`, `web/src/lib/notesCol.ts`): a board-wide
    default, each screen's own override, and the console editing any screen.
  - It then carries the arrows, swipe pages, return-to-calendar time, off hours and board style.
- **Walls don't load the editor.** The build has no code splitting today. Load the drawing tools, the picture
  library and the settings pages only where they're used (`lazy()` imports).
  - Done when a view-only wall's download is smaller, measured before and after.
- **Test in more browsers.** Add Firefox and WebKit to `playwright.config.ts`. Today it runs only Chromium.
- **A speed budget in CI.**
  - A size limit on the wall's code.
  - Close to 0% processor use with nothing changing, measured on the wall with the faked clock
    (`test/fakenow.mjs`).
- **Pause when nobody's looking.** Go through the 17 timers and animation loops in `web/src`, and stop each one
  while the page is hidden or the screen is off.
- **A `?perf` overlay** like the other `?` test switches: frame rate, memory, and what's being drawn.

### 2. Month arrows that fade, and a month picker
- **Arrows:** `NavBtn` in `web/src/board/Month.tsx`, with a setting for each screen: Always / Fade / Never.
  - Fade is the default on family screens: the arrows show after any tap and fade after about 10 s.
- **Month picker:** tapping the month name opens a 12-month grid with a year switcher.
  - Tapping the name currently reloads the page while editing (`Board.tsx:951`). The reload moves into ☰.
- **Done when:** with Never set, every month is still reachable. Tests cover the fade, the picker and the
  reload's new place.

### 3. Swiping between pages
- **Where:** today a swipe in `Board.tsx` (line 574) goes only to Chores.
- **The order:** Calendar → the screen's pinned pages, in pin order.
  - Nothing pinned = today's behavior (left goes to Chores).
  - View-only walls get a page list in the console → 📺 Screens.
- **The rest:**
  - It doesn't wrap around at the end.
  - Chalk dots fade in to show where you are.
  - Every page returns to the calendar after N quiet minutes, set for each screen.
- **Swipes that keep their own meaning:**
  - Swiping stays off in Draw / Decorate.
  - The Notes column's little switch, Split View and the slideshow keep their own swipes (the slideshow
    already changes photos).
  - Pages that scroll sideways take a swipe only from their edges.
- **Done when:** a test covers each of those cases.

### 4. Off hours (replaces the overnight slideshow)
- **Moving the existing setting over:** today's overnight window (`nightNow` in `Slideshow.tsx`) becomes
  window #1 with mode Slideshow, keeping its brightness and speed. A settings migration does this, and an
  existing board looks the same after updating.
- **Windows:** several, each on chosen days (for example weekdays 9–3).
- **Each window has a mode:** Slideshow · Night clock · Dimmed calendar · Black · Screen off.
- **Settings:** a board-wide default, each screen's own override, and a "🛏 Bedtime" preset for kids' tablets.
- **Screen off,** tried in this order:
  1. Fully Kiosk's `fully.turnScreenOff()` / `turnScreenOn()`.
  2. FreeKiosk's control API (to check: does it have screen on/off?).
  3. A Home Assistant action at the start and end of a window (`server/homeassistant.ts`).
  4. Stop asking Chrome to keep the screen awake (`web/src/lib/wallScreen.ts`), so the device's own sleep
     turns it off.
  5. Black.
- **Waking up:**
  - A tap shows the calendar for N minutes, as now.
  - Optionally, motion through Home Assistant or Fully Kiosk.
- **Night clock:** a big chalk clock, optionally with tomorrow's first event.
- **Good morning card:** the first tap after off hours shows the weather, today's events and the first routine
  for about 30 s.
- **Console:** a line for each screen showing how it turns its screen off, whether keeping it awake worked, and
  which window it's in now.
- **Screen care:**
  - Move everything by a pixel or two now and then (burn-in).
  - Reload if the page stops getting updates, and a quiet reload once a night during off hours.
- **Docs:** `docs/kiosk.md` (lines 72 and 83) says to set the device's screen sleep to 1–2 minutes, not never,
  and that keeping the screen awake needs HTTPS or `localhost`.
- **Done when:**
  - A test with the faked clock walks through a day of windows.
  - The board's work really stops while black or off.
  - Checked on Fully Kiosk, plain Chrome on a Pi, and Home Assistant.

### 5. Design checks (findings guide everything after this)
- **Screenshots** at 1080p, 1440p, 4K and on the Apolosign. List everything that looks soft.
- **A contrast check script:** every chalk and event color on every background (whiteboard and kraft paper
  especially).
- **Calmer motion:** follow the screen's "reduce motion" setting.
- **Tablet, console and phone:** buttons at least 44 px, labels for screen readers, visible keyboard focus.

---

## Beta 2: the chalk look

Built the way the mockups are: made once, kept, no live effects.

### 6. Board styles
- **Style:** Chalk marker (Tarin's) · Stick chalk · Clean (today's), in 🎨 Style. The style sets the grid, the
  writing and the default look for pictures.
- **Grid:** Printed (thin cream lines, serif day names, numbers in small boxes) or Hand-drawn (chalk-stamped
  lines on their own layer, drawn once per screen size).
- **Stick chalk:** one grain tile for the whole board, made at the screen's resolution and used as a mask over
  the whole chalk layer. It replaces the speckle tile in `web/src/board/Art.tsx` (`grain()`).
- **The board** (`web/src/lib/surface.ts`):
  - Its color: black, green, gray-blue or navy.
  - Gloss: none, soft or strong.
  - How used it looks: clean, lightly used or well used, made of eraser swipes, faint old writing and dust.
- **Chalk texture:** Light / Normal / Heavy / Off.

### 7. Looks for pictures
- **The looks:** As is · Chalk marker · Marker + highlight · Marker + white outline · Colored outline · Stick chalk.
- **How:** each picture is colored in once with short strokes, each taking its color from the original.
- **Kept, not redone:** the result is stored for each picture, look and size on the screen (in memory). It's
  shown straight from memory, so the security rules don't change.
- **GIFs** stay as they are.
- **Done when:** a wall with 30 pictures shows no slowdown on the Apolosign, measured with `?perf`.

### 8. Lettering
- **Styles** for the month title and big events: contrasting outline · white outline like a sticker · inline ·
  drop shadow · neon, each with marker streaks.
- **How:** it's all lettering with outlines (SVG), so it costs nothing to show.

### 9. Flight paths
- **Data:** strokes get one new setting, how they're dashed: `d: { style, gap }`, with style one of dash, dots,
  dashdot, hearts, line. It's added to `ArtItem` in `Art.tsx` and checked in `cleanItem` (`server/art.ts`).
- **Drawing:** each dash is laid down one at a time with a little variation, as in the mockup. Old boards
  without `d` draw as before.
- **A path pen** in the drawing tools, with style, color, thickness and spacing.
- **Attach to a picture:**
  - Tap a picture → **Add a path** → draw.
  - The picture is placed at the end, turned with `r` to face along the path and kept upright.
  - The two are added together with `g`, so they move as one.
- **Riders to start with:** bee, paper plane, butterfly.
- **Later, not 1.3.0:** a path from one picture to another, and paths that reshape when a picture moves.
- **Done when:** a path survives a reload and shows on the wall, and the server refuses a bad `d`.

### 10. Doodles and decorations
- **Doodle pictures:** flowers, bees, a heart, a star, a sun, a swirl, leaves, in her style, as a pack in the
  picture library. We draw them (no tracing of Tarin's), with a proper art pass.
- **Decorations:**
  - A ribbon banner behind the month.
  - A doodle frame around an event that spans days.
  - Curly and seasonal corners.
- **Small touches:**
  - A hand-drawn circle around a day, a squiggle under an event.
  - Stars and sparkles next to big days.
  - How neat the writing is, from neat to loose.

---

## Beta 3: kids and family

### 11. Routines on kids' tablets
- **Routines:** morning and bedtime steps in order, with times and picture icons. They build on chores
  (`server/chores.ts`, `shared/chores.ts`).
- **Picture chores** for kids who can't read yet.
- **Jars:** finished routines and chores add marbles automatically (`server/jars.ts`), with streaks
  ("5 mornings in a row ⭐").
- **Countdowns between activities:** "10 minutes until we leave", on the existing timers (`server/timers.ts`).
- **Done when:** a routine resets each day, its marbles land once (not twice when two screens tick it), and it
  works on a kid's tablet paired as one.

### 12. A kid's day
- **"My day" page:** just that kid's events, extra large.
- **"How many sleeps" countdown.**

### 13. Big-day mode
- **What it is:** for any starred event, and birthdays automatically.
- **What shows for the day:** a border, a giant name, confetti and a "🎂 Today" Notes page. The person's Immich
  photos come with 1.4.0.

### 14. Chalk notes from a phone
- **What it is:** write or draw a note on a phone, it shows on the wall and wipes itself after a day.
- **Rules:**
  - Signed-in people only.
  - Checked on the server like any other drawing.
  - A parent can remove any note.

---

## Alongside the release (not board code)
- **The demo:** in the browser, with sample data and no server, on GitHub Pages next to the docs.
- **Docs on the site,** with a "Try it" button.
- **Screenshots:** extend `test/docs-shots.ts` (it already makes the getting-started screenshots) to take the
  README's and the user guide's from the demo each release.
- **For the repo:** a description, topics and a social preview image.
- **Security:** see whether `script-src 'unsafe-inline'` can come out of the board page's rules
  (`server/access/access.ts:135`).

---

## Decisions still open
1. **FreeKiosk:** can it turn the screen off itself, or does that go through Home Assistant?
2. **Fonts:** which of the board's 63 fonts come closest to Tarin's lettering?
3. **Size:** if it runs long, beta 3 (kids and family) can ship as 1.3.1 without holding up the rest.
