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
| `CHALK_PIN` | Tablet editing PIN, 4–8 digits. Changing it signs every tablet out. |
| `TIMEZONE` | e.g. `America/Chicago`. Decides what "today" is. |
| `LATITUDE`, `LONGITUDE`, `TEMP_UNIT` | Weather in the Notes column (Open-Meteo, no key). Empty = no weather. |
| `TRASH_DAY` | 0 = Sunday … 6 = Saturday. Empty = hidden. |
| `HOLIDAYS` | `us` or `none`. Holidays only show on the board; they're never added to your calendar. |
| `PHOTO_ALBUM_URL` | An iCloud Shared Album link (album → Share → link, with access set so **anyone with the link can view**). |
| `BOARD_TITLE` | Name shown in the browser and on home-screen icons. |
| `PORT`, `BIND`, `DATA_DIR`, `BACKUP_DIR`, `SOURCE_URL` | Server details; the defaults are fine. |

## 4. The wall display
- **Android screen or tablet:** [Fully Kiosk Browser](https://www.fully-kiosk.com/). Set the Start URL to `http://<server>:3002/`, turn on "Keep screen on", and turn on start-on-boot.
- **Raspberry Pi or PC:** Chromium in kiosk mode, `chromium --kiosk http://<server>:3002/`.
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

**Restore:**
```bash
systemctl stop family-chalk-planner
cd /opt/family-chalk-planner/data
cp backup/chalkboard-YYYY-MM-DD.db chalkboard.db
rm -f chalkboard.db-wal chalkboard.db-shm
chown chalkplanner: chalkboard.db
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
