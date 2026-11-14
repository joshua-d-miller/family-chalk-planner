#!/bin/sh
: <<'HEADER'
===============================================================================
 Family Chalk Planner | Deploy | docker-entrypoint.sh
===============================================================================
 Version:   0.17.1
 Author:    Joshua D. Miller, Claude
 Updated:   2026-11-14

 Purpose:
     The container's start: makes /data writable by the board's user (PUID
     and PGID, default 1000:1000), then drops root and runs the board.
     Already running as a non-root user? It just runs it. Saving settings
     in the admin console ends the board with code 3 so they take effect:
     it's started again right here, in the same container (Home Assistant
     doesn't restart an app that stops the way Docker Compose does).
     As a Home Assistant app, the app's "Reset the admin" option (in
     /data/options.json) clears every account once and prints a new setup
     code, for a family locked out of the console.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.5.0     2026-10-14   joshua    Docker install and settings in the admin
                        claude    console.

 0.17.1    2026-11-14   joshua    Starts the board again after saved
                        claude    settings (code 3), inside the container:
                                  the Home Assistant app; its "Reset the
                                  admin" option.
===============================================================================
HEADER

set -eu

# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
### ------------------------------------- ###
### | Run it, again after saved settings | ###
### ------------------------------------- ###
### Stopping the container (TERM) is passed on to the board, which shuts   ###
### down cleanly; any other way of ending is the container's end too.      ###
run() {
  while :; do
    "$@" &
    pid=$!
    trap 'kill -TERM "$pid" 2>/dev/null' TERM INT
    while :; do
      code=0
      wait "$pid" || code=$?
      kill -0 "$pid" 2>/dev/null || break   # still running: the wait was cut short by a signal
    done
    trap - TERM INT
    [ "$code" = 3 ] || exit "$code"
    echo "Family Chalk Planner: starting again with the new settings"
  done
}

# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
### ----------------------------------------------- ###
### | Home Assistant: "Reset the admin", just once | ###
### ----------------------------------------------- ###
### Turned on in the app's Configuration tab: every account and paired     ###
### screen is removed (the calendar, art and settings stay) and a new setup ###
### code shows in the Log. It happens once until the option goes off again. ###
reset_admin() {
  opts="${DATA_DIR:-/data}/options.json"; done_file="${DATA_DIR:-/data}/.reset-admin-done"
  [ -f "$opts" ] || return 0
  if node -e 'process.exit(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).reset_admin === true ? 0 : 1)' "$opts" 2>/dev/null; then
    [ -f "$done_file" ] && return 0
    echo "Family Chalk Planner: resetting the admin (the app's Reset the admin option); turn it off again afterwards"
    "$@" node server/chalkboard.js --reset-admin
    touch "$done_file"
  else
    rm -f "$done_file"
  fi
}

if [ "$(id -u)" = 0 ]; then
  mkdir -p "${DATA_DIR:-/data}"
  if [ "$(stat -c %u:%g "${DATA_DIR:-/data}")" != "${PUID}:${PGID}" ]; then
    chown -R "${PUID}:${PGID}" "${DATA_DIR:-/data}"
  fi
  chmod 700 "${DATA_DIR:-/data}"
  reset_admin setpriv --reuid="${PUID}" --regid="${PGID}" --clear-groups --
  run setpriv --reuid="${PUID}" --regid="${PGID}" --clear-groups -- "$@"
fi
reset_admin
run "$@"
