# Connecting a Google Calendar

This guide connects the board to a Google Calendar so it shows your events, and so you can add, change and delete them from the tablet. Changes show up on everyone's phones too.

**Time:** about 15 minutes, once.  **Cost:** free. No credit card and no billing account are needed. If Google offers a "free trial" or asks for a card along the way, skip it.

## Why there are so many steps
Apple lets you make an "app-specific password" for your calendar. Google stopped allowing that in 2024. Now every program that edits a Google Calendar has to use a proper "Sign in with Google" button, and each program needs its own small registration with Google.

So in parts 1–3 you register your own copy of the board with Google. It belongs only to you: nobody else, including whoever wrote this software, can see your calendar through it.

## Before you start
- Use a **computer** for parts 1–3 (Google's setup pages are hard to use on a phone).
- Know which **Google account** has the family calendar. If several people share it, use the account that owns it, or one it's shared with using "Make changes to events".
- Open a blank note (Notepad, Notes…) to keep two codes you'll copy in part 3.
- For part 4 you need to be able to edit the board's settings file on the server. If someone else installed the board for you, they may need to do part 4.

---

## Part 1: Create a project
1. Go to **[console.cloud.google.com](https://console.cloud.google.com/)** and sign in with the Google account from above.
2. The first time, Google asks you to pick your country and agree to the terms. Tick the box and press **Agree and continue**.
3. At the top left, next to "Google Cloud", press the **project picker** (it may say "Select a project"). In the window that opens, press **New project** (top right).
4. **Project name:** `Family Chalk Planner`. Leave everything else as it is. Press **Create**.
5. Wait a few seconds. A notification appears; press **Select project**. Check that the top left now says **Family Chalk Planner**. (Every step below happens inside this project.)

## Part 2: Turn on the calendar features
1. In the **search bar** at the top of the page, type `CalDAV API` and choose **CalDAV API** from the results.
2. Press the blue **Enable** button. Wait until the page changes.
3. Search again for `Google Calendar API`, choose it, and press **Enable**.

Both must be on. If you skip the CalDAV one, the board signs in but shows no events.

## Part 3: Register the board with Google
**3a. Describe the app** (this is what you'll see on Google's sign-in page)
1. In the search bar, type `Google Auth Platform` and open it. (Older screens call this "OAuth consent screen".)
2. Press **Get started**.
3. **App information:** App name `Family Chalk Planner`; User support email: pick your email. Press **Next**.
4. **Audience:** choose **External**. Press **Next**. (Internal only appears for work/school Google accounts; with a normal Gmail account, External is the right choice.)
5. **Contact information:** type your email. Press **Next**.
6. Tick the box to agree to the user data policy, then press **Continue** and **Create**.

**3b. Publish it** (so you don't get signed out every week)
1. In the left menu, choose **Audience**.
2. Under "Publishing status" it says **Testing**. Press **Publish app**, then **Confirm**. It should now say **In production**.

This does **not** make anything public, and Google doesn't need to review it for personal use. It only stops Google from signing the board out every 7 days, which it does while an app is in Testing.

**3c. Create the sign-in key**
1. In the left menu, choose **Clients**, then **Create client** (at the top).
2. **Application type:** choose **Desktop app**. (Not "Web application". See "Signing in without pasting" at the end for when Web is used.)
3. **Name:** `Chalk board`. Press **Create**.
4. A window shows your **Client ID** and **Client secret**. **Copy both into your note now.** Press **Download JSON** too, as a backup.

**Important:** Google shows the client secret **only once**. If you close the window without copying it, open the client, press **Add secret** to make a new one, and copy that.

Keep the secret private: don't post it, email it or paste it into a chat.

## Part 4: Give the codes to the board
1. On a phone, tablet or computer, open the **admin console** (`/admin`) and sign in.
2. Tap **⚙️ Board**. Under **Calendar**, tap **🟦 Google Calendar**.
3. Paste the **Client ID** and **Client secret** from part 3 (no spaces).
4. Tap **Save and restart** at the bottom. The board restarts in a few seconds.

The secret is stored encrypted and never shown again.

## Part 5: Sign in from the tablet
1. On the tablet, open the board at `/edit` (signed in as an admin) and tap **⚙️ Settings** in the bottom bar.
2. Tap **Sign in with Google**. A new tab opens on Google's sign-in page.
3. Choose the Google account with the family calendar.
4. Google warns **"Google hasn't verified this app"**. That's expected: the app is the one you registered yourself in part 3. Tap **Advanced**, then **Go to Family Chalk Planner (unsafe)**.
5. Google lists what the board may do with your calendars. Tap **Continue** (or tick the box first, if there is one). Google only offers "all your calendars" for editing access; the board only uses the calendars you pick in step 8.
6. The tab then shows an error like **"Safari can't open the page"** or **"This site can't be reached"**. **This is expected.** Everything Google needs to tell the board is in that page's address, which starts with `http://localhost/?state=`.
   - Tap the **address bar** to show the full address, then **Select All** → **Copy**.
7. Switch back to the board's tab. Paste the address into the box and tap **Connect**.
8. A list of your calendars appears. Tap the calendars you want on the board (you can select more than one, including read-only subscribed calendars). The wall shows them within a few seconds.

Do steps 2–7 within about 10 minutes. If Connect says the sign-in has expired, tap **Sign in with Google** and go through it again.

---

## Later
- **Show or hide calendars:** ⚙️ → tap any calendar in the list to turn it on or off. Additional calendars use their Google Calendar colors on the board.
- **Default calendar for new events:** when more than one editable calendar is shown, choose the default under **Default calendar for new events** in ⚙️ (you can also pick which calendar to use each time you add an event).
- **Disconnect:** ⚙️ → **Disconnect Google**. To also remove the board's access on Google's side: [myaccount.google.com/connections](https://myaccount.google.com/connections) → Family Chalk Planner → delete.
- **Don't delete the Google Cloud project.** The board needs it for as long as it uses your calendar. Google deletes sign-in keys that go unused for 6 months; a board that's running uses its key every hour, so that only happens if the board is off for that long.

## If something goes wrong
| What you see | What it means / what to do |
|---|---|
| ⚙️ says Google "isn't set up on the server yet" | The codes weren't saved in ⚙️ Board (part 4), or **Google Calendar** wasn't selected there before saving. |
| Google: **Error 400: redirect_uri_mismatch** | The key was made as "Web application". Make a new one as **Desktop app** (part 3c) and paste the new codes in ⚙️ Board. |
| Google: **Error 403: access_denied**, or "has not completed the Google verification process" | The app is still in **Testing**. Publish it (part 3b). |
| Google: **invalid_client** | The ID or secret has a typo, a space, or quotes. Copy them again. Lost the secret? Make a new one (part 3c). |
| Connect: "Paste the whole address" | Only part of the address was copied. Tap the address bar, **Select All**, **Copy**, and paste again. |
| Connect: "expired or was already used" | Start again from **Sign in with Google**. |
| The calendar list is empty | This account can only *view* those calendars. Use the account that owns the calendar, or ask the owner to share it with you using "Make changes to events". |
| Signed in, but no events show | The **CalDAV API** isn't turned on (part 2). After turning it on, wait a couple of minutes. |
| The board says "Google sign-in expired or was removed - reconnect" | Access was removed, the Google password changed, or the app was in Testing for 7 days. ⚙️ → **Sign in with Google** again. |
| Anything else | On the server, run `journalctl -u family-chalk-planner -n 50` and look at the last lines. |

## Signing in without pasting (optional, for HTTPS setups)
If the board has its own **https://** address on your network (for example `https://board.home.example` through a reverse proxy, see [install.md](install.md#5-https-and-a-nice-name-recommended)), Google can send the tablet straight back to the board, so step 6–7 of part 5 aren't needed:

1. Create the key in part 3c as **Web application** instead, and under **Authorized redirect URIs** add `https://board.home.example/oauth/google/callback` (with your address).
2. In the admin console → ⚙️ Board → Google Calendar, fill in **Sign-in return address** with `https://board.home.example/oauth/google/callback` (your address) and **Save and restart**.
3. ⚙️ → **Sign in with Google**. After you allow access, you land back in the board's Settings, already connected.

Google only accepts `https://` addresses here, which is why pasting is the default.

## What the board keeps
The board stores one Google sign-in token in `data/google-auth.json` (readable only by the board's service). It never sees your Google password. Backups of the `data/` folder include this token, so keep them private.
