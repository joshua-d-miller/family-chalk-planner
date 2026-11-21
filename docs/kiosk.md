# Wall screens

How to keep a screen on the wall showing the board all day: full screen, awake, starting by itself after a power
cut, and with nothing a stray tap can break. Pick the part for your screen.

Every screen first needs pairing once: open the board's address (`http://<the board's address>:3002/`), and in the
admin console → **📺 Screens** type the code it shows ([Getting started, step 4](getting-started.md#step-4-put-it-on-the-wall)).
A paired screen stays paired through restarts and updates.

**What the board does for you on any wall screen:** on the wall, a family screen or a kid's tablet (a paired screen
nobody is signed in on), a pinch or a double tap doesn't zoom the page, a swipe down doesn't reload it, and the board
asks the browser to keep the screen on while it shows. **↻ Reload** is in the ☰ menu (and a tap on the month's
name reloads a family screen). A slow screen can be made lighter in ⚙️ Settings → This screen → **Low-power
screen**, and a 16:9 or 16:10 screen can use all of its height with **Fill the screen**.

- [Android: FreeKiosk](#android-freekiosk)
- [Android: Fully Kiosk Browser](#android-fully-kiosk-browser)
- [Linux or Raspberry Pi: Chromium in kiosk mode](#linux-or-raspberry-pi-chromium-in-kiosk-mode)
- [Windows: Microsoft Edge kiosk](#windows-microsoft-edge-kiosk)
- [Mac](#mac)
- [If it's slow](#if-its-slow)

## Android: FreeKiosk

[FreeKiosk](https://github.com/RushB-fr/freekiosk) is a free, open-source kiosk app for Android 8.0 and newer, and it
works with Home Assistant. It's what our own wall runs.

1. **Install it** from [Google Play](https://play.google.com/store/apps/details?id=com.freekiosk), or the
   `FreeKiosk-…apk` from its [releases page](https://github.com/rushb-fr/freekiosk/releases).
2. **Set the board as its page:** open its settings (tap the bottom-right corner **5 times**, then your PIN), and set
   the URL to `http://<the board's address>:3002/`. The same 5 taps and PIN get you back into its settings later.
3. **Keep it on the board:** in its settings, turn on keeping the screen on, starting when the screen turns on
   (it calls this auto-launch), and its full-screen mode, so the status and navigation bars are hidden.
4. **Locked down (optional):** FreeKiosk's *Device Owner* mode stops anyone leaving the app. It's set up once from a
   computer with ADB; its [installation guide](https://github.com/RushB-fr/freekiosk/blob/main/docs/installation.md)
   has the steps (all accounts have to come off the screen first).
5. **Home Assistant (optional):** in **Advanced → MQTT**, turn MQTT on and enter your broker (Home Assistant's
   Mosquitto add-on), its port (1883), a username and password, and a device name. The screen then shows up in Home
   Assistant by itself, with its screen on/off, brightness, screensaver and a **reload** button, so an automation
   can turn the wall off at night or reload the board. Leave its camera and screenshot features off unless you need
   them: on a plain MQTT connection anyone who can read the broker can see them.

FreeKiosk shows the board in Android's own web view, so keep **Android System WebView** up to date in the Play Store
(Play Store → Manage apps & device → Updates): an old one is the most common reason a wall screen is slow.

## Android: Fully Kiosk Browser

[Fully Kiosk Browser](https://www.fully-kiosk.com/) works well too.

- **Start URL:** `http://<the board's address>:3002/`.
- Turn on **Keep screen on** and **Start on boot**, and turn **off** its own **Pull to refresh** (the board already
  stops the browser's).
- **Hardware acceleration** on (Web Content Settings) makes moving pictures smoother. If pieces of an old picture
  stay behind after moving it, ↻ Reload clears them.

## Linux or Raspberry Pi: Chromium in kiosk mode

This is how the board is tested on every change: Chrome on Linux, full screen, on 1080p, 2K and 4K touch screens.

1. **Open the board full screen**, without the "restore pages" bubble after a power cut:

   ```bash
   chromium --kiosk --noerrdialogs --disable-session-crashed-bubble --disable-infobars \
     --check-for-update-interval=31536000 --overscroll-history-navigation=0 \
     http://<the board's address>:3002/
   ```

   (On Debian and Raspberry Pi OS the command is `chromium`; with Google's Chrome it's `google-chrome`.)
2. **Start it with the computer:** on Raspberry Pi OS (Bookworm, with its Wayland desktop), add that line to
   `~/.config/labwc/autostart`, ending with `&`. On a desktop with an *Startup Applications* panel, add it there. On
   a minimal Debian with no desktop, a small `~/.xinitrc` with that command, started by auto-login, does the same.
3. **Keep the screen on:** the board asks Chrome to keep it awake; turn off the desktop's own screen blanking too
   (Raspberry Pi: `sudo raspi-config` → Display Options → Screen Blanking → No).
4. **No mouse pointer on a touch screen:** install `unclutter` (`sudo apt install unclutter`) and start it next to
   the browser.

## Windows: Microsoft Edge kiosk

- **A shortcut:** `msedge.exe --kiosk http://<the board's address>:3002/ --edge-kiosk-type=fullscreen
  --no-first-run`, put in the Startup folder (Win+R → `shell:startup`) so it opens when Windows signs in.
- **Locked down:** Settings → Accounts → Other users → **Set up a kiosk** (assigned access): pick Microsoft Edge,
  **As a digital sign or interactive display**, and the board's address. Windows then signs in to just the board.
- Turn off sleep for the screen: Settings → System → Power → **Screen: never**.

## Mac

- Open the board in Chrome full screen (`open -a "Google Chrome" --args --kiosk http://<the board's address>:3002/`),
  and add Chrome to **System Settings → General → Login Items** so it starts with the Mac.
- System Settings → Lock Screen: **Turn display off: Never** (or let the board's own keep-awake hold it while it
  shows).

## If it's slow

- **Low-power screen** (⚙️ Settings → This screen, or the admin console → 📺 Screens for the wall) turns off
  everything that moves and draws the chalk plainer.
- On Android, update **Android System WebView** and turn hardware acceleration on in the kiosk app.
- To see what's slow, record a profile on the screen itself: in the kiosk app, turn on *WebView contents debugging*
  (Fully Kiosk: Advanced Web Settings), connect the screen to a computer by USB, open `chrome://inspect` in Chrome
  on the computer, pick the board, and record in the **Performance** tab while you tap and move a picture.
