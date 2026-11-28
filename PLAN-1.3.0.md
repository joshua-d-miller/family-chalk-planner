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

## What 1.3.0 holds (decided 2026-11-28)
- **All of it, as first planned:** the screens work (done), **the photos** (more albums, which album shows where,
  📷 Albums: done 2026-11-28), and **the chalk look** (beta 2 below: board styles, picture looks, lettering,
  flight paths, doodles: done 2026-11-28). 1.3.0 is released when the chalk look is done. Kids and family come after.
- **The demo** on the site comes with or right after it.

## Saturday: start here (before the release)
- **Betas 1 and 2 are combined** (decided 2026-11-26): one beta with the screens work and the chalk look.
  Kids and family stay a later beta (or 1.3.1).
- **Built (2026-11-28):** the board styles and the grain (6 below), picture looks (7), lettering (8), flight
  paths (9), doodles (10). Next: the pull request to `main`; merging it (version 1.3.0) publishes the release.
- **Left over from the screens work:** Home Assistant / FreeKiosk turning the screen off; a page list for walls
  in the console; the 2 quiet minutes set for each screen; Firefox + Safari tests and a speed budget in CI;
  `?perf`; the design checks (5).
- **Everything so far is on `claude/funny-hamilton-ajxqcw`**, each step tested (code checks, server tests, all
  browser tests). The left-over items above move to 1.3.1 unless they're done before the merge.

## Progress
- **2026-11-26: walls download less** (part of 1). The Spanish dictionary loads only on Spanish screens, and
  the pages besides the board (jars, meals, pantry, reminders, timers, chores) load on their own. Screens that
  can open pages fetch them right after the board is up, so they open without a blank moment. A screen left
  over from before an update reloads instead of failing.
  - Then the board's editors, picture library and drawing tools (`web/src/lib/later.tsx` loads a part on its
    own, and shows it straight away once it's here; a screen that edits fetches them ahead).
  - The wall's main file went from 180 KB to 128 KB compressed (555 KB to 396 KB uncompressed), 29% less.
  - Still to split: Settings (wired into the page shell).
  - The Home Assistant browser tests need a real Home Assistant, so they run in CI only.
- **2026-11-26: the month arrows can fade** (part of 2). On a family screen they fade after 10 quiet seconds
  and come back with any tap; ⚙️ Settings → This screen → The month arrows: Always there / Fade. Kept per
  screen with a new helper in `server/favorites.ts` (`screenSetting`: read, set, and the console's for any
  screen), which the next per-screen settings (swipe pages, off hours, board style) can use. The test fixture
  keeps its family screen at Always there, so a slow test can still tap the arrows.
  - Then the **month picker** (a tap on the month's name: year ‹ ›, 12 months, This month, ↻ Start the board
    again) and **None** for the arrows. The week keeps its arrows, and a tap on its title still reloads.
  - Still to do for 2: the console's control for a screen's arrows (the routes exist: `/api/devices/arrows`).
