# No server at home? Running the board in the cloud

The board is one small program (Node.js and a SQLite file) that has to run **all the time**: it keeps the
calendar in sync, saves the drawings and sends live updates to every screen. It needs a computer that's always on.
There are two ways to get one, and Cloudflare can help with both:

| You have… | Run the board on | Reach it from anywhere with |
| --- | --- | --- |
| Anything always on at home: a Raspberry Pi, a NAS, an old PC or laptop, a mini PC | That machine ([docker.md](docker.md) or [install.md](install.md)) | **Cloudflare Tunnel** (free), or Tailscale |
| Nothing at home | A small cloud server (a "VPS"), about the price of a coffee a month (some are free) | **Cloudflare Tunnel** (free) |

**Can Cloudflare host the board itself?** Not as it's built today. Cloudflare's free hosting (Pages and Workers)
runs websites and short functions, not a program that runs all the time with its own database file and a live
connection to every screen. What Cloudflare *does* do for free is the hard part of putting it online safely: a
**Tunnel** gives the board an `https://` address without opening any ports on your router or server, and
**Cloudflare Access** puts a sign-in in front of it.

## What you need
- **A domain name on Cloudflare** (about $10 a year, for example `millerfamily.net`; Cloudflare sells them at cost,
  or move one you have). The board gets its own name on it, like `board.millerfamily.net`.
- **A free Cloudflare account.** Tunnel and Access (up to 50 people) are on the free plan.
- **Somewhere to run it:** your always-on machine, or a cloud server (below).

## Option A: a cloud server
Any small Linux server with Docker works. The board needs very little: **1 GB of memory** and a few GB of disk
(more if you upload lots of GIFs). Images are published for both Intel/AMD (`amd64`) and ARM (`arm64`) servers.

| Provider | A plan that fits | About, per month | Chip | Good to know |
| --- | --- | --- | --- | --- |
| Oracle Cloud *Always Free* | Ampere A1, up to 2 cores and 12 GB in total | free | ARM | Needs a card to sign up; free servers can be hard to get in busy regions; Oracle cut the free allowance in half in 2026 and switches off servers over it, so stay within it. |
| Hetzner Cloud | CX22 (2 cores, 4 GB), or an ARM CAX | about €4 | Intel/AMD or ARM | The most server for the money; Europe and US locations. |
| Linode (Akamai) | Nanode 1 GB | about $5 | Intel/AMD | Many locations. |
| Vultr | Cloud Compute 1 GB | about $5–6 | Intel/AMD | Many locations. |
| DigitalOcean | Basic Droplet 1 GB | about $6 | Intel/AMD | The 512 MB plan is too small for the board. |

Prices as of November 2026; check the provider's own page, they change. Any other provider with a small Linux
server works the same way. Pick a location near you. **Avoid** "serverless" or app platforms that stop your app
when it's idle or don't keep files between restarts: the board must keep running and keep its `data` folder.

Create the server with **Ubuntu** (any current version), sign in to it over SSH (your provider shows how), then
install Docker:
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # then sign out and back in
```

## Option B: a machine at home
Install the board with Docker as in [docker.md](docker.md), then carry on below. Nothing on your router changes.

## Put it online with a Cloudflare Tunnel
Cloudflare rearranges its dashboard now and then; if a menu below has moved, look for **Tunnels**.

1. In the Cloudflare dashboard: **Networking → Tunnels → Create a tunnel**, name it (e.g. `chalk-planner`) →
   **Create Tunnel**. Pick **Docker** and copy the long **token** from the command it shows (the part after
   `--token`). Keep it secret: it's what connects the tunnel. (You don't need to run that command; step 3 does.)
2. Open the tunnel → **Routes → Add route → Published application**: subdomain `board`, your domain, service URL
   **`http://board:3002`** → **Add route**.
3. On the server, make a folder with this `compose.yaml` (the board isn't published on any port: only the tunnel
   reaches it):
   ```yaml
   services:
     board:
       image: ghcr.io/joshua-d-miller/family-chalk-planner:latest
       container_name: family-chalk-planner
       restart: unless-stopped
       volumes:
         - ./data:/data
       environment:
         TZ: America/New_York       # your time zone
     tunnel:
       image: cloudflare/cloudflared:latest
       restart: unless-stopped
       command: tunnel --no-autoupdate run
       environment:
         TUNNEL_TOKEN: ${TUNNEL_TOKEN}
       depends_on: [board]
   ```
   and put the token in a file next to it called `.env`, readable only by you:
   ```bash
   echo 'TUNNEL_TOKEN=<the token from step 1>' > .env && chmod 600 .env
   docker compose up -d
   docker compose logs board        # the one-time setup code
   ```
4. Open `https://board.<your domain>/admin`, enter the setup code and create the admin account (with the
   authenticator app). Then in **⚙️ Board → On your network**, enter `https://board.<your domain>` and save. That
   turns on passkeys and makes invite links use that address. (The tunnel connects from inside Docker's own
   network, which the board already trusts as its proxy, so nothing else needs changing.)
