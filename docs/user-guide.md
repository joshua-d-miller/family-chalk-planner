# User guide

The wall display only shows the board; everything is edited from a tablet or phone at `/edit`, where each person signs in (passkey, or password + authenticator code) and signs in again every 60 days. Screens are paired and people are invited from the admin console at `/admin` — see [install.md](install.md#screens-and-people). Add `/edit` to the tablet's home screen for an app-like icon.

## The tablet (editor)

The bottom bar on the tablet has **👤** (your account: add a passkey on this tablet, admin console, sign out), **⚙️ Settings** (admins), **🎨 Board style**, **📷 Photos**, **Draw** and **+ Add event**. Zoom with **− / + / Fit** at the top right (or pinch). Everything saved on the tablet shows on the wall within a second or two.

### Events (your calendar)
- **Add:** tap **+ Add event** (or tap a day, then **Add**). Pick what, day, time and length, or tick **All day** (with an optional **Through** date for multi-day events like trips).
- **Change or delete:** tap the event on the board (or tap the day to see its full list). For repeating events, choose **Just this one** or **All of them** before saving or deleting.
- **⭐ Count down to this:** adds the event to the countdown list in Notes.
- Long event names wrap onto a second line when the day has room; when a day is full they shorten but keep the time.
- **Color on the board:** pick a color for the event. Colors that would be hard to read on the board's background are adjusted automatically (same hue). It's board-only (your calendar never sees it). The dashed circle means "use the board style's normal color". For repeating events it follows Just this one / All of them.
- Adds, edits and deletes go to your real calendar (iCloud, Google, Nextcloud, …), so they show on everyone's phones too.

### Automatic on the calendar (nothing to do)
- **US holidays** appear in light blue italics with an icon (board only, never written to your calendar).
- **Countdowns** in Notes: the next 3 things within 60 days — big holidays, any event with "birthday" or "bday" in the title (🎂), and anything ticked ⭐.
- **Trash / recycling** labels on the right days (set in ⚙️ Settings), and **weather** (today / tomorrow) in Notes.

### Drawing and decorating (tap **Draw**)
- **Chalk** or **Posca** marker, color dots (rainbow **+** for any color; recent custom colors are remembered), and the dot button for size.
- **Aa** writes typed text in a choice of fonts.
- **Select** (dashed square): drag around anything to select it, then press and drag to move it. The bar that appears has **★ Save as stamp**, **🎨 Color** (line and fill), **− / +** (smaller / bigger), **Copy**, **Erase**, and **✕** to finish. Or drag the **pink dot** at the corner to resize freely (works on clipart, stamps, GIFs, text and drawings).
- **★ Stamps / clipart:** your saved stamps, ~35 hand-drawn pieces, an emoji library, **Find more** (thousands of icons, with line and fill colors), and **GIFs** (your own uploads plus animated emoji). Each GIF can play **gently** (now and then), **always**, or stay **still**.
- **Eraser**, **Undo / Redo**, and the trash can to **wipe this month's art**.
- The drawing covers the whole board, so you can write or draw across several days ("Grandma visiting" over a week) or anywhere in the margins.
- Art is saved per month, so each month starts fresh.

### Month title
- Tap **Month title** (top right of the calendar). **Typed:** choose font, color, outline and size; tick **Use this style for every month** to make it the default. **I'll hand-letter it:** hides the typed title so you can draw your own.

### Meal Plan
- Tap **Meal Plan** in Notes. Add meals (Enter adds the next line), tick ones that are done (they get crossed out), **Clear all** for a new week. A long list shrinks to fit, then ends with "+N more".

### ⚙️ Settings
- Shown to admins signed in to the admin console (it asks again after 30 quiet minutes). **🛠 Admin console** opens `/admin` for screens and people.
- **Calendar:** shows which calendar the board uses. With Google Calendar this is where you sign in and pick the calendar (see [google-calendar.md](google-calendar.md)).
- **Trash & recycling:** the trash pickup day (or none), and recycling **same day as trash**, **every other week** (pick the date of the next pickup), **a different day each week**, or **don't show**. Saved as soon as you change it.
- **Bottom of the Notes column:** what it shows normally: **🫙 Reward jars**, **☀️ Today** (everything still to come today), **📅 Up next** (the next events over two weeks, grouped by day), **📷 Photos** (a polaroid from the album that changes every 40 seconds — nice when the month title has art instead of photos), or **Nothing** (the Meal Plan gets the space).

### Reward jars (optional, up to 4)
- **Add a jar:** the small dashed **+** above the jars (or **+ Reward jar** when there are none). **Remove** is on each jar's card. With no jars, the jar area disappears and the Meal Plan gets the space; with 3–4 jars they shrink to fit one row.
- Tap a jar: **+ / −** adds or removes a piece (it drops in on the wall), change the **name**, the **goal**, and **what goes in** (hearts, rainbows, stars, lightning, critters…). **🎉 Reward!** celebrates and empties it.

### 🎨 Board style
- **Background:** black slate, green chalkboard, blue chalkboard, cork, kraft paper or whiteboard. Changing it keeps your look and colors; a color only changes where it would be hard to read on that background (lighter on dark ones, darker on light ones, same hue) — that goes for the drawings and stamps too, without changing what's saved, so switching back brings the original colors back.
- **Presets:** Classic (the original look), Pastel, Bold, Simple, Autumn, Winter, Holiday, Scrawl.
- **Tweaks** under the presets: font and color for day numbers, weekday names, events, headings and Notes text; all-day and holiday colors; separate colors for "Notes" and "Meal Plan"; show/hide number boxes; the **today marker** (chalk ring, circle, heart, star or filled box) and its color; **calendar lines** (color, solid/dashed/dotted, thin/normal/bold).
- The board changes as you tap. **Save** sends it to the wall, **Cancel** puts it back, **Undo my tweaks** returns to the plain preset. Picking a different preset clears tweaks (it asks first).
- The month title keeps its own style (Month title button).

### 📷 Photos
- Photos come from an iCloud or Google Photos **shared album** (set `PHOTO_ALBUM_URL`, see [photos.md](photos.md)). To add or remove photos, add or remove them in that album from any phone. The board checks every 15 minutes, or tap **↻ Check album now**.
- **Beside the month name, per month:** **Random photos**, **Photos I pick** (tap up to 8 in the grid; they show in that order), or **Art instead** (no photos, so you can draw or stamp clipart there). The choice is saved for the month you're looking at; months you haven't set use the "usually" choice.
- **Photos there:** up to four polaroids, framed on people's faces. One changes every 40 seconds. They skip any spot that has a drawing on it, and never show the same photo twice at once.
- **Slideshow overnight:** start and end times (default 9 PM–6 AM), **brightness** (Dim 30% / Medium 50% / Bright 70% / Full), and **new photo every** 10 s–1 min.
- **▶ Preview slideshow** plays it on the tablet (tap to close).
- The top line shows how many photos the board has and when it last checked (or a ⚠ if something's wrong).


## A family touch screen
A screen paired as **✋ Family** opens straight into the editor: tap a day to see and add events, tap an event to change it, tap the Meal Plan or a jar. **Decorate** adds stamps, clipart, emoji, GIFs and words (Aa), and moves, resizes or erases them — fingers are great at that. Freehand chalk and Posca, wiping the month, changing the stamp/GIF libraries, board style, photos and settings stay on a signed-in tablet. Handy for a touch screen on the wall that everyone uses.

## The wall display (read-only)
- The wall can't change anything, but it responds to taps:
  - **Tap a day:** shows everything on that day in a big list (handy when a day is too full to read). Tap anywhere to close; it closes by itself after 30 seconds.
  - **The small switch next to the Jars / Today / Up Next heading** (🫙 ☀️ 📅 📷), or a swipe across that area, shows one of the others. After 3 minutes it goes back to the normal choice.
  - **Double tap:** turns the photo frame (slideshow) on, any time of day. **Tap** the photos to go back to the calendar.
  - **During the overnight slideshow:** one tap shows the calendar for 5 minutes; a double tap goes back to the slideshow straight away.
- **Slideshow:** picks at random between a single photo and 2–3 photo collages, framed on faces (whole photo on a blurred backdrop when people are too spread out to crop). The clock and date sit on a frosted panel in whichever corner covers the fewest faces.
- **Weather motion:** gentle rain, snow or storm animation for ~20 seconds every 10 minutes when it's actually happening.
- **Offline dot** (bottom corner) if the wall loses the server or the calendar.
- **Updates itself** when new files are deployed (the tablet shows an "update" banner instead).
- After 5 minutes idle the wall drifts back to the current month.

### Preview switches (add to the wall address)
`?slides` (slideshow now), `?wx=rain|snow|storm` (weather), and display-glitch tests `?canvas`, `?noart`, `?plain`, `?csszoom`, `?plainbg`, `?framed`.

