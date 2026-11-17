# User guide

The wall display only shows the board; everything is edited from a tablet or phone at `/edit`, where each person signs in (passkey, or password + authenticator code) and signs in again every 60 days. Screens are paired and people are invited from the admin console at `/admin` — see [install.md](install.md#screens-and-people). Add `/edit` to the tablet's home screen for an app-like icon.

## The tablet (editor)

**Getting around.** On a family touch screen the cork at the bottom is on every page: **☰ Menu** (every page and Settings), **📅 Calendar**, and up to 3 pages pinned with 📌 in the menu (they wear a big push pin); the page you're on has a pink ring. On the calendar, **✏️ Edit the calendar** slides out the tools (**✏️ Draw**, **🔤 Month title**, **🖼️ Border**, **📷 Photos**, **🗒️ Notes**, **🎨 Style**) until **✕ Done**, and **+ Add event** is always there. On a phone or tablet the pages are in the tab bar at the bottom (📅 Calendar, your pins and **More**), and the cork under the board has the tools. Zoom with **− / + / Fit** at the top right (or pinch). Everything saved shows on the wall within a second or two.

### More than one calendar
The admin can add **more calendars from the same account** (kids' activities, work) and **read-only calendar links** (school, a sports team) in the admin console → ⚙️ Board. Each shows in its own color. Events from the extra calendars can be changed like any other; new events go to the main calendar. Events from links are read-only: tapping one shows that day with the calendar's name.

### Events (your calendar)
- **Tap a day:** if it has events, you see them all in a list with **Add** at the bottom; an empty day goes straight to adding one.
- **Add:** tap **+ Add event** (or tap a day). Pick what, day, time and length, or tick **All day** (with an optional **Through** date for multi-day events like trips).
- **Change or delete:** tap the event on the board (or tap the day to see its full list). For repeating events, choose **Just this one** or **All of them** before saving or deleting.
- **Size on the board:** **Normal**, **Large** or **Extra large** — make a birthday or a big day stand out. Like the color, it's only on the board (your calendar never sees it), and for a repeating event it follows **Just this one / All of them**. Extra large wraps onto two lines; if the day has more, they're under **+N more**.
- **⭐ Count down to this:** adds the event to the countdown list in Notes, and puts a badge on its day ("🎉 5 days").
  Pick a picture for it right under the tick: it's on the badge and the big countdown card.
- Long event names wrap onto a second line when the day has room; when a day is full they shorten but keep the time.
- **Color on the board:** pick a color for the event. Colors that would be hard to read on the board's background are adjusted automatically (same hue). It's board-only (your calendar never sees it). The dashed circle means "use the board style's normal color". For repeating events it follows Just this one / All of them.
- Adds, edits and deletes go to your real calendar (iCloud, Google, Nextcloud, …), so they show on everyone's phones too.

### 🗓️ Week
**🗓️ Week** (in ☰ Menu or More; pin it with 📌 to keep it on the cork or tab bar) shows just this week, in the whole height of the board with bigger writing — handy when the days are busy. The arrows go a week at a time; **📅 Calendar** is still the month. Each week has its own drawings and stamps: **Draw / Decorate** on the Week page decorates that week, and the month's art stays with the month. A wall can show the week instead of the month: open the board's address followed by `/week` (for example `https://chalkboard.example.com/week`) in its kiosk browser.

### 🗒️ The bottom of Notes, per screen
**🗒️ Notes** on the cork picks what the bottom of the Notes column shows **on this screen** (🫙 jars, ☀️ today, 📅 up next or 📷 photos) and what its little switch can flip to. Tick just one for no switch; **Like the rest of the board** goes back to the board's choice. The wall can't change anything, so its choice is in the admin console: **📺 Screens → Bottom of Notes** on its row.

### Automatic on the calendar (nothing to do)
- **Birthdays:** ⚙️ Settings → **Birthdays** can put a 🎂 on birthdays (events with "birthday" or "bday" in their name) and count down to every one in Notes. Both are off to start; a birthday you star for a countdown always counts down.
- **US holidays** appear in light blue italics with an icon (board only, never written to your calendar). **Tap a holiday** to see the whole list and hide the ones you don't want (every year, from the calendar and the countdowns); tap a hidden one to bring it back. Family screens can do this too. When no holiday is showing to tap, open the same list from ⚙️ Settings → **Holidays** (everyone signed in on a tablet has ⚙️; the calendar, trash and Notes settings in it are for admins).
- **Countdowns** in Notes: the next 3 things within 60 days — big holidays, any event with "birthday" or "bday" in the title (🎂), and anything ticked ⭐.
- **Countdowns for the kids:** a kid's tablet shows the next countdown big above their chores, in **sleeps** ("5 sleeps
  to go"), with a **paper chain** under it: one link for each day left, so one comes off every morning. On the day it
  says **It's today!** with a burst of confetti. The overnight slideshow shows the next one in a corner from 30 days
  out (⚙️ Settings → Photos to turn it off).
- **Sleeps or days:** kids' tablets count sleeps, everything else counts days. Change it for one screen in ⚙️
  Settings → **This screen**, or for any screen (the wall too) in the admin console → 📺 Screens.
- **Trash / recycling** labels on the right days (set in ⚙️ Settings), and **weather** (today / tomorrow) in Notes.

### Drawing and decorating (tap **Draw**)
- **Chalk** or **Posca** marker, color dots (rainbow **+** for any color; recent custom colors are remembered), and the dot button for size.
- **Aa** writes typed text in a choice of fonts.
- **Select** (dashed square): drag around anything to select it, then press and drag to move it. The bar that appears has **★ Save as stamp**, **🎨 Color** (line and fill), **− / +** (smaller / bigger), **Copy**, **Erase**, and **✕** to finish. Or drag the **pink dot** at the corner to resize freely (works on clipart, stamps, GIFs, text and drawings).
- **⭐ Pictures:** tap **⭐ Pictures** next to Draw / Decorate (or **Pictures** in the drawing tools). One search box at the top always looks through **every picture** the board has, about 22,000 (Fluent, Noto, Twitter, Streamline, EmojiOne, Firefox and OpenMoji emoji, weather, food, about 780 pictures of real clipart from Openclipart, the board's own garland and about 3,200 chalk drawings), each thing once with its other looks behind **+3**. Searching knows everyday words: "turkey" finds the bird, "pumpkin" the jack-o'-lantern. Below the search: **Favorites** (pictures pinned with **★**, for every screen, and your saved designs), then the **packs** (this month's first: Thanksgiving, Fall leaves, Halloween, Christmas, Garland & lights, Winter, Valentine's Day, St. Patrick's Day, Easter & spring, Summer, Fourth of July, Back to school, Birthdays & parties, Sports & activities, Animals & pets, Food, Weather, Around the house), and **Moving pictures**. Chalk drawings come in any color you pick above them. Tap a picture, then tap the board where it goes; it's picked afterwards, so drag its corner (or tap − / +) to resize. Everything works offline. Not finding it? Under the results, **🌐 Look on the web** searches public-domain illustrations on Openverse (no account needed); a picture you place is copied onto the board. **Moving pictures** has your own GIFs, **GIFs from a link**, and animated emoji. To add one from GIPHY, Tenor, KLIPY or any site: on the GIF tap Share → Copy link (or press and hold → Copy), paste it there and tap **Add**. The board downloads its own copy, so it keeps working even if that site changes or goes away. Each GIF can play **gently** (now and then), **always**, or stay **still**.
- **Eraser**, **Undo / Redo**, and the trash can to **wipe this month's art**.
- The drawing covers the whole board, so you can write or draw across several days ("Grandma visiting" over a week) or anywhere in the margins.
- Art is saved per month, so each month starts fresh.

### Turning things
In Select, pick something (clipart, a stamp, words or a drawing) and drag the **blue handle** above it to turn it; it snaps to straight. **↺ ↻** in the bar turn it 15° at a time.

### Christmas garland
Pictures has a **Garland & lights** pack: garlands (lights, pine, holly, tinsel, beads, bunting, candy cane), a string of lights, a tree, snowflakes, a wreath, ornaments, a poinsettia, a Santa hat, a snowman, a reindeer, hot cocoa and more. The lights, a star and a candle **twinkle**. Garlands go up long and thin, for along the top or bottom of the calendar. Search "garland", "lights", "twinkle", "snowflake", "ornament" or "wreath". For lights all the way around the calendar, pick the **✨ Twinkling lights** border.

### Art over events
When a stamp, clipart, words or a drawing blanks out events, the board asks once while you decorate: **Hide them** (the art wins: those events don't show on the board under it) or **Keep showing them** (the art sits behind the writing, and the events read on top). Art that only touches the writing (a pumpkin in the corner of a day, a chalk circle around an event) never asks. To change your mind later, pick the piece in Select: the note at the bottom offers the other choice. Hidden events are still in your calendar: tap the day to see everything on it, and they still count in Up next and the countdowns. Art over the leftover days at the start or end of the month (the next or last month's) hides their events without asking.

### Month title
- Tap **🔤 Month title** on the cork at the bottom (on a family screen, after **✏️ Edit the calendar**). **Typed:** choose a font (63 of them, in groups: Handwritten, Regular — plain serif and sans like Times and Arial —, Chalk & sketch, Script, Bold & bubbly and Holidays — Creepster for October, Mountains of Christmas for December…), color, outline and size (**S, M, L** or **XL** — in tall fonts like Pacifico, XL is made just small enough to fit above the calendar); tick **Use this style for every month** to make it the default. **I'll hand-letter it:** hides the typed title so you can draw your own.

### 🖼 Holiday border
- Tap **🖼️ Border** on the cork at the bottom to put a border of pictures around the calendar for the month you're looking at.
- Start from a ready-made set (**Halloween**, **Thanksgiving**, **Christmas**, **Winter**, **Valentine's**, **St. Patrick's**, **Easter**, **Spring**, **Fireworks**, **Summer**, **Birthday**, **Back to school**), then tap a picture to take it out, or search to add your own — up to 8, repeated around the edge. Pick the color for the chalk drawings and the size (Small, Medium, Large). The board shows it as you go; **Cancel** puts it back.
- **Every year in October** (ticked by default) brings it back each year. Untick it to make it just for this year; **No border** with it unticked turns the border off for this year only.
- The days get a little smaller to make room, and everything drawn on the calendar (drawings, stamps, clipart, words) moves and shrinks with them, so it stays on the same day. Turning the border off or changing its size moves it back. Things beside the calendar (the title, the Notes column) stay where they are. A tablet or family screen does the moving the first time it shows the month.
- Family screens can set borders too.

### Meal Plan
- Tap **Meal Plan** in Notes. Add meals (Enter adds the next line), tick ones that are done (they get crossed out), **Clear all** for a new week. A long list shrinks to fit, then ends with "+N more".

### ⚙️ Settings
- Shown to admins signed in to the admin console (it asks again after 30 quiet minutes). **🛠 Admin console** opens `/admin` for screens and people.
- **Calendar:** shows which calendar the board uses. With Google Calendar this is where you sign in and pick the calendar (see [google-calendar.md](google-calendar.md)).
- **Trash & recycling:** the trash pickup day (or none), and recycling **same day as trash**, **every other week** (pick the date of the next pickup), **a different day each week**, or **don't show**. Saved as soon as you change it.
- **Bottom of the Notes column:** what it shows normally: **🫙 Reward jars**, **☀️ Today** (everything still to come today), **📅 Up next** (the next events over two weeks, grouped by day), **📷 Photos** (a polaroid from the album that changes every 40 seconds — nice when the month title has art instead of photos), or **Nothing** (the Meal Plan gets the space).

### Reward jars (optional, up to 4)
- **Add a jar:** the small dashed **+** above the jars (or **+ Reward jar** when there are none). **Remove** is on each jar's card. With no jars, the jar area disappears and the Meal Plan gets the space; with 3–4 jars they shrink to fit one row.
- Tap a jar: **+** adds the next piece in turn (it drops in on the wall) and **−** takes out the last one added. **Add a…** has a big button for every kind of piece (star, heart, rainbow, lightning, critter), so a kid can ask for exactly the one they want ("a rainbow, please!"). The jar remembers every piece in the order it went in. Change the **name**, the **goal**, and **what + adds, in turn** (tap the icons). **🎉 Reward!** celebrates and empties it.

### 🎨 Board style
- **Just this month / Every month:** the switch at the top. It opens on **Just November** (the month you're on), so a change can't reach every month by accident: pick a style just for this month (Holiday for December, say), and its own fonts, colors and lines; every other month keeps the board style. **Like every month** takes this month's away. Tap **Every month** to change the board style itself and the background (the background is always the same for every month).
- **Background:** black slate, green or blue chalkboard, cork, kraft paper, whiteboard, dark wood, black glass, linen paper or pegboard. Changing it keeps your look and colors; a color only changes where it would be hard to read on that background (lighter on dark ones, darker on light ones, same hue) — that goes for the drawings and stamps too, without changing what's saved, so switching back brings the original colors back.
- **Change with the season** (off unless you turn it on): adds a faint pattern over the background for the month shown — snowflakes in winter, blossoms in spring, suns in summer, leaves in autumn, hearts in February, pumpkins in October (seasons flip south of the equator, using the weather location).
- **Presets:** Classic (the original look), Pastel, Bold, Simple, Autumn, Winter, Holiday, Scrawl.
- **Tweaks** under the presets: font and color for day numbers, weekday names, events, headings and Notes text; all-day and holiday colors; separate colors for "Notes" and "Meal Plan"; show/hide number boxes; the **today marker** (chalk ring, circle, heart, star or filled box) and its color; **calendar lines** (color, solid/dashed/dotted, thin/normal/bold).
- The board changes as you tap. **Save** sends it to the wall, **Cancel** puts it back, **Undo my tweaks** returns to the plain preset. Picking a different preset clears tweaks (it asks first).
- The month title keeps its own style (Month title button).

### 📷 Photos
- Photos come from an iCloud or Google Photos **shared album** (set `PHOTO_ALBUM_URL`, see [photos.md](photos.md)). To add or remove photos, add or remove them in that album from any phone. The board checks every 15 minutes, or tap **↻ Check album now**.
- **Beside the month name, per month:** **Random photos**, **Photos I pick** (tap up to 8 in the grid; they show in that order), or **Art instead** (no photos, so you can draw or stamp clipart there). The choice is saved for the month you're looking at; months you haven't set use the "usually" choice.
- **📷 Photos** on the cork at the bottom (tablet and family screens): the quick way to turn the photos beside this month's name off (room to draw there) or back on. Photos you picked are remembered for when you turn them back on.
- **Photos there:** up to four polaroids, framed on people's faces. One changes every 40 seconds. They skip any spot that has a drawing on it, and never show the same photo twice at once.
- **Slideshow overnight:** start and end times (default 9 PM–6 AM), **brightness** (Dim 30% / Medium 50% / Bright 70% / Full), and **new photo every** 10 s–1 min.
- **▶ Preview slideshow** plays it on the tablet (tap to close).
- The top line shows how many photos the board has and when it last checked (or a ⚠ if something's wrong).


## 🧹 Chores
A checklist for the whole family that lives on the board, so the wall, the tablets, the kids’ tablets and your phones all show the same list.
- **Where:** **swipe left** on the calendar (wall, family screen, tablet), or open **🧹 Chores** from ☰ Menu or More (or pin it with 📌); swipe right or **📅 Calendar** to go back. On a **phone**, open the board’s address followed by `/chores` (for example `https://chalkboard.example.com/chores`), sign in once, and use Share → **Add to Home Screen** so it opens like an app. Shared screens go back to the calendar after 3 quiet minutes.
- **Today / This week / This month:** daily chores start fresh every morning, weekly ones at the start of the week (the same first day as the calendar) and monthly ones on the 1st. A weekly chore can be done any day that week. The tabs show how many are left.
- **Tick one off:** tap it. Tap again to undo. Some chores count more than once (“Fold laundry, 3 times a week”: it shows *1 of 3*).
- **Who can tick:** signed-in people and family screens, anyone’s; a kid’s tablet, only that kid’s; the wall just shows the list.
- **✎ Change the list** (signed-in people, on a tablet or phone): add the family (mark the kids), then chores under **Every day / Every week / Every month**: what needs doing, who (tap names), how many times, and for chores with several people either **Done once, by any of them** (“load the dishwasher”) or **Each does their own** (“put dirty clothes in the hamper”: a checkbox for each person). **Start with an example** fills in a typical family schedule to rename and change.
- **Kids’ tablets:** pair the tablet in the admin console as **🧒 Kid’s tablet** and pick the kid. It opens on *their* chores (“Theo’s chores”, with *Just me* and *With Nora*), big and easy to tick, and comes back to them after 3 quiet minutes. Swiping right shows the calendar (view only). Chores are separate from the reward jars — add a piece to a jar yourself when you want to.

## A family touch screen
A screen paired as **✋ Family** opens straight into the editor: tap a day to see and add events, tap an event to change it, tap the Meal Plan or a jar. **Decorate** adds stamps, clipart, emoji, GIFs and words (Aa), and moves, resizes or erases them — fingers are great at that. It can also change the **board style** (background, look, seasonal pattern), the **🖼 holiday border** and the **photos**, and decorate each week on **🗓️ Week**. The overnight slideshow's settings are in ⚙️ Settings, which needs a parent signed in (on a phone or tablet); if a family screen ends up on a page it can't open, **← Back to the calendar** brings it back. Freehand chalk and Posca, the month title (typed or hand-lettered), wiping the month, removing saved stamps/GIFs and the calendar settings stay on a signed-in tablet. It looks and behaves like the wall: no wood frame (just the cork with the pages and **✏️ Edit the calendar**), no zooming, **double tap** for the photo frame, the overnight slideshow (a tap shows the calendar for 5 minutes), back to this month and out of Decorate after 5 quiet minutes, and it updates itself. Handy for a touch screen on the wall that everyone uses.

## The wall display (read-only)
- The wall can't change anything, but it responds to taps:
  - **Tap a day:** shows everything on that day in a big list (handy when a day is too full to read). Tap anywhere to close; it closes by itself after 30 seconds.
  - **The small switch next to the Jars / Today / Up Next heading** (🫙 ☀️ 📅 📷), or a swipe across that area, shows one of the others. After 3 minutes it goes back to the normal choice. (Every screen has it, when the bottom of the Notes column is jars, today, up next or photos.)
  - **Double tap:** turns the photo frame (slideshow) on, any time of day. **Tap** the photos to go back to the calendar.
  - **During the overnight slideshow:** one tap shows the calendar for 5 minutes; a double tap goes back to the slideshow straight away.
- **Slideshow:** picks at random between a single photo and 2–3 photo collages, framed on faces (whole photo on a blurred backdrop when people are too spread out to crop). The clock and date sit on a frosted panel in whichever corner covers the fewest faces.
- **Weather motion:** gentle rain, snow or storm animation for ~20 seconds every 10 minutes when it's actually happening.
- **Offline dot** (bottom corner) if the wall loses the server or the calendar.
- **Updates itself** when new files are deployed (the tablet shows an "update" banner instead).
- After 5 minutes idle the wall drifts back to the current month.

### Preview switches (add to the wall address)
`?slides` (slideshow now), `?wx=rain|snow|storm` (weather), and display-glitch tests `?canvas`, `?noart`, `?plain`, `?csszoom`, `?plainbg`, `?framed`.

