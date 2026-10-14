# Installing Family Chalk Planner

## What you need
- A small always-on Linux machine: Debian 12/13 or Ubuntu 22.04/24.04, amd64 or arm64. A Proxmox LXC with 1 CPU, 512 MB RAM and 4 GB of disk is plenty (plus ~250 MB for the optional face finder).
- A calendar reachable over CalDAV (iCloud, Nextcloud, Fastmail, Radicale…).
- A screen for the wall (any browser in kiosk mode) and a tablet or phone for editing.

## 1. Create a container (Proxmox; skip for other machines)
In the Proxmox UI: **Create CT** → unprivileged, Debian 12 or 13 template, 1 core, 512 MB RAM, 4 GB disk, DHCP or a fixed IP. Under **Options → Features**, turning on **nesting** lets the installer apply systemd sandboxing; without it the service still runs, just with less isolation.

## 2. Install
The folder you clone into *is* the install. Settings and data live inside it too (`.env` and `data/`, both ignored by git), so updates are a simple pull. Don't run `git clean -x` in it: that would delete `.env` and `data/`.

As root on the machine or in the container:

```bash
apt-get update && apt-get install -y git
git clone https://github.com/joshua-d-miller/family-chalk-planner.git /opt/family-chalk-planner
bash /opt/family-chalk-planner/deploy/install.sh
```

Any folder works (for example `/home/pi/family-chalk-planner` on a Pi; the checkout stays owned by whoever cloned it). Options: `--no-face` skips the photo face finder, `--data DIR` keeps data elsewhere, `--no-start` sets up without starting. If you move the folder later, run `deploy/install.sh --unit-only` from its new location.

### Private repository (before the project is public)
Give the machine a read-only **deploy key**:

```bash
ssh-keygen -t ed25519 -N '' -C "family-chalk-planner@$(hostname)" -f /root/.ssh/fcp_deploy
printf 'Host github-fcp\n  HostName github.com\n  User git\n  IdentityFile /root/.ssh/fcp_deploy\n  IdentitiesOnly yes\n' >> /root/.ssh/config
cat /root/.ssh/fcp_deploy.pub
```

On GitHub: repository → **Settings → Deploy keys → Add deploy key**, paste the key, and leave **Allow write access** unchecked. Then:

```bash
ssh -o StrictHostKeyChecking=accept-new -T github-fcp   # says "successfully authenticated"
git clone github-fcp:joshua-d-miller/family-chalk-planner.git /opt/family-chalk-planner
bash /opt/family-chalk-planner/deploy/install.sh
```

### Without git
Download the code (GitHub → Code → Download ZIP), unzip it where it should live, and run `bash deploy/install.sh` inside it. To update, replace the code files with a newer copy (keep `.env` and `data/`) and restart the service. With git, `update.sh` does this for you.

## 3. Settings
Edit `.env` in the install folder (root-only), then `systemctl restart family-chalk-planner`.

| Setting | What it does |
|---|---|
| `CALDAV_URL`, `CALDAV_USER`, `CALDAV_PASSWORD`, `CALDAV_CALENDAR` | Your calendar. iCloud: `https://caldav.icloud.com/`, your Apple ID, an **app-specific password** (account.apple.com → Sign-In and Security), and the calendar's name exactly as shown. |
| `CALENDAR_PROVIDER`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Use a **Google Calendar** instead. Setup takes ~15 minutes: see **[google-calendar.md](google-calendar.md)**. |
| `ALLOW_UNPAIRED_VIEW` | `true` lets any device on your network *view* the board without pairing (changes still need a paired device). Leave it off if the board can be reached from the internet. |
| `PUBLIC_URL` | The board's `https://` address through your reverse proxy. Turns on passkeys and makes invite links use it. |
| `TIMEZONE` | e.g. `America/Chicago`. Decides what "today" is. |
| `LATITUDE`, `LONGITUDE`, `TEMP_UNIT` | Weather in the Notes column (Open-Meteo, no key). Empty = no weather. |
| `TRASH_DAY` | Starting trash day, 0 = Sunday … 6 = Saturday. Empty = hidden. After that, trash and recycling days are set on the tablet (⚙ Settings). |
| `HOLIDAYS` | `us` or `none`. Holidays only show on the board; they're never added to your calendar. |
| `PHOTO_ALBUM_URL` | The share link of an **iCloud Shared Album** (Public Website on) or a **Google Photos shared album**. See **[photos.md](photos.md)**. |
| `BOARD_TITLE` | Name shown in the browser and on home-screen icons. |
| `PORT`, `BIND`, `DATA_DIR`, `BACKUP_DIR`, `SOURCE_URL` | Server details; the defaults are fine. |

