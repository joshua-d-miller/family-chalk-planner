# Running Family Chalk Planner with Docker

Works on anything that runs Docker: a NAS (Synology, Unraid, TrueNAS), a Raspberry Pi with a 64-bit OS, a mini PC or a VM. Images are published for `linux/amd64` and `linux/arm64` with every release.

## 1. Start it
```bash
mkdir family-chalk-planner && cd family-chalk-planner
curl -fsSLO https://raw.githubusercontent.com/joshua-d-miller/family-chalk-planner/main/compose.yaml
docker compose up -d
docker compose logs board
```
The log shows a one-time **setup code** (it's also in `data/setup-code.txt`).

Building from the source instead (to try a change, for example): clone the repository, uncomment `build: .` in `compose.yaml`, and run `docker compose up -d --build`.

## 2. Set it up in the browser
1. Open `http://<machine>:3002/admin`, enter the setup code, create the admin account and connect your authenticator app.
2. **⚙️ Board** → your time zone, weather town, calendar (iCloud/other CalDAV with **Find my calendars**, or Google — see [google-calendar.md](google-calendar.md)) and the photo album link → **Save and restart**. The container restarts itself to apply them (that's what `restart: unless-stopped` is for).
3. **📺 Screens** → open the board on the wall display, type the code it shows. **👪 People** → invite whoever edits from a tablet.

## 3. HTTPS (recommended)
Put the board behind your reverse proxy (Nginx Proxy Manager, Caddy, Traefik) with WebSockets on and response buffering off (see [install.md](install.md#5-https-and-a-nice-name-recommended)). Then in the admin console → ⚙️ Board → **On your network**, enter the https address and your proxy's address (the console shows the one it sees, with a button to use it). That turns on passkeys (Face ID, Touch ID, fingerprint) and makes invite links use that address.

No machine at home that's always on, or want to reach the board from outside without opening ports? See
[cloud.md](cloud.md) (a Cloudflare Tunnel, on a home machine or a small cloud server).

## Your data
Everything the board keeps is in `./data`: the database, the key for passwords saved in the console (`secret.key`), uploaded GIFs and nightly backups (`data/backup`, 14 days). Back up that folder: it has everything, including `secret.key` (also copied to `data/backup/`). That key only unlocks the saved calendar password, account name, album link and calendar links; if it's ever lost, nothing else is affected and ⚙️ Board asks you to type those again ([details](install.md#the-encryption-key-datasecretkey)). The container runs as user `1000:1000`; set `PUID`/`PGID` if `./data` should belong to someone else.

## Updating
```bash
docker compose pull && docker compose up -d
```
To stay on one version, use a tag instead of `latest`, e.g. `ghcr.io/joshua-d-miller/family-chalk-planner:v0.8.5`. What changed is in [CHANGELOG.md](../CHANGELOG.md) and on the Releases page.

## Good to know
- The optional face finder (keeps faces in frame in photo collages) isn't in the standard image. Build with it: `docker build --build-arg WITH_FACE=true -t family-chalk-planner:face .` (adds ~220 MB).
- All settings are in the admin console and the database (in `./data`); there's no settings file. Can't reach the console because of a wrong https address or proxy? `docker compose exec -u 1000:1000 board node server/chalkboard.js --setting set PUBLIC_URL` (no value clears it), then `docker compose restart`.
- Locked out of every admin account: `docker compose exec -u 1000:1000 board node server/chalkboard.js --reset-admin`, then `docker compose restart`. It removes all accounts and paired screens (the calendar, art and settings stay) and prints a new setup code.
