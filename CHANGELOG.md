# Changelog

What changed in each release. `deploy/update.sh` installs the newest release; the notes for each
one also appear on the GitHub Releases page. Versions follow [semantic versioning](https://semver.org/)
(while below 1.0, a new minor version can change how things work).

## 1.2.0 — (in progress)
- **A new ☰ menu:** only for getting places. The pages are big tiles, easy to hit from across the kitchen;
  **press and hold** a tile to pin it to the bar (a small 📌 marks the pinned ones). The calendar's tools are a row
  of chips at the top of the drawer. At the bottom: **🖥️ This screen…** (the screen's menu, its look, sleeps or
  days and the rest, in ⚙️ Settings; a family screen too) and **↻ Reload**. Everything fits on a wall screen without
  scrolling.
- **The menu in the Notes column** (Colby Way's dock): another choice for a family screen's menu, beside the cork and
  the corner button. The ☰ and up to 3 buttons you pick sit in the last row of the Notes column, so nothing floats
  over the board: + Add event, ▶ Slideshow, 🗓️ Week / 📅 month, Decorate, a page (chores, meals, reminders, timers,
  pantry, jars) or Reload. Pick them in ⚙️ Settings → This screen.
- **Family screens do everything but freehand drawing:** a family screen can now set the month's title (🔤 Month
  title) and open ⚙️ Settings for the board's own parts (holidays, birthdays, photos and the slideshow, the Notes
  column, 🗓️ Week and This screen), without a parent signing in. The calendar and trash day stay the admin's, and
  freehand chalk and paint pens stay on phones and tablets, where they're accurate.
- **⚙️ Settings opens over the board** on a wall or family screen (and a computer), like every other card, with a
  ✕: the parts down the side and the one picked beside them, so closing it puts you back where you were. On a phone
  or tablet it's still a page. Checkboxes are on/off switches, and the slideshow's timing (5 to 120 seconds) and
  brightness are sliders. **🗓️ Week** has its own part (where the week starts), and **🖥️ This screen** now holds the
  screen's menu and its look of cards and menus too.
