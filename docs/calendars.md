# Calendars: which one, and how to connect it

The board shows one main calendar you can **add to and change from the board**, any other calendars from
the same account (each in its own color), and any number of **calendar links**, which are read-only. All of
it is set in the admin console → **⚙️ Board**.

| Your calendar | Add and change events from the board? | How |
| --- | --- | --- |
| **iCloud** (iPhone, iPad, Mac) | Yes | [CalDAV with an app-specific password](#icloud) |
| **Google Calendar** | Yes | [Google sign-in](google-calendar.md) (about 15 minutes, once) |
| **Nextcloud, Fastmail, Synology, Radicale** and other CalDAV servers | Yes | [CalDAV](#other-caldav-calendars) |
| **Outlook.com, Microsoft 365** | No, read-only | [A published calendar link](#outlook-and-microsoft-365) |
| **School, sports teams, anything with an iCal / webcal link** | No, read-only | [Calendar links](#calendar-links) |

Calendar links are read again every 15 minutes, so a change made elsewhere can take that long to show up
(plus however often the service updates its link; Outlook and Google can take longer).

## iCloud

1. On [account.apple.com](https://account.apple.com), sign in and go to **Sign-In and Security →
   App-Specific Passwords → +**. Name it "Chalk Planner" and copy the password it shows. (This isn't your
   Apple ID password, and you can remove it there any time.)
2. In the admin console → **⚙️ Board → Calendar**, keep **iCloud or other CalDAV**:
   - Server address: `https://caldav.icloud.com/`
   - Username / Apple ID: your Apple ID email
   - Password: the app-specific password
3. Tap **Find my calendars**, pick the one the board shows (new events go there), then **Save and restart**.

Other iCloud calendars (a shared family calendar, the kids'): **More calendars from this account → List my
calendars**.

An app-specific password opens that Apple account's iCloud mail and contacts too, not just its calendars, and
Apple has no way to narrow it. On a board at home that's fine; on a [rented server](cloud.md), consider an Apple ID
just for the board that owns the family calendar ([why](cloud.md#whats-on-the-server-and-how-to-limit-it)).

## Google Calendar

Google doesn't allow a password here; the board signs in to Google instead. That needs a small Google Cloud
project of your own, once: [google-calendar.md](google-calendar.md) walks through it.

Just want to *show* a Google calendar, not change it? Its **secret address in iCal format** works as a
[calendar link](#calendar-links): Google Calendar → ⚙️ Settings → your calendar → **Integrate calendar →
Secret address in iCal format**.

## Other CalDAV calendars

In **⚙️ Board → Calendar**, keep **iCloud or other CalDAV**, and enter the server's CalDAV address, your
username and a password (an app password, if the service has them). Then **Find my calendars**.

The CalDAV address is in each service's settings or help pages, usually under "CalDAV", "sync" or "other
apps". For example, Nextcloud's is `https://<your nextcloud>/remote.php/dav/`. Services with two-step sign-in
(Fastmail, Nextcloud) want an **app password** made for the board.

Any other service that offers CalDAV works the same way.

## Outlook and Microsoft 365

Outlook doesn't offer CalDAV, so the board can't add events to an Outlook calendar. It can show one, from a
published link:

1. Open Outlook on the web ([outlook.com](https://outlook.com), or [outlook.office.com](https://outlook.office.com)
   for a work or school account) and go to **⚙️ Settings → Calendar → Shared calendars**.
2. Under **Publish a calendar**, pick the calendar and **Can view all details**, then **Publish**.
3. Copy the **ICS** link (not the HTML one). It looks like
   `https://outlook.live.com/owa/calendar/…/calendar.ics`.
4. In the admin console → **⚙️ Board → Calendar links**, add it with a name and a color, then **Save and
   restart**.

Anyone with that link can see the calendar, so keep it private. To stop it, go back to **Publish a calendar**
and choose **Unpublish**. A work or school account's administrator can turn publishing off; if you don't see
**Publish a calendar**, ask them.

Want to add events from the board too? Keep a family calendar in iCloud, Google or another CalDAV service as
the main one, and show Outlook beside it as a link.

## Calendar links

**⚙️ Board → Calendar links → Add**: a name ("School"), the link, and a color. Links that start with
`webcal://` work as they are. They're read-only: their events show on the board and can't be changed there.

Where to find them:
- **A school, league or team site:** look for "Subscribe", "iCal", "ICS" or "Add to calendar".
- **Google Calendar:** ⚙️ Settings → your calendar → Integrate calendar → **Secret address in iCal format**.
- **iCloud:** in the Calendar app, the share button next to a calendar → **Public Calendar** → copy the link.
- **Outlook:** see [above](#outlook-and-microsoft-365).

## If a calendar doesn't show

- **⚙️ Board** says what's wrong next to the calendar or link (a wrong password, "isn't a calendar").
- **iCloud:** use an **app-specific password**, not your Apple ID password.
- **A calendar link:** open it in a browser. It should download a file or show text starting with
  `BEGIN:VCALENDAR`. A web page instead means it's the HTML link, not the ICS one.
- Times an hour off? Check the board's **time zone** in ⚙️ Board.
