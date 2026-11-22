# Installing Family Chalk Planner

## What you need
- A small always-on Linux machine: Debian 12/13 or Ubuntu 22.04/24.04, amd64 or arm64 (a 32-bit Raspberry Pi OS works too, until April 2027: see [Node.js](#nodejs)). A Proxmox LXC with 1 CPU, 512 MB RAM and 4 GB of disk is plenty (plus ~250 MB for the optional face finder).
- A calendar reachable over CalDAV (iCloud, Nextcloud, Fastmail, Radicale…).
- A screen for the wall (any browser in kiosk mode) and a tablet or phone for editing.

## 1. Create a container (Proxmox; skip for other machines)
In the Proxmox UI: **Create CT** → unprivileged, Debian 12 or 13 template, 1 core, 512 MB RAM, 4 GB disk, DHCP or a fixed IP. Under **Options → Features**, turning on **nesting** lets the installer apply systemd sandboxing; without it the service still runs, just with less isolation.

## 2. Install
The folder you clone into *is* the install. Data lives inside it too (`data/`, ignored by git), so updates are a simple pull. Don't run `git clean -x` in it: that would delete `data/`.

As root on the machine or in the container:

```bash
apt-get update && apt-get install -y git
git clone https://github.com/joshua-d-miller/family-chalk-planner.git /opt/family-chalk-planner
bash /opt/family-chalk-planner/deploy/install.sh
```

Any folder works (for example `/home/pi/family-chalk-planner` on a Pi; the checkout stays owned by whoever cloned it). Options: `--no-face` skips the photo face finder, `--data DIR` keeps data elsewhere, `--no-start` sets up without starting. If you move the folder later, run `deploy/install.sh --unit-only` from its new location.

### Without git
Download the code (GitHub → Code → Download ZIP), unzip it where it should live, and run `bash deploy/install.sh` inside it. To update, replace the code files with a newer copy (keep `data/`) and restart the service. With git, `update.sh` does this for you.

## 3. Settings
Every setting is made in the **admin console → ⚙️ Board** (after you create the admin account in the next section) and kept in the board's database — there's no settings file to edit:

| Section | What you set |
|---|---|
| Board | Name, time zone (defaults to the server's), holidays (US, Canada, UK or none), weeks from Sunday or Monday, 12- or 24-hour times. |
| Weather | Search your town (Open-Meteo, no account), °F or °C. Empty = no weather. |
| Calendar | iCloud or another CalDAV server (address, username, **app-specific password**, then **Find my calendars**), or Google ([google-calendar.md](google-calendar.md)). **More calendars** from the same account, each with its own color. |
| Calendar links | Read-only iCal links (school, sports teams), each with its own color. |
| Photos | The share link of an iCloud or Google Photos shared album ([photos.md](photos.md)). |
| On your network | The board's https address (passkeys, invite links), your reverse proxy's address, whether unpaired devices may view, release or main updates, the source-code link. |

**Save and restart** applies them in a few seconds. Passwords, the Google client secret, the calendar account name, the album link and calendar links are encrypted in the database with a key kept outside it (`data/secret.key`, copied into the nightly backup); passwords are never shown again. Trash and recycling days and the Notes column are set on the tablet (⚙️ Settings).

Only where the board listens and keeps its data are set by the installer (in the service definition, `/etc/systemd/system/family-chalk-planner.service.d/server.conf`): `install.sh --unit-only --port 3002 --bind 0.0.0.0 --data DIR --backup-dir DIR`.

**Upgrading from a version with a `.env` file (before 0.7):** nothing to do. The first start reads it once and moves everything into the database, and `update.sh` renames it to `.env.moved-to-admin-console`. Check ⚙️ Board, then delete that file.

**Can't reach the console because of a wrong setting** (for example the https address or proxy)? Password + authenticator code works at `http://<server>:3002/admin` whatever the https address says. Or change it on the server: `sudo deploy/setting.sh set PUBLIC_URL` (no value clears it; `get` shows it), then `systemctl restart family-chalk-planner`.

## Screens and people
Everything works in any current browser — Safari, Chrome, Edge, Firefox, Samsung Internet, Fully Kiosk — on phones, tablets and computers. (Where the console shows a browser name, it's only there so you can tell your devices apart.)

**Screens** (a wall display, a shared touch screen) are *paired* once and just keep working. **People** sign in on their own tablet or phone. Everything is managed in the **admin console** at `http://<server>:3002/admin`.

| Who | Role | Can |
|---|---|---|
| Screen | 👀 **View only** | Show the board (a wall display). |
| Screen | 🧒 **Kid’s tablet** | Shows just that kid’s chores (pick which kid when pairing; add the family in Chores first) and lets them tick off their own. Swipe right for the calendar, view only. |
| Screen | ✋ **Family** | Show the board and add or change events, the meal plan, jars and countdowns, and decorate with stamps, clipart, emoji, GIFs and words (place, move, resize, erase). No freehand drawing, no wiping a month, no board style, photos or settings — for a shared touch screen. |
| Person | 🎨 **Editor** | Everything on the board: events, drawing, board style, photos. Signs in again on that tablet every 60 days (one Face ID tap with a passkey; adjustable in 🛡 Security). |
| Person | 🔑 **Admin** | Editor, plus the admin console (screens, people) and the board's ⚙️ settings (calendar, Google, trash days). The console asks for a fresh sign-in after 30 quiet minutes. |

1. **Create the admin:** open `/admin`, enter the **setup code** the installer printed (also in `journalctl -u family-chalk-planner` and `data/setup-code.txt`; it works once), choose a username and password, and scan the QR code with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Authy…). If the board has an HTTPS address (below), add a **passkey** too.
2. **Pair each screen:** open the board on it; it shows a code like `K7QA-4MDX`. In the admin console → **📺 Screens**, type the code, name it, pick View only, Family or Kid’s tablet, and tap **Pair it**.
3. **Invite people:** admin console → **👪 People** → username, name, Editor or Admin → **Make invite link**. Send them the link (it works once, for 3 days). They choose a password, set up their authenticator app, and add a passkey on their tablet.
4. **Day to day:** the console lists every screen (last seen) and person. Under a person, **Sign-ins & passkeys** shows each device they're signed in on (browser, address, when, when it ends) and each passkey, each with its own *End this sign-in* / *Remove*. *Remove* a screen and it stops at once; *Sign out everywhere* for a lost tablet; *New invite link* when someone forgot their password or lost their phone. **👤 My account** shows where *you* are signed in.
5. **🛡 Security:**
   - **Needs a look** lists anything worth attention, each with the fix next to it: screens not seen for a while, passkeys not used for a long time, people who haven't signed in for months or never finished their invite, and repeated failed sign-ins (which account, from which address).
   - **Automatic cleanup** (you set the numbers; 0 turns a rule off): tablets sign in again every 60 days; flag screens after 90 days unseen (automatic removal is off unless you set a number); flag passkeys unused for a year; flag people not signed in for 180 days; keep the activity log 90 days. Always: paired screens stay paired for good (their key is renewed while in use) until you remove them; console sign-ins end after 30 quiet minutes; invites after 3 days.
   - **Activity**: every sign-in (and failed one), pairing, invite, role change, removal, passkey, password and settings change, and server reset — with who, what, which device and address, and when. Where the thing still exists, the line has the action to undo it (end that sign-in, remove that screen or passkey).

### Passkeys (Face ID, Touch ID, fingerprint)
Passkeys only work over **HTTPS on a name** (not an IP address), which a reverse proxy gives you. With Nginx Proxy Manager: add a proxy host (e.g. `board.example.com` → `http://<server>:3002`, with Websockets support on and a Let's Encrypt certificate), then enter `https://board.example.com` in the admin console → ⚙️ Board → **On your network** and save. (If the console says passkeys aren't available at that address, the board isn't seeing NPM's HTTPS: enter NPM's IP as the **reverse proxy address**, or use the button in 🛡 Security.) Open the board at that address on iPhone/iPad/Mac (iCloud Keychain), Android (Google Password Manager), or Windows (Windows Hello), and use **Add a passkey** (console → 👤 My account, or 👤 on the board) right after signing in — for safety, adding or removing a passkey needs a sign-in from the last 10 minutes. Password + authenticator code always works as well, including at the plain `http://` address.

### Nobody can sign in any more
On the server: `sudo /opt/family-chalk-planner/deploy/reset-admin.sh`. It removes **every** account, sign-in and paired screen (the calendar, drawings, meals, jars, photos and settings stay) and prints a new setup code. Create the admin again in `/admin` and re-pair the screens.

**On the internet:** don't expose the board directly. Use Tailscale, Cloudflare Access, or a reverse proxy with its own login in front of it, keep `ALLOW_UNPAIRED_VIEW` off, and use HTTPS so every cookie is marked Secure. [cloud.md](cloud.md) walks through a Cloudflare Tunnel with Access, at home or on a small cloud server.

## 4. The wall display
- **Any wall screen:** the [wall screens guide](kiosk.md) has the steps: Android with [FreeKiosk](https://github.com/RushB-fr/freekiosk) or [Fully Kiosk Browser](https://www.fully-kiosk.com/), Linux and Raspberry Pi with Chromium in kiosk mode, Windows with Edge kiosk, and Mac.
- The wall is read-only. During the night slideshow, one tap shows the calendar for 5 minutes and a double tap goes back to the slideshow.

## 5. HTTPS and a nice name (recommended)
Put it behind your reverse proxy (Nginx Proxy Manager, Caddy, Traefik) with a local DNS name. It uses a live event stream, so turn on WebSocket support and turn **off** response buffering. For Nginx Proxy Manager, add under **Advanced**:

```
proxy_buffering off;
proxy_read_timeout 1h;
```

Then enter the https address you open and the proxy's IP in the admin console → ⚙️ Board → **On your network** (the console shows the proxy address it sees, with a button to use it). Without HTTPS, passwords and codes cross your network unencrypted and passkeys can't work; the admin console warns about this.

Keep it on your home network. Anyone who can reach the wall address can see the calendar.

## Updating
```bash
/opt/family-chalk-planner/deploy/update.sh            # newest release + restart; rolls back if it fails
/opt/family-chalk-planner/deploy/update.sh --check    # just show what's new
```
It installs the newest **release** (a version tag like `v0.4.4`, listed on the GitHub Releases page with its notes), so work in progress on the main branch never reaches your wall. To follow every change on main instead (for people working on the board), choose it in ⚙️ Board → On your network → Updates. The wall and family screens reload themselves; tablets show an "update" banner.

Or, from 0.13: admin console → ⚙️ Board → **Updates** → **Update now**. The board can't update itself (it never runs as root), so the installer adds a small update service that runs `update.sh` when you press the button. Every night it also checks for a newer version, and with **Install updates by themselves** on, it installs small (minor and patch) releases overnight; a new major version waits for you to press Update now.

Every update first copies the database to `BACKUP_DIR/pre-update/` (the last 3 are kept). If the new version doesn't start properly (the health check: the board answers, its database is up to date, it's the new version, the page loads), the board goes back to the version it had **and to that copy of its database**, since a newer version may have changed the database in a way an older one can't read. A board refuses to start on a database from a newer version rather than misread it; if that ever happens after going back by hand, copy the newest `pre-update` file over `data/chalkboard.db` with the service stopped.

With Docker, update by pulling the new image: `docker compose pull && docker compose up -d`.

### Node.js
The board runs on Node.js, which the installer sets up from NodeSource:

| Your machine | Node.js | Supported until |
| --- | --- | --- |
| 64-bit (amd64, arm64: most PCs, Proxmox containers, a Raspberry Pi 3/4/5 on the 64-bit Raspberry Pi OS) | **26** (needed from 1.2) | April 2029 |
| 32-bit ARM (a Raspberry Pi on the 32-bit Raspberry Pi OS) | **22**, the newest Node.js built for it | **April 30, 2027** |
| Docker and the Home Assistant app | 26, inside the image | (comes with the image) |

- **From 1.2, a 64-bit machine needs Node.js 26.** A new install sets it up (from NodeSource), and updates move a
  NodeSource install up to it by themselves, overnight too. If an update can't, the board carries on with the
  Node.js it has and the update says so: the board still runs on 22.18 or newer, so an update never stops a board
  that works.
- **32-bit Raspberry Pi OS:** Node.js stopped making builds for 32-bit ARM with version 24, so these boards stay on
  Node.js 22. The board keeps working on 22 until its end of life on April 30, 2027; after that, board updates need a
  newer Node.js, and a 32-bit board stays on the last version that runs on 22. To keep getting updates, move to the
  **64-bit Raspberry Pi OS** (any Raspberry Pi 3, 4 or 5 can run it): install the board there and restore your backup
  (see [Backups](#backups)).
- Node.js installed some other way (not from NodeSource) is left as it is: on a 64-bit machine, install Node.js 26
  yourself ([nodejs.org](https://nodejs.org/)) to keep getting updates; a new install stops and asks for it.

## Backups
Every night the board writes a consistent copy of its database to `BACKUP_DIR` (default `data/backup`) and keeps 14 of them. Uploaded GIFs live in `BACKUP_DIR/media`. Back up that folder with your usual tools (it has everything, settings included). The photo cache and face finder can always be rebuilt, so they don't need backing up.

Everything lives in one SQLite file (`data/chalkboard.db`, readable by the service only): calendar art, settings, screens, people and the activity log. SQLite is the right fit for a household board — one small file, no database server to run, crash-safe, and checked on every start (a problem shows in `journalctl`).

A backup restores everything, sign-ins included. Each person's authenticator-app secret is locked with their own password, so a copied backup can't produce sign-in codes without cracking that password. The backup folder also holds `secret.key`, the key for the passwords and private links saved in ⚙️ Board — see [the encryption key](#the-encryption-key-datasecretkey) below.

### The encryption key (`data/secret.key`)
**What it is:** a random key the board creates the first time you save a password or private link in ⚙️ Board. It lives next to the database (`data/secret.key`, readable by the board only) and is copied into the backup folder (`BACKUP_DIR/secret.key`) right away and every time it changes. The console's ⚙️ Board tab shows where it is and whether the backup copy is current.

**What it unlocks — only these, nothing else:**
- the calendar password (iCloud app-specific password) and the Google client secret
- the calendar username / Apple ID
- the photo album link
- calendar links (iCal), which can carry private tokens

**What it does *not* touch:** the calendar art, meal plan, jars, styles, every other setting, screens, people, passwords, authenticator codes and passkeys. Those never depend on it.

**Why it exists:** a copy of the database on its own (a stray snapshot, a file copied off the server) doesn't reveal those passwords and links.

**If it's lost or doesn't match the database:** the board starts normally and keeps working; the calendar and photos stop until you open ⚙️ Board, where the affected fields say **⚠ enter it again**. Type them in, save, and a new key is made (and backed up; an older key in the backup folder is kept as `secret.key.replaced-<date>`, never deleted). No sign-ins, screens or content are lost.

**Restoring:** put back `secret.key` together with the database from the same backup folder (below). Using your own key instead (for example from a password manager): set `SECRET_KEY` in the service (`systemctl edit family-chalk-planner` → `Environment=SECRET_KEY=…`) or in Docker's `environment:`; then the file isn't used. Changing it means entering the passwords again.

**Restore:**
```bash
systemctl stop family-chalk-planner
cd /opt/family-chalk-planner/data
cp backup/chalkboard-YYYY-MM-DD.db chalkboard.db
cp backup/secret.key secret.key
rm -f chalkboard.db-wal chalkboard.db-shm
chown chalkplanner: chalkboard.db secret.key && chmod 600 chalkboard.db secret.key
systemctl start family-chalk-planner
```

## Troubleshooting
- `journalctl -u family-chalk-planner -n 50`: the service log.
- **"Calendar unavailable":** check the CalDAV settings (iCloud needs an app-specific password, and the calendar name must match exactly).
- **Wall not updating live:** your proxy is buffering. See the HTTPS section above.
- **Photos cropped in the middle:** the face finder isn't installed. Run `bash /opt/family-chalk-planner/deploy/setup-face.sh`.
- **`update.sh` (or `install.sh`) stops with no message, exit code 2:** a bug in versions 0.7.0–0.8.3 when
  `server.conf` was missing. Your copy of the script can't fix itself, so bring the code up to date by hand
  once (as root, in the board's folder):
  ```bash
  git pull --ff-only
  npm ci --omit=dev --no-audit --no-fund
  bash deploy/install.sh --unit-only      # writes server.conf
  systemctl restart family-chalk-planner
  bash deploy/update.sh                   # should now say "Already up to date"
  ```
- **Handwriting looks like Comic Sans:** the board's fonts aren't installed (the log and ⚙️ Board say so).
  Run `sudo bash deploy/update.sh`; it installs anything missing.
