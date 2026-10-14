# Changelog

What changed in each release. `deploy/update.sh` installs the newest release; the notes for each
one also appear on the GitHub Releases page. Versions follow [semantic versioning](https://semver.org/)
(while below 1.0, a new minor version can change how things work).

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