5. Set up the calendar, weather and photos as usual ([docker.md](docker.md#2-set-it-up-in-the-browser)), and pair
   the screens at the new address: on the wall, open `https://board.<your domain>/` and type its code into
   **📺 Screens**.

(While the project's repository is private, its Docker image is too: build the image yourself instead, as
[docker.md](docker.md#1-start-it) describes, and use `build: .` in place of the `image:` line.)

## Lock the door: Cloudflare Access (recommended)
The board has its own locks (screens are paired with a code; people sign in with a passkey or a password plus an
authenticator code; repeated wrong tries are slowed down), but anything on the internet is safer behind a second
door. Cloudflare Access asks for a one-time code sent to an email address you've allowed before anyone even
reaches the board.

1. In Cloudflare's Zero Trust dashboard: **Access → Applications → Add an application → Self-hosted.** Domain:
   `board.<your domain>`.
2. **Session duration:** 1 month (so screens aren't asked often).
3. **Policy:** *Allow*, include **Emails**: your family's email addresses.
4. Each device (the wall, the kitchen screen, each phone and tablet) signs in once with an email code, then again
   about once a month. On a wall screen, do that from the kiosk browser's own screen (in Fully Kiosk: open its
   settings, or tap the screen while it shows the Cloudflare page).

If a sign-in a month on the wall is too much, you can skip Access and rely on the board's own locks: use passkeys
or the authenticator for everyone, and look
at **🛡 Security** now and then. Never set **Unpaired devices** to *May view the board* on a board that's on the
internet.

## What's on the server, and how to limit it
A rented server is someone else's computer, so it's worth knowing what's on it. To keep the calendar in sync all
day, the board keeps your calendar sign-in (an iCloud app-specific password, a Google sign-in, or your CalDAV
password) and any private calendar links. They're encrypted in its database, which protects a stray copy of the
database on its own. But the key sits on the same server (`data/secret.key`, also copied into `data/backup`)
because the board has to unlock them by itself, so **anyone who gets into the server, and the company you rent it
from, could read them**. Neither sign-in is read-only:

- **An iCloud app-specific password** opens that Apple account's iCloud mail, contacts and calendars, not just the
  calendar.
- **A Google sign-in** can read and change every calendar in that Google account (not mail or files).

(People's own board passwords are different: they're stored as slow one-way hashes and can't be read back.)

Three things keep the risk small:

1. **Give the board an account of its own.** Make an Apple ID or Google account just for the board, create the
   family calendar in it, and share that calendar with everyone's own accounts (with permission to make changes).
   Connect the board to that account. Then the most anyone could get from the server is that one calendar, not
   someone's email.
2. **Keep the board off the open internet**: Cloudflare Access (above) or Tailscale (below).
3. **Know how to cut it off.** If you think the server was broken into, revoke the board's sign-in and make a new
   one: the app-specific password at [account.apple.com](https://account.apple.com) (Sign-In and Security →
   App-Specific Passwords), or the board's access in your Google account (Security → Your connections to
   third-party apps & services), and any calendar links you used (most services can reset a private link).

Optional: keep the key out of the data folder (and its backups) by setting your own `SECRET_KEY`
([install.md](install.md#the-encryption-key-datasecretkey)). It protects copies of the folder, not a server
someone is already inside.

## Look after the server
The board in the steps above isn't open to the internet on any port: only the tunnel reaches it, and it connects
outward. Keep the rest of the server just as closed:

- **Sign in with an SSH key, not a password.** Most providers let you add your key when you create the server.
  Then turn password sign-ins off: set `PasswordAuthentication no` in `/etc/ssh/sshd_config` and run
  `sudo systemctl restart ssh`.
- **A firewall that lets in only SSH:** `sudo ufw allow OpenSSH && sudo ufw enable`. (Docker can open ports past
  `ufw`, which is why the `compose.yaml` above publishes none; keep it that way.)
- **Security updates by themselves:** `sudo apt install unattended-upgrades` (Ubuntu turns it on when installed).
- **Many providers also have their own firewall** in their dashboard; allowing only SSH there is a good second
  layer.

## Keep a copy of your data
On a cloud server, the provider's disk is the only copy. The board writes a nightly backup to `data/backup`
(14 days); copy that folder somewhere else now and then, for example to your computer with
`scp -r <server>:~/family-chalk-planner/data/backup ./chalk-backup`, or turn on your provider's own server backups
(usually about 20% of the server's price). Moving to another server is just copying the whole `data` folder.

## Updating
```bash
docker compose pull && docker compose up -d
```
Every release is listed on the GitHub Releases page with its notes ([CHANGELOG.md](../CHANGELOG.md)).

## Tailscale instead (no domain, nothing public)
If every device that shows the board can run the Tailscale app (phones, tablets, Android screens, computers),
[Tailscale](https://tailscale.com) puts them on a private network with the board and nothing is on the internet at
all. Its free plan covers a family. It also gives the board an `https://` name (**Tailscale Serve**), which turns
on passkeys. The catch: every screen needs Tailscale installed and signed in, which some wall screens can't do.
