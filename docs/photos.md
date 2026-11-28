# Photos

The board shows photos from one **shared album**: up to four polaroids beside the month name, and the overnight slideshow. It works with an **iCloud Shared Album** or a **Google Photos shared album**. Adding or removing photos in the album, from any phone, changes what the board shows. The board checks the album every 15 minutes (or tap **↻ Check album now** in 📷 on the tablet).

You only need the album's **share link**. No password or sign-in is involved.

## 1. Make the album and get its link

### iPhone / iPad / Mac (iCloud)
1. Open **Photos** → **Albums** → **+** → **New Shared Album**. Name it (for example `Family board`) and create it. You don't have to invite anyone.
2. Add some photos to it.
3. Open the album and tap the **people** icon at the top. Turn on **Public Website**.
4. Tap **Share Link** → **Copy**.

### Android / any phone (Google Photos)
1. Open **Google Photos** → **Collections** (or **Library**) → **+** / **New album**. Name it (for example `Family board`) and add photos.
2. Open the album, tap **Share** (or ⋮ → **Share album**), then **Create link** / **Copy link**. The link looks like `https://photos.app.goo.gl/AbC123…`.

**Anyone who has the link can see the photos in that album**, so only put photos in it you're happy to have on the wall, and don't post the link anywhere. iCloud links also show the album owner's name.

## 2. Give the link to the board
Open the admin console (`/admin`) → **⚙️ Board** → **Photos**, paste the link into **Album link**, and tap **Save and restart**. (The link is stored encrypted, since anyone with it can see the album.)
Within a minute, 📷 on the tablet shows how many photos it found.

## A big album: which photos, and copies on the board
Under **⚙️ Board** → **Photos** → **Which photos, and copies on the board** (for any album, Immich too):

- **Show:** **every photo** (the default), **only the ones I pick** (tap **Pick photos…**, tick the ones you want and
  **Save my picks**; with nothing ticked every photo shows), or **a few at random, new ones each day** (say how many).
- **Copies on the board:** **a copy of every photo** (the default: they keep showing when the album is offline), or
  **only the last few shown** (5 unless you choose another number). With thousands of photos, the board then doesn't
  copy the whole album: it fetches each photo from the album when it comes up, so the album has to be reachable.
  Keep at least as many copies as the slideshow shows side by side. If the album can't be reached, the last photo shown stands in and
  the slideshow says **📷 Photos are offline** until it can be again.

## Good to know
- **Videos are skipped.** Only photos are shown.
- **Faces:** photos are framed around people's faces when the optional face finder is installed (the installer sets it up unless you used `--no-face`).
- **Size:** photos are copied to the board at about 2048 px, so the wall never waits on the internet. Removing a photo from the album removes it from the board at the next check.
- **Unofficial:** neither Apple nor Google offers an official way for apps to follow a shared album, so the board reads the album the same way the album's web page does. If Apple or Google changes that page, photos stop updating (the photos already copied keep showing) until the board gets an update. 📷 shows a ⚠ with the reason if a check fails.

## If something goes wrong
| What 📷 says | What to do |
|---|---|
| "No album set up yet" | `PHOTO_ALBUM_URL` is empty, or the board wasn't restarted. |
| "doesn't look like an iCloud or Google Photos shared album link" | Copy the link again from the Share button (step 1). |
| "album isn't shared by link" (iCloud) | Turn on **Public Website** for the album (step 1.3). |
| "album not found" / "doesn't open a shared album" (Google) | The link was turned off, or it's a link to a single photo. Create the album link again. |
| "sent something unexpected" | Google or Apple changed their album page. Check for a board update (`deploy/update.sh`). |

## More albums
The admin console → **⚙️ Board** → **Photos** → **More albums** adds up to 8 more, each with a name. Paste an
album's share link (iCloud, Google Photos or an Immich share link), or, with Immich set up above, type one of:

- an album's name, like `Grandkids`
- `favorites`, `all` or `thisday` (photos from this date in other years)
- `person:` and a name from Immich's **People**, like `person:Nora`: every photo they're in (name them in Immich
  first)

Then ⚙️ Settings on the board picks which album shows beside the month's name, in the slideshow, for a month of
its own and for each time overnight, and the **📷 Albums** page shows them all. Only albums set up here can ever be
shown.