- **🗓️ Week from today:** a screen's Week can start on today and show the next 6 days, instead of starting on Sunday.
  Set it in **⚙️ Week** (in the Week page's tools, or ⚙️ Settings → Week), and for any screen (the wall too) in the
  admin console → 📺 Screens. The arrows go a week at a time from there, and a week that starts at the end of one
  month shows all its events.
  (Colby Way built this too, on his own board.)
- **🗓️ Split View** (Colby Way's idea): the week as a band across the top, so it no longer leaves a tall empty
  space, and one or two things under it, picked for each screen in ⚙️ Week: **photos** (the whole photo, centered and
  never stretched; swipe for the next or the last), **room to draw**, the **meal plan**, the **pantry**, the **reward
  jars**, **chores**, **reminders** or **up next**. The Notes column then shows the weather, trash day and
  countdowns. The admin console sets the wall's.
- **Fill the screen** (Colby Way's idea, for his 2K screen): the board is drawn about twice as wide as it is tall,
  so 16:9 and 16:10 screens had bands above and below. Turn on **Fill the screen** (⚙️ Settings → This screen, or
  🎨 Board style → Style → On this screen; the admin console sets the wall's) and the days get taller instead.
  Drawings and pictures move down with their days and keep their size, and anything drawn on a taller screen shows
  on the same day on every other screen.
- **The wooden frame is optional**, for each screen (🎨 Board style → Style → On this screen): a screen that sits in a
  frame of its own can leave it off.
- **The big jar** (from Colby Way's board): on a screen that edits, tap a reward jar in the Notes column and it opens
  big. Drop in a heart, rainbow, star, lightning bolt or critter, take one out, and when it's full, **★ Reward!**
  celebrates and empties it. A jar that fills up bursts into confetti.
- **Hide the − / + / Fit buttons** (from Colby Way's board): ⚙️ Settings → This screen, for a touch screen that never
  zooms. It's kept on the board, so a cleared browser keeps it.
- **A tap on the month's name reloads the board** (from Colby Way's board), on family screens and tablets. Not on
  the wall, and not while drawing.
- **Swipe the slideshow** (from Colby Way's board): right to left for the next photos, left to right to go back
  through the last ones, which helps with a big album. A swipe doesn't close the slideshow, and the next photos wait
  their full time after it.
- **A ✕ on every page**, at the top right like every card: back to the calendar (Colby Way's back button on
  Settings, for every page).
- **Two quick taps on ‹ or ›** on a family screen no longer turn on the photo frame (they were taken for a double
  tap on the calendar).

## 1.1.2 — A background for each month
- **Backgrounds are back in sight:** 🎨 Board style → Style shows the backgrounds whichever is picked above (they only
  showed after tapping Every month, so they seemed to have gone).
- **A background just for one month:** on **Just November**, pick a background for that month only (a photo of your
  own too); every other month keeps the board's. **Like every month** takes it away.

## 1.1.1 — The wall moves to a new day by itself
- **A new day, without a reload:** at midnight every screen now moves to the new day by itself: today's ring, Up
  next, the countdowns, and a new month on the 1st. Before, a quiet wall could stay on yesterday until someone
  reloaded it. A screen that was asleep (turned off overnight) also catches up as soon as it's on again.
- **No more pull-to-refresh:** a swipe down on a wall or touch screen no longer reloads the board in Chrome-based
  browsers. In Fully Kiosk, also turn off its own pull-to-refresh setting if it's on.
- **A family screen where someone is also signed in** now opens the board ready to edit, with the cork or ☰ and
  working month arrows. Before, it showed the wall's view-only board instead.
- **The wall** no longer shows month arrows that do nothing.
- **↻ Reload the board** in the ☰ menu (instead of pull-to-refresh).
- **The ☰ button's drawer** is sized to the screen: it took about a third of a smaller wall screen.
- **Tested the way Colby runs it:** Chrome in kiosk mode on Linux, on 1080p, 2K and 4K touch screens, on every change.

## 1.1.0 — Countdowns, looks and big photo albums
Nothing to do when updating. Two things are on from the start, and both can be turned off: the next countdown on the
overnight slideshow (⚙️ Settings → Photos), and kids' tablets counting down in sleeps (⚙️ Settings → This screen,
or the admin console → 📺 Screens).

- **Countdowns, made fun:**
  - A **picture** for each starred countdown (🎉 🎂 🎄 🏖️ ✈️ ⚽ and more), and a **badge on its day** ("🎉 5 days",
    "🎉 Today!").
  - **Kids' tablets** show the next countdown big above their chores, in **sleeps** ("5 sleeps to go"), with a
    **paper chain**: one link for each day left.
  - **It's today!** with a short burst of confetti on the day.
  - The **overnight slideshow** shows the next countdown in a corner, from 30 days out (Settings → Photos to turn
    it off).
  - **Sleeps or days**, per screen: Settings → This screen, or any screen in the admin console → 📺 Screens.
- **🎨 Look of cards and menus**, at the bottom of the ☰ menu and in Settings → This screen. Each screen picks a
  look for its cards, ☰ menu and Settings: **Chalk** (as before), **Light**, **Dark** or **High contrast**, plus an
  **accent color** for headings and what's picked, and **larger text** (Large or Larger) for reading from further
  away. It's saved on the board, so clearing the browser doesn't lose it. The calendar keeps its own style (🎨 Board
  style).
- **More backgrounds** (🎨 Board style → Style, Every month): navy and burgundy chalkboards, a felt letter board,
  brick, burlap, white barnwood and graph paper, plus **Your photo**: pick any photo and it becomes the background,
  dimmed so the writing stays readable.
- **🎨 Board style on tabs:** Style, Days, Events, Notes and Lines, instead of one long card to scroll through. Save
  and Cancel stay at the bottom, and a small dot marks a tab with changes of its own.
- **A ✕ to close every card**, at its top right, and on the ☰ menu. It stays at the top while a long card
  scrolls, so there's no scrolling down to Cancel or tapping outside the card. Like Cancel, it doesn't save.
- **Big photo albums** (like an Immich album with thousands of photos), in the admin console → ⚙️ Board → Photos:
  - **Which photos:** every photo, **only the ones you pick** (a new **Pick photos…** grid to tick them), or **a
    few at random**, new ones each day.
  - **Copies on the board:** a copy of every photo as before, or **only the last few shown** (5 unless you pick
    another number), so a giant album isn't copied onto the board. The rest are fetched from the album when they
    come up. If the album can't be reached, the last photo shown stands in, with a small **📷 Photos are offline**
    note.
- **Immich 3:** albums and Immich share links work with Immich 3, which no longer lists an album's photos with
  the album (the board reads them from its timeline, the way Immich's own album page does). Favorites, Everything and
  On this day now read every photo, not just the newest 250.
- **Check connections** (admin console → ⚙️ Board): reads the calendar, any extra calendars and calendar links, and
  the photo album right now and says what's wrong, with an optional real round trip (a test event added, read back
  and deleted).
- **"It's not you, it's them":** when the calendar can't be reached, the board looks at **Apple's System Status** (for
  iCloud) or **Google's Workspace Status Dashboard** and, if they report a calendar problem, says so instead of a bare
  error.
- **Admin console → 📺 Screens:** a paired screen's list now always shows 🧒 Kid's tablet. Before anyone is added
  in 🧹 Chores it's greyed out and says to add the family there first (it used to be missing, leaving only View
  only and Family).
- **Node.js 26:** the Docker image and the Home Assistant app run on Node.js 26, and **Update now** moves a Linux
  board installed from NodeSource up to it. A **32-bit Raspberry Pi OS** stays on Node.js 22 (the newest Node.js
  built for it), supported until April 30, 2027; the [install guide](docs/install.md#nodejs) says how to move to
  the 64-bit Raspberry Pi OS to keep getting updates after that.
- **Tested against real servers** on every change, with no accounts anywhere: a real CalDAV server (Radicale, the
  protocol iCloud uses) and a real, fresh Immich.

## 1.0.0 — Ready for everyone, and part of Home Assistant
The first public release. For Docker and Linux nothing changes for a board that's already running; this marks
the board as ready for other families to install and rely on.

**The Home Assistant app becomes part of Home Assistant:**

- **In the sidebar** (Family Board). Inside Home Assistant the board hides Home Assistant's sidebar while it's
  open (its ☰ button brings it back) and puts it back as it was afterwards. Wall screens still open the board's
  own address (port 3002) and are paired from the admin console.
- **Home Assistant logins:** its administrators are the board's admins; everyone else gets the role picked in
  the admin console (👪 People), or the default. No setup code, and the board's own sign-ins are off in the app.
- **Home Assistant's calendars** as the board's calendar: pick them in ⚙️ Board, one the main one for new
  events, the others in their own colors. Events are added, changed and deleted where Home Assistant allows it
  (a calendar that can only add and delete, like Home Assistant's Google calendars, is changed by deleting and
  adding again).
- **Home Assistant's to-do lists on the Chores page**, ticked off from the board straight into Home Assistant.
- Tested against a pretend Home Assistant on every change.

**Also, from the earlier releases:**

- **Four ways to run it**, each documented step by step: the **Home Assistant app**
  ([family-chalk-planner-ha](https://github.com/joshua-d-miller/family-chalk-planner-ha), installed, updated and
  backed up by Home Assistant), **Docker**, a **Debian/Ubuntu/Raspberry Pi/Proxmox** machine (updates itself), or a
  **rented cloud server** behind Cloudflare Access or Tailscale.
- **[Getting started](docs/getting-started.md)** from nothing to the calendar on the wall, and
  **[Calendars](docs/calendars.md)**: iCloud, Google, any CalDAV calendar, Outlook and calendar links.
- **Tested the way people use it:** a new family's first run in a real browser, calendar links from Outlook,
  Google and iCloud, the image as Docker and as the Home Assistant app, the install and update scripts, and every
  link in the docs, on every change.
- The docs no longer describe a private repository (the deploy-key setup is gone; installs that use one keep
  working). The README and Getting started say which way to run it: at home (Home Assistant, Docker or Linux) is
  simplest to keep safe.

**Updating from 0.x:** 1.0.0 is a new major version, so a board with **Install updates by themselves** waits for
you: admin console → ⚙️ Board → **Updates → Update now** (or `sudo deploy/update.sh`). Docker: `docker compose pull
&& docker compose up -d`. Home Assistant: **Update** on the app.

## 0.17.2 — A browser's saved sign-in no longer becomes the calendar's
- **Fixed:** in the admin console, a browser or password manager could fill the admin's own username and
  password into ⚙️ Board → Calendar without anyone noticing, and **Save and restart** then sent them to the
  calendar server ("The calendar server didn't accept that username and password"). Found testing the Home
  Assistant app. The calendar's username and password, the Google client secret and the Immich key are now
  only saved, and only used by **Find my calendars**, once someone has typed or pasted into them; password
  managers are also asked to leave them alone. The first-run browser test now checks this.
- Node's "SQLite is an experimental feature" note no longer opens every start in the log (Linux service and
  Docker/Home Assistant image).

## 0.17.1 — A Home Assistant app, and a getting-started guide
- **Home Assistant app:** [family-chalk-planner-ha](https://github.com/joshua-d-miller/family-chalk-planner-ha)
  runs the board as a Home Assistant app: install it from the app store, and Home Assistant updates it and
  includes it in its backups. The app is only a few files; it runs this project's own image and follows its
  releases by itself.
  - Images are also tagged with the plain version (`0.17.1`), which the app installs, and carry Home
    Assistant's labels.
  - Saving settings restarts the board inside the container (Home Assistant doesn't restart an app that
    stops); Docker installs get the same quicker restart.
  - The app's **Reset the admin** option, for a family locked out of the console; the console's Updates
    section says Home Assistant takes care of updates.
- **[Getting started](docs/getting-started.md):** one guide from nothing to the calendar on the wall, with a
  screenshot of every step. The README points to it, with each way to install side by side.
- New README screenshots, from a made-up family (made by `test/e2e/readme-shots.spec.ts`, so they can be
  taken again any time); the guide's by `test/docs-shots.ts`.
- The weather town's example in the console is "Your town".
- **[Calendars](docs/calendars.md):** which calendars work and how to connect each, including **Outlook and
  Microsoft 365** (shown read-only from a published calendar link) and where to find calendar links in Google
  and iCloud.
- **Smoke tests for what the guide promises:**
  - a brand-new board, done the way the guide says in a real browser: setup code, admin, calendar, Save and
    restart (through the container's start script), pairing the wall, the family's events on it
  - calendar links as Outlook (Windows time zone names), Google (UTC, a moved week) and iCloud publish them
  - the Docker image both ways it's run: as a plain container, and the way Home Assistant runs the app
    (labels, options, Reset the admin once, a restart after saved settings, a clean stop)
  - every link, picture and section the README and guides point to

## 0.17.0 — Pictures, reworked, and the ☰ button instead of the cork
- **⭐ Pictures, reworked** (Tarin's feedback: hard to get to, odd-looking on the board, not much
  there):
  - **One search for everything:** the box at the top always looks through every picture, about
    22,000 of them, and shows each thing once with its other looks behind **+3**. No style or
    group to pick first. It knows everyday words ("turkey" is the bird, not the flag; "pumpkin"
    finds the jack-o'-lantern).
  - **Packs:** Thanksgiving, Fall leaves, Halloween, Christmas, Garland & lights, Winter,
    Valentine's Day, St. Patrick's Day, Easter & spring, Summer, Fourth of July, Back to school,
    Birthdays & parties, Sports & activities, Animals & pets, Food, Weather and Around the house,
    about 600 hand-picked pictures. This month's packs come first.
  - **Favorites:** ★ on any picture pins it, for every screen; your saved designs are there too.
  - **More pictures:** the chalk drawings go from 119 to about 3,200 (weapons, gore and scary or
    grown-up ones left out), plus weather pictures (Meteocons) and detailed food (Iconito).
  - **Real clipart, no account:** 783 pictures from the public-domain Openclipart collection (animals,
    food, holidays, people, plants, sports, vehicles...), picked to suit a family board and look right
    on it, searchable by their own words and in the packs. In the repository
    (`clipart/openclipart.json.gz`, made by `clipart/openclipart.py` from Debian's
    `openclipart-svg`), so they work offline.
  - **🌐 Look on the web:** under the search results, one tap looks for public-domain illustrations
    on Openverse (no account, nothing to set up). Only when tapped, so the board stays well within
    Openverse's limits. A picture placed is copied onto the board, so it stays if the site changes.
  - **Shows on the board:** OpenMoji's and IconPark's black outlines are drawn in chalk white.
  - **Quicker to reach:** **⭐ Pictures** sits next to Draw / Decorate (two taps from the
    calendar). No size to pick first: a picture is picked after it goes up, to resize it there.
  - Emoji, Find more and the size buttons are gone (the same pictures are in the search and the
    packs).
- **The ☰ button:** a family screen or a computer can swap the cork along the bottom for a round ☰
  button floating in a bottom corner (Colby's idea). It slides a drawer out from that side: **+ Add
  event** and the calendar's tools (Decorate, Month title, Border, Photos, Notes, Style) at the top,
  then the pages. The calendar gets the cork's room and doesn't shrink for the button.
- **Either side:** ☰ Menu → **This screen's menu** at the bottom: *Cork along the bottom*, *Button,
  drawer on the right* or *Button, drawer on the left*. Each screen keeps its own choice, saved on the
  board (clearing the browser doesn't lose it), so the kitchen can keep the cork while another screen
  uses the button. Phones and tablets keep their tab bar.
- On the right, the button sits over the bottom of the Notes column, whose list stops above it; the
  "can't reach the board" note moves to the other corner.
- **✏️ Draw beside the ☰ (if the screen wants it):** ☰ Menu → This screen's menu → *Draw button beside
  ☰* adds a round ✏️ next to the ☰; without it, ✏️ Draw / Decorate is in the drawer.
- **Drawing with the button:** the drawing tools pop over just above the buttons, and ✏️ Done takes the
  ☰'s corner. 🎨 hides the tools to draw underneath them and brings them back. Nothing goes down the
  side, and the calendar never moves.

## 0.16.2 — the garland in Clipart
- Fixed: the **Garland & trims** pictures were hard to find in ★ Stamps → Clipart (only under their
  style, and even there mostly missing). They're now a **🎄 Garland & trims** group right after
  Favorites, searching "garland", "lights" or "wreath" finds them, and the Garland & trims style shows
  all 46.

## 0.16.1 — a month's own style
- **A month's own style:** 🎨 Style now opens on **Just December** (whichever month you're on), so a
  change can't reach every month by accident. A month can have a **style of its own** (Holiday for
  December while the rest stay as they are), and its own fonts and lines as well as colors. **Every
  month** is a tap away for the board style and the background.
- Fixed: the **✨ Twinkling lights** and **🎀 Holly & bows** borders didn't show up in 🖼 Border (their
  pictures weren't in the list the border looks in).

## 0.16.0 — garland, turning and a month's own colors
- **A month's own colors:** 🎨 Style has **Every month** and **Colors just for November** (whichever
  month you're on). Pick the day boxes' lines, the day numbers, today's mark and the other colors just for
  this month; everything else comes from the board style. **Like every month** takes them away again.
- **Garland & trims:** 46 Christmas pictures drawn for the board, in Stamps:
  - garlands: lights, pine with ornaments, holly, gold tinsel, beads, bunting and a candy-cane swag, and
    a string of lights
  - **twinkling** (they animate on every screen): a garland of lights, a string of lights, a star, a
    candle, and single bulbs in six colors (purple too)
  - a tree, a star, three snowflakes, a wreath, holly, a pine sprig, a poinsettia, ornaments (red, gold,
    blue, striped), a bow, a stocking, a candy cane, mistletoe, a present, a gift tag, a Santa hat,
    mittens, hot cocoa, jingle bells, a snowman, a reindeer, a gingerbread man, a sugar cookie and a North
    Pole sign

  Garlands go up long and thin (240 wide), for along the top or bottom of the calendar. Search
  "garland", "lights", "twinkle", "snowflake", "ornament" or "wreath".
- **✨ Twinkling lights border:** a string of red, gold, green, blue, pink and purple bulbs on a wire all the way around the calendar,
  each bulb pointing out and twinkling at its own pace. Also a new 🎀 Holly & bows border.
- **Turning:** in Select, drag the blue handle above what's picked to turn it (it snaps to straight), or
  use ↺ ↻ to turn 15° at a time. Clipart, stamps, words and drawings all turn.
- Fixed: on a family screen the cork jumped a little going from the calendar to a page (Chores, Pantry...)
  and back. On a screen the board doesn't fill exactly, the calendar's cork sits a little above the
  bottom or in from the sides; the pages' cork now goes in exactly the same place, buttons and all.
- **Birthdays:** a 🎂 on birthdays is now a setting, off unless turned on (⚙️ Settings → Birthdays). So is
  counting down to every birthday: with it off, a birthday counts down only when it's starred for a
  countdown, like any other event.

## 0.15.1 — the month stays up, and art that knows about events
- **Art over events:** when a piece of art (a stamp, clipart, words, a drawing) blanks out events, the
  board asks once while decorating: **Hide them** (the art wins and those events disappear from the
  board under it) or **Keep showing them** (the art sits behind the writing). Art that only touches the
  writing, like a pumpkin in a day's corner or a chalk circle around an event, never asks. Picking the
  piece later in Select can change its mind. Hidden events are still in the calendar: tapping the day,
  Up next and the countdowns still show them, and saving an event that lands under art says so.
- Art over the grid's leftover days (the next or last month's, at the start and end of the month)
  hides their events by itself, no question asked.
- Fixed: when the calendar couldn't be reached (iCloud or Google slow or down, a changed password), the
  board showed no month at all, just the Notes column and the art. Now the month always shows, with a
  note at the bottom that the calendar can't be reached right now, and it catches up by itself once the
  calendar answers again.
- **A saved copy of the calendar:** every calendar the board shows (iCloud and other CalDAV calendars,
  Google, more calendars on the account, calendar links) keeps its last good copy of each month in the
  board's database, like the photos keep theirs. When one can't be reached, the board shows that copy:
  after a restart or an update too. (Changing the calendar or the account forgets the old copies.)
- The server log now says when the calendar can't be reached, and when it's back. When iCloud won't open
  the photo album, the message says iCloud may be down (it used to only say the album isn't shared).
- **New guide: [docs/cloud.md](docs/cloud.md).** No server at home? Run the board on a small cloud server (or
  any always-on machine at home) and reach it through a free Cloudflare Tunnel, with Cloudflare Access in front.

## 0.15.0 — a week at a time
- **🗓️ Week:** a new page (in ☰ Menu or More, and you can pin it) that shows just this week, in the
  whole height of the board with bigger writing; the arrows go a week at a time. 📅 Calendar stays the
  month. Each week has its own drawings and stamps (Decorate works there), separate from the month's. A
  wall can show the week too: open the board's address with `/week`.
- **Up next is back:** the bottom of the Notes column has its little switch again (🫙 jars, ☀️ today,
  📅 up next, 📷 photos; tap it or swipe across), as the board had before 0.13. It goes back to the
  chosen one after 3 minutes.
- **Per screen:** 🗒️ Notes on the cork picks what the bottom of the Notes column shows on that screen
  and what its switch can flip to (tick just one for no switch). The wall's is set in the admin
  console, under 📺 Screens.
- **Regular fonts:** a new Regular group with plain serif and sans fonts: Times (Tinos), Baskerville,
  Merriweather, Lora, Garamond, Crimson Text, Playfair, Arial (Arimo), Open Sans, Lato, Nunito and
  Roboto. 63 fonts in all.
- **The cork:** smaller buttons that stay on the cork instead of reaching up into the board, and pinned
  pages wear a big push pin you can actually see.
- Fixed: a family screen could get stuck on a sign-in card (Photos → the overnight slideshow's
  ⚙️ Settings link): Settings needs a parent signed in. The Photos card now says where to find it, and
  a screen that lands on a page it can't open keeps its cork and gets ← Back to the calendar.
- Fixed: picking things further down a card (fonts in 🎨 Style) could jump the card back to the top.
  A card now closes only on a tap outside it, not a drag that ends there.
- The "ResizeObserver loop" browser notice is no longer logged as a screen crash in 🛡 Activity (it was
  harmless), and the two places that caused it now wait a frame.

## 0.14.2 — the iPad's tab bar
- Fixed: on an iPad the tab bar could sit over the cork under the board, making its buttons hard to tap.
  The board now fits into the part of the screen Safari really shows, with a little room above the tab
  bar. While drawing or zoomed in, the tab bar shrinks to one small 📅 button in the corner (tap it for
  the pages), like the bars in iOS and Android apps that tuck away while you work.
- The browser tests take about half as long: they wait for a screen to finish loading instead of a fixed
  second, run two at a time, and CI keeps its copy of the browser between runs.
- Releasing is one step: merging a pull request that raises the version tags and publishes it, with no
  tag to make and push by hand.

## 0.14.1 — clipart that stays put
- Fixed: clipart placed on the board disappeared. The screen sent the picture's full address and the
  board only keeps its own path, so it didn't save it; it now saves either. Anything the board can't
  save now comes off again with "Couldn't add that", instead of staying on that one screen until a reload.
- Fixed: on a family screen the cork changed size when switching between the calendar and the other pages
  (and on some screens while a page scrolled). The pages' cork is now drawn exactly as big as the
  calendar's.

## 0.14.0 — the bar at the bottom, more fonts and clipart
- **Pages switch in place:** going between the calendar and the other pages no longer loads a new page.
  The bar at the bottom stays put and only the middle changes; back, forward and reloading still work.
- **Family screens (and computers):** the cork is on every page: **☰ Menu**, **📅 Calendar** and up to
  3 **📌 pinned** pages, with the page you're on ringed in pink. On the calendar, **✏️ Edit the calendar**
  slides the tools out along the cork (✏️ Draw, 🔤 Month title, 🖼️ Border, 📷 Photos, 🎨 Style) until
  **✕ Done**; **+ Add event** is always there. On the other pages, the cork ends with that page's own
  button (+ Meal, ✎ Change the list...).
- **Phones and tablets:** the pages are in a tab bar like the phone's own apps (Liquid Glass on an iPhone
  or iPad, Material on Android): 📅 Calendar, your 3 pins and **More** (every page, pinning, the admin
  console, signing out). The ☰ button at the top is gone, and the cork under the board is just its tools,
  with their names.
- **43 new fonts** for month titles, words on the board and the board style, picked from groups:
  Handwritten (Patrick Hand, Gochi Hand, Indie Flower…), Chalk & sketch (Cabin Sketch, Love Ya Like A
  Sister…), Script (Sacramento, Great Vibes, Lobster…), Bold & bubbly (Chewy, Luckiest Guy, Fredoka…) and
  Holidays (Creepster, Mountains of Christmas, Emilys Candy…). Served by the board, so they work offline.
- **7 more clipart styles** in Stamps, about 20,000 more pictures: Streamline, Noto, OpenMoji, Twitter,
  Firefox, EmojiOne and IconPark. Pick a style (or **All styles** to see every version side by side); the
  groups and search work in each. The board unpacks them once, the first time it starts (a minute or so).
- **📌 Pin** a page from ☰ Menu or More: pins belong to the person signed in, or to the screen when
  nobody is (up to 3, as ☆ favorites were up to 4).
- The ☰ menu's headings are hand-lettered in pink like the rest of the board, and its one **📅 Calendar**
  entry takes each screen to its own board ("The board" and "Edit the board" are gone).
- **A screen that crashes says so** instead of going blank, with Reload and Back to the board, and the
  error shows in the admin console (🛡 Activity) and the server log.
- Security: the lint tools' copy of minimatch is updated past a denial-of-service bug (GHSA-g3hv-75wg-m249).
  It's only used while developing; boards never run it.
- Fixed: on the tablet, 📷 (the photos beside the month name) could open a blank page for a month whose
  photos were set by an older board.

## 0.13.1 — upgrading from 0.12
- **Upgrading a server install from 0.12:** run `sudo bash deploy/update.sh` **twice**. The first run
  (0.12's updater) brings the new version; the second (the new one) adds the new screens and turns
  on Update now and the nightly check. Until then the board shows the screens as they were, so nothing
  goes blank. Docker installs only need the new image.
- Fixed: the 0.13.0 release didn't publish (its tests ran before the screens were built).

## 0.13.0 — the board rebuilt
- **New screens everywhere:** the wall, the tablet, family screens, chores and every page are rebuilt
  (React + TypeScript). They look and work the same, and they're sharp on a 4K wall. The board as it
  was is kept at **/classic** (and /classic/edit) for a while, in case something's missing.
- **Pages of their own**, from the ☰ menu: meal plan, reminders, timers, pantry, reward jars, chores
  and ⚙️ Settings. ☆ keeps up to 4 of them on the tablet's strip.
- **From Colby Way's board:** reminders (they pop up when their time comes), timers shared by every
  screen, a pantry list, several Google calendars at once, Immich photos and "on this day", a
  slideshow with today's weather, events and reminders (on a card, or in a panel beside the photos),
  choosing what's in the right-hand column, a filled-in square for today, and a frame around the
  board.
- **Tablet:** pinch to zoom (or − / + / Fit); the drawing tools, stamps, GIFs and "Find more" as
  before; jars are added and changed on the jars page.
- **Updates:** ⚙️ Board in the admin console has **Update now**, and updates can run by themselves
  overnight. The database is backed up first, and an update that doesn't come up healthy is undone,
  database included.
- **Home sign-in** (optional): at home, on the board's own Wi-Fi, signing in on a tablet needs only the
  password.
- **Emoji** show on every screen: screens without emoji of their own get the board's.
- **Safer pages:** the new screens run no inline scripts at all, and the browser is told so; the
  board as it was (/classic) keeps the rules it had.
- **For contributors:** every code file opens with a header (what it's for, who wrote it, its
  changelog) and each part is titled and described. See "Comments" in CONTRIBUTING.md.
- Fixed: a phone on /chores could get the night slideshow over the chores.
- Fixed: an event added for a time the clocks skip (2:30 on the night they spring forward) was put at
  1:30; it's now at 3:30, as calendar apps do.

## 0.12.2 — hide holidays you don't want
- **Holidays:** tap a holiday on the calendar (tablet or family screen) for the list of the board's
  holidays. Tap one to hide it from the calendar and the countdowns, every year; tap again to bring it back.
  The same list is in ⚙️ Settings → Holidays, for when no holiday is showing to tap. ⚙️ Settings now
  shows for everyone signed in on a tablet: editors see Holidays; the calendar, trash and Notes settings
  stay with admins.
- Fixed: tapping an event in a day's list (tap a day → its events) did nothing on the tablet since 0.6.0;
  it opens the event again.

## 0.12.1 — borders keep the art on its day; title photos are back
- Fixed: adding a holiday border to a month that already had drawings, stamps or words left them where
  they were while the days moved in, so they ended up on the wrong spot. Art on the calendar now moves
  and shrinks with the days (and back when the border comes off or changes size). The first tablet or
  family screen that shows the month saves the move for everyone.
- Fixed: an extra-large month title in a tall font (Pacifico with an outline) was cut off at the top of
  the board. It's now shrunk just enough to fit and kept off the edge.
- Fixed: the photos beside the month name stopped showing in 0.11.0 (on every month, border or not).
- **✎ Month title** and **🖼 Border** moved from beside the month name to the strip at the bottom, so
  both sides of the title are free for photos or drawing. New **Title photos** switch there turns this
  month's photos off (room to draw) or back on; photos you picked are kept for when they come back.

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