## Screens and people
Everything works in any current browser — Safari, Chrome, Edge, Firefox, Samsung Internet, Fully Kiosk — on phones, tablets and computers. (Where the console shows a browser name, it's only there so you can tell your devices apart.)

**Screens** (a wall display, a shared touch screen) are *paired* once and just keep working. **People** sign in on their own tablet or phone. Everything is managed in the **admin console** at `http://<server>:3002/admin`.

| Who | Role | Can |
|---|---|---|
| Screen | 👀 **View only** | Show the board (a wall display). |
| Screen | ✋ **Family** | Show the board and add or change events, the meal plan, jars and countdowns, and decorate with stamps, clipart, emoji, GIFs and words (place, move, resize, erase). No freehand drawing, no wiping a month, no board style, photos or settings — for a shared touch screen. |
| Person | 🎨 **Editor** | Everything on the board: events, drawing, board style, photos. Signs in again on that tablet every 60 days (one Face ID tap with a passkey; adjustable in 🛡 Security). |
| Person | 🔑 **Admin** | Editor, plus the admin console (screens, people) and the board's ⚙️ settings (calendar, Google, trash days). The console asks for a fresh sign-in after 30 quiet minutes. |

1. **Create the admin:** open `/admin`, enter the **setup code** the installer printed (also in `journalctl -u family-chalk-planner` and `data/setup-code.txt`; it works once), choose a username and password, and scan the QR code with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Authy…). If the board has an HTTPS address (below), add a **passkey** too.
2. **Pair each screen:** open the board on it; it shows a code like `K7QA-4MDX`. In the admin console → **📺 Screens**, type the code, name it, pick View only or Family, and tap **Pair it**.
3. **Invite people:** admin console → **👪 People** → username, name, Editor or Admin → **Make invite link**. Send them the link (it works once, for 3 days). They choose a password, set up their authenticator app, and add a passkey on their tablet.
4. **Day to day:** the console lists every screen (last seen) and person. Under a person, **Sign-ins & passkeys** shows each device they're signed in on (browser, address, when, when it ends) and each passkey, each with its own *End this sign-in* / *Remove*. *Remove* a screen and it stops at once; *Sign out everywhere* for a lost tablet; *New invite link* when someone forgot their password or lost their phone. **👤 My account** shows where *you* are signed in.
5. **🛡 Security:**
   - **Needs a look** lists anything worth attention, each with the fix next to it: screens not seen for a while, passkeys not used for a long time, people who haven't signed in for months or never finished their invite, and repeated failed sign-ins (which account, from which address).
   - **Automatic cleanup** (you set the numbers; 0 turns a rule off): tablets sign in again every 60 days; flag screens after 90 days unseen (automatic removal is off unless you set a number); flag passkeys unused for a year; flag people not signed in for 180 days; keep the activity log 90 days. Always: paired screens stay paired for good (their key is renewed while in use) until you remove them; console sign-ins end after 30 quiet minutes; invites after 3 days.
   - **Activity**: every sign-in (and failed one), pairing, invite, role change, removal, passkey, password and settings change, and server reset — with who, what, which device and address, and when. Where the thing still exists, the line has the action to undo it (end that sign-in, remove that screen or passkey).

