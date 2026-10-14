# Security

Family Chalk Planner is meant to run on a home network, behind your router, and reached by
the household's own wall display and tablet.

## Reporting a problem
Please open a private security advisory on GitHub (Security tab -> "Report a vulnerability")
rather than a public issue.

## How it is protected today
- **Screens are paired.** A new screen shows a code; an admin types it into the admin console
  (codes expire after 15 minutes, are never listed, and hand over the key once). The screen gets a
  random 256-bit key (HttpOnly, SameSite=Lax cookie, Secure over HTTPS; only its SHA-256 is
  stored) with the role view or family. Removing it locks it out at once.
- **People sign in** with a passkey (WebAuthn, user verification required, tied to `PUBLIC_URL`)
  or with a password (scrypt, N=32768) plus a TOTP code from an authenticator app (codes can't be
  reused; failed sign-ins are rate-limited per account and per address). Board sign-ins end after 60
  days (adjustable); screen keys never expire (renewed while used) until an admin removes the screen; the admin console needs its own sign-in that ends after 30 idle minutes (12 h at most).
- **Roles:** reading needs a paired screen or a signed-in person (unless `ALLOW_UNPAIRED_VIEW`);
  family screens may change events, meals, jars and countdowns and place/move/erase decorations (not freehand drawing, wiping a month or the libraries); editors everything on the board;
  only admins (console sign-in) screens, people, calendar, Google and board settings.
- **First admin / recovery:** a one-time setup code (server log, `data/setup-code.txt`, mode 600).
  `deploy/reset-admin.sh` (needs root on the server) removes every account and screen and makes a
  new code. Invite links are single-use and expire after 3 days.
- **Visibility:** the admin console lists each person's individual sign-ins (device, address,
  last active, expiry) and passkeys, each removable on its own; flags stale screens, passkeys and
  accounts and repeated failed sign-ins; and keeps an activity log of every security event (who,
  what, device, address, time; 90 days by default, survives `reset-admin.sh`). Screens unseen for
  90 days are flagged (automatic removal optional); unfinished invites are removed automatically.
- **Sensitive changes need a fresh sign-in:** adding or removing a passkey needs a sign-in from the
  last 10 minutes on that device (so someone picking up a signed-in tablet can't add their own
  passkey or remove yours); changing a password needs the current one and signs out every other
  device; the admin console needs its own sign-in (30 idle minutes).
- **Browser protections:** no framing (clickjacking), no MIME sniffing, no referrer, a strict
  Content-Security-Policy on the admin console, HSTS over HTTPS, and account data is never cached.
  Live-update streams are re-checked, so a removed screen or ended sign-in stops receiving updates.
- **Changes** need an `X-Chalk` request header, so other websites can't post to the board
  through your browser.
- **Internet exposure** is not recommended. If you must, put an authenticating proxy
  (Tailscale, Cloudflare Access, Authelia/Authentik) in front and use HTTPS.
- **Stored data:** one SQLite file (mode 600). Passwords are scrypt hashes, screen and sign-in keys
  SHA-256 hashes, and each authenticator secret is AES-256-GCM encrypted with a key derived from that
  person's own password (scrypt), so the database or a backup alone can't produce codes. No key file to
  manage. Nightly snapshots are mode 600.
- **Settings** live in the database too (there's no settings file). Passwords, the Google client secret,
  the calendar account name, the photo album link and calendar links are AES-256-GCM encrypted with a key
  kept outside the database (`data/secret.key`, mode 600, or `SECRET_KEY`); passwords are never sent back
  to the browser. The key only protects those values: losing it costs no sign-ins or content, only
  re-entering them (see docs/install.md → The encryption key).
- **The service** runs as its own unprivileged user, can't modify its own code, and (where
  systemd sandboxing is available) can only write to its data folder.
- **Uploads** are size-limited and checked to really be images; file routes only accept
  generated IDs (no paths).
- **Outbound requests** go only to the configured CalDAV server, Open-Meteo, Apple's photo
  hosts, and the icon/emoji CDNs.

## Settings saved in the admin console
Only admins (with a fresh console sign-in) can see or change ⚙️ Board. Passwords and the Google client secret are encrypted (AES-256-GCM) with a key that isn't in the database (`data/secret.key`, mode 600, or `SECRET_KEY`), are never sent back to the browser, and changes are logged by setting name only. Values are checked (time zones, numbers, http(s) addresses, single lines) before they're saved. "Find my calendars" may reach a CalDAV server on your own network on purpose (Nextcloud, Radicale), so it's limited to admins.

## Links the board downloads

"Add from link" (GIFs) is the only time the board fetches a web address someone typed. Only editors can use it; it follows at most 4 redirects, stops at 10 MB and 15 seconds, keeps only real GIF/PNG/JPEG/WebP files, and refuses any address on a private network (your LAN, the server itself, cloud metadata addresses), checked again for every redirect and every DNS answer.

## Privacy note on iCloud shared albums
Anyone with a shared album's link can see the album owner's name and email and the photos'
saved locations. Share the link only with the board and keep the album view-only.

## Secure, but easy to live with
| Who | Day to day | Protected by |
|---|---|---|
| Wall / touch screen | Never signs in | Paired once by an admin who types the code shown on it; removable any time |
| Tablet / phone | Face ID / fingerprint every 60 days | Passkey (or password + authenticator code); each sign-in visible and endable |
| Admin console | One passkey tap after 30 quiet minutes | Fresh sign-in; only place screens, people and settings change |
| Forgot password / lost phone | Admin sends a new invite link | Old password, authenticator and passkeys are wiped first |
| Locked out entirely | `deploy/reset-admin.sh` on the server | Needs root on the server; logged |