- **2026-11-26: swiping between pages** (part of 3). From the calendar a swipe to the left goes to the first
  pinned page (Chores when nothing's pinned), on through the pins, and a swipe to the right goes back, the last
  one to the calendar; it doesn't go round. A page opened from the menu doesn't swipe (as Chores before). Shared
  code: `web/src/lib/swipePages.ts`. A mouse swipe's selected words are cleared as the next swipe starts (else
  that swipe dragged them).
  - Then **every page swiped to goes back** to the calendar after 2 quiet minutes (it was Chores' alone).
  - Then **the chalk dots**: after a swipe, a row of dots (the calendar, then each page) with this one lit, fading
    after about 2 seconds; on the calendar too, swiped back to.
  - Still to do for 3: a page list for view-only walls (console), the
    2 minutes set for each screen, and checking pages that scroll sideways.
- **2026-11-26: what each screen does overnight** (first part of 4). In the board's existing overnight hours
  (⚙️ Settings → Photos & slideshow) each screen shows the slideshow (nothing picked: as before), the calendar
  dimmed, a black screen, or nothing; a tap shows the calendar for 5 minutes. ⚙️ Settings → This screen on a
  family screen, the admin console → 📺 Screens for any screen (the wall). Kept with `screenSetting('offhours')`.
  - Then **Turn the screen off (where it can)**: Fully Kiosk's `turnScreenOff` (and on again after); elsewhere the
    board stops keeping the screen awake, so the device's own sleep turns it off (black meanwhile). Under a black
    or turned-off screen, the moving weather and GIFs stop (the "asleep" switch, for what moves).
  - Then **days and more times**: the overnight hours on chosen days, and up to 3 more times with their own
    days (`web/src/board/night.ts`, with a unit test; past midnight belongs to the day it starts). Saved
    settings without days mean every day, as before.
  - Then **a night clock**: a sixth overnight choice, big and dim with the date, moved a little every 10
    minutes (burn-in); nothing else moves under it. (Tomorrow's first event on it: later, if wanted.)
  - Then **📡 Now** in the admin console → 📺 Screens: each paired screen says what it shows (the calendar, the
    slideshow, the night clock…) and whether it's kept awake (kept, refused: needs HTTPS, no way to ask, or let
    sleep for the night), when that changes and every 10 minutes. Kept in memory only.
  - Then **Good morning**: when the overnight hours end, the first tap shows today's events and the weather in
    the day's card for 30 seconds; a clear layer takes that tap, so it opens nothing else. (The first routine on
    it comes with routines, in beta 3.)
  - Then **a fresh start once a night**: a screen nobody's signed in on that's been up 20 hours reloads while
    it's asleep (not dimmed), only while it can reach the board (never into an error page). Reconnecting after
    the board restarts was already handled (the live connection retries, and a new version reloads).
  - Burn-in shift: left out for now. Wall tablets are LCD, the night clock already moves, and shifting the
    whole board by a pixel or two would blur its lines (it's laid out on the screen's own pixels).
  - Then **🌙 Overnight hours** got its own section in ⚙️ Settings (on or off, the times, the days, more
    times, and where each screen picks what it does then). Same saved settings, so nothing to move over.
  - Still to do for 4: the Good morning card, Home Assistant
    and FreeKiosk turning the screen off, pausing the slideshow's own timers and photo checks, and
    moving the overnight times out of the photo settings into an Off hours section (with the old ones moved
    over).