### Passkeys (Face ID, Touch ID, fingerprint)
Passkeys only work over **HTTPS on a name** (not an IP address), which a reverse proxy gives you. With Nginx Proxy Manager: add a proxy host (e.g. `board.example.com` → `http://<server>:3002`, with Websockets support on and a Let's Encrypt certificate), then set in `.env`:
```bash
PUBLIC_URL=https://board.example.com
```
and restart. (If the console says passkeys aren't available at that address, the board isn't seeing NPM's HTTPS: set `TRUST_PROXY=<NPM's IP>` in `.env`.) Open the board at that address on iPhone/iPad/Mac (iCloud Keychain), Android (Google Password Manager), or Windows (Windows Hello), and use **Add a passkey** (console → 👤 My account, or 👤 on the board) right after signing in — for safety, adding or removing a passkey needs a sign-in from the last 10 minutes. Password + authenticator code always works as well, including at the plain `http://` address.

### Nobody can sign in any more
On the server: `sudo /opt/family-chalk-planner/deploy/reset-admin.sh`. It removes **every** account, sign-in and paired screen (the calendar, drawings, meals, jars, photos and settings stay) and prints a new setup code. Create the admin again in `/admin` and re-pair the screens.

**On the internet:** don't expose the board directly. Use Tailscale, Cloudflare Access, or a reverse proxy with its own login in front of it, keep `ALLOW_UNPAIRED_VIEW` off, and use HTTPS so every cookie is marked Secure.

## 4. The wall display
- **Android screen or tablet:** [Fully Kiosk Browser](https://www.fully-kiosk.com/). Set the Start URL to `http://<server>:3002/`, turn on "Keep screen on", and turn on start-on-boot.
- **Raspberry Pi or PC:** any browser in full-screen/kiosk mode, e.g. `chromium --kiosk http://<server>:3002/` or `firefox --kiosk http://<server>:3002/`.
- The wall is read-only. During the night slideshow, one tap shows the calendar for 5 minutes and a double tap goes back to the slideshow.

## 5. HTTPS and a nice name (optional)
Put it behind your reverse proxy (Nginx Proxy Manager, Caddy, Traefik) with a local DNS name. It uses a live event stream, so turn on WebSocket support and turn **off** response buffering. For Nginx Proxy Manager, add under **Advanced**:

```
proxy_buffering off;
proxy_read_timeout 1h;
```

Keep it on your home network. Anyone who can reach the wall address can see the calendar.

## Updating
```bash
/opt/family-chalk-planner/deploy/update.sh            # git pull + restart; rolls back if it fails
/opt/family-chalk-planner/deploy/update.sh --check    # just show what's new
```
The wall reloads itself; tablets show an "update" banner.

## Backups
Every night the board writes a consistent copy of its database to `BACKUP_DIR` (default `data/backup`) and keeps 14 of them. Uploaded GIFs live in `BACKUP_DIR/media`. Back up that folder and `.env` with your usual tools. The photo cache and face finder can always be rebuilt, so they don't need backing up.

Everything lives in one SQLite file (`data/chalkboard.db`, readable by the service only): calendar art, settings, screens, people and the activity log. SQLite is the right fit for a household board — one small file, no database server to run, crash-safe, and checked on every start (a problem shows in `journalctl`).

A backup restores everything, sign-ins included — there's no separate key file to keep. Each person's authenticator-app secret is locked with their own password, so a copied backup can't produce sign-in codes without cracking that password.

**Restore:**
```bash
systemctl stop family-chalk-planner
cd /opt/family-chalk-planner/data
cp backup/chalkboard-YYYY-MM-DD.db chalkboard.db
rm -f chalkboard.db-wal chalkboard.db-shm
chown chalkplanner: chalkboard.db && chmod 600 chalkboard.db
systemctl start family-chalk-planner
```

## Moving an older setup over
If the board used to run inside another Node app (the original setup, where that app's `server.js` ended with `require('./chalkboard')`), clone and install with `--no-start`, then run:

```bash
bash /opt/family-chalk-planner/deploy/migrate-from-homelab-api.sh --old /opt/homelab-api \
  --timezone America/New_York --trash-day 2 --latitude 40.0 --longitude -77.0
```

It copies the data and settings, removes the board from the old app, starts both, and keeps the old files untouched. Undo it with `--rollback`. By default backups stay in the old `backup/` folder, so existing Syncthing or restic jobs keep working.

## Troubleshooting
- `journalctl -u family-chalk-planner -n 50`: the service log.
- **"Calendar unavailable":** check the CalDAV settings (iCloud needs an app-specific password, and the calendar name must match exactly).
- **Wall not updating live:** your proxy is buffering. See the HTTPS section above.
- **Photos cropped in the middle:** the face finder isn't installed. Run `bash /opt/family-chalk-planner/deploy/setup-face.sh`.
