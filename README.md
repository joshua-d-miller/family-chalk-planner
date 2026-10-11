# Family Chalk Planner

A chalkboard-style family wall calendar for a wall-mounted screen, edited from a tablet.

- **Your real calendar.** Events come from any CalDAV calendar (iCloud, Nextcloud, Fastmail, Radicale…). Add, edit and delete from the tablet, including repeating events ("just this one" or "all of them").
- **Draw on it.** Chalk and paint-marker drawing, typed or hand-lettered month titles, stamps, ~35 hand-drawn clipart pieces, an emoji library, icon search, and GIFs. The art is saved per month.
- **A Notes column.** Weather, trash day, countdowns to holidays, birthdays and starred events, a meal plan, and up to four kids' reward jars.
- **Photos.** Polaroids pinned beside the month name, and an overnight slideshow with collages framed on people's faces, all from an iCloud shared album.
- **Make it yours.** Board styles (presets plus per-part fonts and colors), per-event colors, and a today marker that can be a chalk ring, circle, heart, star or box.
- **Live.** Changes made on the tablet appear on the wall within a second. The wall updates itself when you install a new version.
- **Small and private.** It runs on your own network as one Node.js service with a SQLite file. No account and no cloud service of its own.

## Install

On a Debian/Ubuntu LXC, VM, Raspberry Pi (64-bit OS) or other small Linux box, as root:

```bash
git clone https://github.com/OWNER/family-chalk-planner.git /tmp/fcp
bash /tmp/fcp/deploy/install.sh --repo https://github.com/OWNER/family-chalk-planner.git
```

The installer sets up Node.js 22, a locked-down service user, and an optional face finder for photo framing. It also generates your editing PIN and prints the addresses to open. Then fill in your calendar and location in `/etc/family-chalk-planner/planner.env` and run `systemctl restart family-chalk-planner`.

To update: `/opt/family-chalk-planner/deploy/update.sh`. It rolls back automatically if the new version doesn't start.

See **[docs/install.md](docs/install.md)** for the details: Proxmox, private repos, HTTPS, the wall display, backups, and moving an older setup over.

## Use

- **Wall display:** open `http://<server>:3002/` in a kiosk browser (Fully Kiosk Browser on Android works well).
- **Tablet:** open `http://<server>:3002/edit`, enter the PIN, and add it to the home screen.
- **[User guide](docs/user-guide.md):** what every button does.

## Development

```bash
npm ci
npm test                                   # starts the server against a fake calendar and photo album
node test/mock-caldav.js 5232 &            # fake calendar for local work
CALDAV_URL=http://127.0.0.1:5232/ CALDAV_USER=x CALDAV_PASSWORD=x CALDAV_CALENDAR=Family \
  CHALK_PIN=2468 TIMEZONE=America/New_York DATA_DIR=./data npm start
```

## License

GNU Affero General Public License v3.0 or later (see [LICENSE](LICENSE)). You're free to use, change and share it. If you run a modified version for other people, you must offer them its source code; the app's "source code" link points at `SOURCE_URL`. Third-party credits are in [NOTICE](NOTICE). Security notes are in [SECURITY.md](SECURITY.md).