- **2026-11-28: audit before the pull request.** Fixed: a pinned 🗓️ Week was in the swipe order, so its own
  swipe and drawing clashed with the page swipe (Week is the calendar: it's left out now); a drag in a field,
  on a slider or in an open card counted as a swipe (now ignored); Good morning armed on a screen someone was
  using as the hours ended (now only on one that was asleep). Noted, not changed: the console's status list
  keeps unpaired screens until the server restarts (only paired ones are shown).
- **2026-11-28: board styles (6).** 🎨 Board style → Chalk: Clean / Chalk marker (gloss) / Stick chalk (the
  grain, a CSS mask over the calendar, Notes and art, Light/Normal/Heavy), the grid Printed / By hand (chalk
  lines on a layer), how used it looks (eraser swipes, faint ghosts, dust, in the background). All in
  `web/src/lib/chalk.ts`, made once; off on a low-power screen. Board color and gloss strength as separate
  choices: not done (the backgrounds already have colors; the marker board has one gloss).
- **2026-11-28: picture looks (7).** A picture's 🖍 Look (`lk`, checked on the server): Board style's, As is,
  Chalk marker, Marker + highlight, White outline, Colored outline, Stick chalk; the board style picks the usual
  (Chalk marker / Stick chalk). Drawn once per picture, look and size, one at a time when the screen is idle, kept
  as a blob (`web/src/lib/pictureLook.ts`); a moving GIF and a low-power screen show pictures as they are.
  - To tune on a real screen: Stick chalk on pictures is still a little blotchy (the grain's coarse part).
- **2026-11-28: lettering (8).** 🔤 Month title → Lettering (Outline as before, White outline with a gap, Inline,
  Drop shadow, Neon) and Marker streaks; CSS only (board.css), saved with the title (`l`, `s`). Big events'
  lettering: not done (they have their own large and extra-large writing).
- **2026-11-28: flight paths (9).** ✏️ Draw → **Path** (each tap: Dashes, Dots, Dash dot, Hearts, off) draws a
  stroke with `d` (checked on the server; an unknown one is a plain line). Drawn by `web/src/board/trail.ts`, mark
  by mark with a little variation, as SVG (sharp, seeded by where the line starts). A selected picture's **✈ Add a
  path**: draw it, and the picture lands at its end, turned along it and kept upright, grouped with it (`g`).
  Spacing is set by the line's size (no separate gap setting). Riders: any picture (bee, plane, butterfly are in
  the library already). Tested: test/trail.test.ts and the browser test "flight paths".
- **2026-11-28: doodles and decorations (10).** `clipart/doodles.py` draws 29 chalk doodles (`dd-`, the
  "Doodles" set and pack, CC0, not traced): flowers, bee, hearts, stars, sparkles, sun, cloud, swirl, leaves, a
  vine; circle, squiggle, underline, arrow (the small touches); two frames, three ribbon banners and five corners
  (curl, spring, fall, winter, Valentine's). The month's name can have a ribbon banner behind it (`b`, CSS mask,
  in the outline's color). Words can be written Neat, Loose or Very loose (`n`: each letter tipped and bobbing,
  SVG `rotate`/`dy`). A frame round a multi-day event is a picture placed and sized by hand (not tied to the
  event). Tested: smoke (the set), browser tests "doodles" and the title test (ribbon).
- **Timers and loops (part of 1):** checked all 17. Each is slow or stops by itself; the one fast one (250 ms)
  runs only while a timer counts down. Nothing to fix until off hours, which needs one "asleep" switch that the
  slideshow, weather, GIFs, Split View, title photos and Notes rotation respect while the screen is black. A
  **low-power screen** setting already exists (`boardfit` `low`: no moving weather, GIFs or fades, plainer
  chalk), and the chalk look must respect it.
- **Testing here:** `CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/real/chrome-linux64/chrome npx playwright test
  --trace off`, because the project's Playwright doesn't match the browser installed in this container.

## To check on the runners (real screens), once built
- **Fully Kiosk (the Apolosign):** Turn the screen off really switches it off overnight, and back on when the hours
  end.
- **Chrome on a Pi or a mini PC with a short screen sleep:** the screen goes to sleep overnight and stays awake
  in the daytime. Over plain `http://` it can't be kept awake: that screen should say so.
- **Touch:** the fading arrows (the first tap only brings them back), the month picker, swiping through the
  pinned pages and back, and the 7 day buttons in Settings on a phone (they may wrap onto two lines).
- **Older wall browsers (Chrome 100, Safari 15, Firefox 100):** pages and editors load on their own, with no blank
  moment when one opens.
- **The Home Assistant add-on:** its own browser tests (they need a real Home Assistant).
- **A real Immich (Colby's):** more albums, `person:` and `memories` albums, and videos (Videos too): that they
  copy, play in the slideshow on the wall (H.264 MP4s play in Chrome, Fully Kiosk and Safari), and move on when
  they end. The tests used a stand-in Immich and a WebM clip.
- **The chalk look on the Apolosign:** board styles (Stick chalk's grain and wear), picture looks (Stick chalk is
  still a little blotchy: tune `STICK` in `web/src/lib/pictureLook.ts`), lettering and the ribbon, flight paths
  drawn with a finger and a Pencil (dots on the thickest size may sit close), doodles at full size, and loose
  writing in a script font. A wall with 30 pictures in looks shows no slowdown (`?perf`).

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
  - **Where:** www.joshua-d-miller.com/projects/family-chalk-planner/demo/ (repo
    `joshua-d-miller/joshua-d-miller.github.io`, Eleventy, deploys from `master`). The planner's release attaches
    a `demo.zip`; the site's Pages workflow downloads the latest at each build. Nothing built is committed there.
  - **The site updates itself:** since 2026-11-28 (branch `claude/chalk-planner-latest` there) the project page's
    version comes from the latest release at build time, and the site rebuilds every night.
  - **How it's made:** record the real board's answers (with the test suite's sample calendar and album, and a
    made-up family) plus its fonts, icons and some clip art; a small stand-in in the browser answers from them,
    keeping what a visitor changes in memory (events, drawing, chores, meals, jars, settings).
  - **Each visitor has their own copy, and a reload resets it.** Nothing is sent anywhere or shared, so there's
    nothing to abuse, overload or pay for.
  - Off in the demo, with a short "Works on your own board" note: GIF links, searching the web for pictures,
    weather, calendar and photo connections, signing in, pairing and the admin console.
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
