# Security

Family Chalk Planner is meant to run on a home network, behind your router, and reached by
the household's own wall display and tablet.

## Reporting a problem
Please open a private security advisory on GitHub (Security tab -> "Report a vulnerability")
rather than a public issue.

## How it is protected today
- **Editing** needs the PIN. Tablets get a session token; failed PIN attempts are rate-limited
  and lock out. Changing the PIN signs every device out.
- **Reading** (what the wall shows) does not need a login. Anyone who can reach the board on
  your network can see the calendar. Keep it off the internet, or put it behind a reverse
  proxy access list (planned: wall pairing with its own device token).
- **Secrets** live in `/etc/family-chalk-planner/planner.env` (root-only, mode 600).
- **The service** runs as its own unprivileged user, can't modify its own code, and (where
  systemd sandboxing is available) can only write to its data folder.
- **Uploads** are size-limited and checked to really be images; file routes only accept
  generated IDs (no paths).
- **Outbound requests** go only to the configured CalDAV server, Open-Meteo, Apple's photo
  hosts, and the icon/emoji CDNs.

## Privacy note on iCloud shared albums
Anyone with a shared album's link can see the album owner's name and email and the photos'
saved locations. Share the link only with the board and keep the album view-only.
