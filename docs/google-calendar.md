# Using a Google Calendar

The board can show and edit a Google Calendar instead of a CalDAV calendar (iCloud, Nextcloud, …). Adds, edits and deletes made on the tablet go straight to Google, so they show up on everyone's phones.

Google doesn't allow app passwords for calendars, so you create a small, free "app" in Google Cloud that belongs only to you. It takes about 15 minutes, once. Nothing is billed and no credit card is needed.

> **Status: new.** This works against a test setup but hasn't had much real-world use yet. If a step below doesn't match what you see, please note where you got stuck and what the screen said.

## What you need
- The Google account that owns (or can edit) the family calendar.
- Access to the board's `.env` file on the server (`/opt/family-chalk-planner/.env`).
- The tablet with `/edit` open.

## 1. Create a Google Cloud project
1. Go to [console.cloud.google.com](https://console.cloud.google.com/) and sign in with the Google account.
2. Accept the terms if asked. At the top, open the project picker → **New project**. Name it something like `Family Chalk Planner` → **Create**. Make sure it's selected at the top afterwards.

## 2. Turn on the two calendar APIs
In the search bar at the top, search for each of these, open it, and press **Enable**:
1. **CalDAV API** (the board reads and writes events through this one)
2. **Google Calendar API** (used to list your calendars so you can pick one)

## 3. Set up the consent screen
1. Menu → **APIs & Services** → **OAuth consent screen** (newer consoles call it **Google Auth Platform**). Press **Get started** if shown.
2. **App name:** `Family Chalk Planner`. **User support email:** your address. → Next.
3. **Audience:** **External**. → Next.
4. **Contact information:** your address. → Next → agree → **Create**.
5. Open **Audience** (or the consent screen page) and press **Publish app** → **Confirm**, so the status says **In production**.

**Why publish?** While an app is in "Testing", Google signs the board out every 7 days. Publishing doesn't make anything public and doesn't need Google's review for a personal app like this; it only removes that 7-day limit. You'll just see an "unverified app" warning when you sign in (step 6).

You don't need to add scopes here; the board asks for calendar access when you sign in.

## 4. Create the sign-in key (OAuth client)
1. **APIs & Services** → **Credentials** (or **Google Auth Platform → Clients**) → **Create credentials / Create client** → **OAuth client ID**.
2. **Application type: Desktop app.** Name: `Chalk board`. → **Create**.
3. Copy the **Client ID** and **Client secret** shown (you can see them again later under Clients).

Desktop app is the simple choice: it works over plain `http://` on your home network. (For the alternative with HTTPS, see [Sign-in without pasting](#sign-in-without-pasting-optional) below.)

## 5. Put the key in `.env`
On the server, edit `/opt/family-chalk-planner/.env` and add:

```bash
CALENDAR_PROVIDER=google
GOOGLE_CLIENT_ID=1234567890-abc...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
```

The `CALDAV_*` lines are ignored in Google mode; you can leave them or delete them. Then:

```bash
systemctl restart family-chalk-planner
```

Keep the secret in that file only (it's readable by root and the service only). Don't paste it into chats or tickets.

## 6. Connect from the tablet
1. On the tablet, open `/edit`, enter the PIN, and tap **⚙️** in the bottom bar.
2. Tap **Sign in with Google**. A new tab opens on Google.
3. Choose the account that has the family calendar.
4. You'll see **"Google hasn't verified this app."** That's expected: it's *your* app from step 4. Tap **Advanced** → **Go to Family Chalk Planner (unsafe)**.
5. Allow **See, edit, share, and permanently delete all the calendars you can access**, then **Continue**. (The board only touches the one calendar you pick next, but Google has no narrower option that allows editing.)
6. Google sends the tab to an address starting with `http://localhost/?state=…` and the page **won't load**. That's expected. Copy the **whole address** from the address bar.
7. Back in the board's tab, paste it into the box and tap **Connect**.
8. Pick the calendar the board should show. Done: the wall picks it up within a few seconds.

The address you paste is single-use and only works for a few minutes. If Connect says it expired, just tap Sign in again.

## Day to day
- Event colors, countdowns, drawings and everything else work the same as with iCloud.
- To switch calendars later: ⚙️ → tap a different calendar.
- **Disconnect Google** (⚙️) forgets the sign-in on the board. To also revoke it on Google's side: [myaccount.google.com/permissions](https://myaccount.google.com/permissions) → Family Chalk Planner → remove access.

## Troubleshooting
| What you see | What to do |
|---|---|
| ⚙️ says "isn't set up on the server yet" | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are missing from `.env`, or the service wasn't restarted. |
| Google shows **Error 400: redirect_uri_mismatch** | The OAuth client isn't a **Desktop app**. Create a Desktop client (step 4) and use its ID and secret, or follow "Sign-in without pasting" for a Web client. |
| Google shows **access_denied** / "has not completed the Google verification process" | The app is still in **Testing**. Publish it (step 3.5), or add your Google account under **Audience → Test users**. |
| "Google sign-in expired or was removed - reconnect" on the board | The access was revoked, the password changed, or the app was in Testing for 7 days. ⚙️ → Sign in with Google again. |
| Calendar list is empty | The account can only *view* those calendars. The board lists calendars you can edit; ask the owner to share with "Make changes to events". |
| Events don't load / "403" in the log | One of the APIs in step 2 isn't enabled (CalDAV API is the one people miss). Enabling it can take a minute or two to take effect. |
| Something else | `journalctl -u family-chalk-planner -n 50` on the server shows the error. |

## Sign-in without pasting (optional)
If the board has a real HTTPS address (for example `https://board.home.example` through a reverse proxy, see [install.md](install.md#5-https-and-a-nice-name-optional)), Google can send the tablet straight back to it:

1. Create the OAuth client as **Web application** instead of Desktop app, and under **Authorized redirect URIs** add `https://board.home.example/oauth/google/callback` (your address).
2. In `.env`, add `GOOGLE_REDIRECT_URI=https://board.home.example/oauth/google/callback` alongside the ID and secret, and restart.
3. ⚙️ → Sign in with Google: after you allow access you land back on the board's Settings, already connected. No paste box.

Google only accepts `https://` redirect addresses for Web clients (besides `localhost`), which is why the paste method is the default.

## What's stored
The board keeps one Google *refresh token* in `data/google-auth.json` (readable only by the service). It never sees your Google password. Backups of `data/` include this file, so treat them as private.
