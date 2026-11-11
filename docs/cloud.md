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

- **Free:** Oracle Cloud's *Always Free* ARM servers. Plenty for the board, but signing up needs a card, free
  servers can be hard to get in busy regions, and Oracle changes the free allowance from time to time.
- **Paid, simple:** Hetzner, DigitalOcean, Linode/Akamai, Vultr and others have servers for roughly $4–6 a month
  (check their current prices). Pick a location near you.
- **Avoid** "serverless" or app platforms that stop your app when it's idle or don't keep files between restarts:
  the board must keep running and keep its `data` folder.

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
