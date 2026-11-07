/*
===============================================================================
 Family Chalk Planner | Server | chalkboard.js
===============================================================================
 Version:   0.13.0
 Author:    Joshua D. Miller, Claude
 Updated:   2026-11-06

 Purpose:
     Starts the board: `node server/chalkboard.js`. The real start is
     server/main.ts; this file keeps the address the service, Docker and
     older installs already use.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.1.0     2026-10-11   joshua    Standalone service, installer, updater,
                        claude    tests.

 0.3.0     2026-10-13   joshua    Point docs and source link at joshua-d-
                        claude    miller/family-chalk-planner.

                                  Google Calendar, Settings, Up next, tap-a-
                                  day, photos per month.

                                  Photos from a Google Photos shared album.

                                  Notes column: "Today" option showing
                                  everything still to come today.

                                  ... and 2 more ()

 0.4.0     2026-10-13   joshua    Board backgrounds: black slate, green and
                        claude    blue chalkboard, cork, kraft paper,
                                  whiteboard.

 0.4.1     2026-10-13   joshua    Real clipart (Fluent Emoji, MIT); no zoom on
                        claude    family screens.

 0.4.3     2026-10-14   joshua    Add GIFs from a link (GIPHY, Tenor, KLIPY,
                        claude    any .gif) - the board keeps its own copy.

 0.4.4     2026-10-14   joshua    Bundled fonts, stricter page protections,
                        claude    HTTPS/proxy warnings, media tidy-up,
                                  releases.

 0.5.0     2026-10-14   joshua    Docker install and settings in the admin
                        claude    console.

 0.6.0     2026-10-14   joshua    More calendars, iCal links, Monday weeks,
                        claude    24-hour time, CA/GB holidays.

 0.7.0     2026-10-14   joshua    README: screenshots of the wall, backgrounds
                        claude    and admin console.

                                  No more settings file - everything in the
                                  admin console and the database.

 0.8.0     2026-10-14   joshua    The encryption key: documented, backed up
                        claude    right away, shown in the console.

                                  Four new backgrounds, optional seasonal
                                  pattern, plainer console fonts.

 0.8.1     2026-10-14   joshua    update.sh installs any missing packages
                        claude    (fonts) and undoes a half-finished update.

 0.9.0     2026-10-16   joshua    Kids pick which piece goes in their reward
                        claude    jar; jars remember every piece in order.

 0.10.0    2026-10-23   joshua    Event size on the board (Large / Extra
                        claude    large), XL month title, tap a day to see its
                                  events.

 0.11.0    2026-10-28   joshua    Holiday borders around the calendar; chalk
                        claude    drawings (hand-picked Game Icons, CC BY 3.0)
                                  in any color.

 0.12.0    2026-10-28   joshua    Chores - a family checklist on the board
                        claude    (swipe from the calendar, /chores on phones,
                                  kid's tablets).

 0.12.1    2026-10-28   joshua    Art moves with the days when a border is
                        claude    added, resized or removed; XL title fits
                                  above the calendar.

                                  Title photos are back; Month title and
                                  Border move to the strip; Title photos
                                  switch.

 0.12.2    2026-10-29   joshua    Hide holidays (tap a holiday for the list);
                        claude    tapping an event in a day's list opens it
                                  again.

 0.13.0    2026-11-06   joshua    TypeScript groundwork: type-check, lint and
                        claude    format in CI; chores is the first TypeScript
                                  module.

                                  Settings (admin console → ⚙️ Board) in
                                  TypeScript, same behavior.

                                  Dates and holidays in their own TypeScript
                                  modules.

                                  Live updates, nightly backup and the Notes
                                  extras in their own TypeScript modules.

                                  ... and 6 more (the board rebuilt in React
                                  and TypeScript)
===============================================================================
*/

import './main.ts';
