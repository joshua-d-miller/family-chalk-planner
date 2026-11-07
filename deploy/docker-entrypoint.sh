#!/bin/sh
: <<'HEADER'
===============================================================================
 Family Chalk Planner | Deploy | docker-entrypoint.sh
===============================================================================
 Version:   0.5.0
 Author:    Joshua D. Miller, Claude
 Updated:   2026-10-14

 Purpose:
     The container's start: makes /data writable by the board's user (PUID
     and PGID, default 1000:1000), then drops root and runs the board.
     Already running as a non-root user? It just runs it.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.5.0     2026-10-14   joshua    Docker install and settings in the admin
                        claude    console.
===============================================================================
HEADER

set -eu
if [ "$(id -u)" = 0 ]; then
  mkdir -p "${DATA_DIR:-/data}"
  if [ "$(stat -c %u:%g "${DATA_DIR:-/data}")" != "${PUID}:${PGID}" ]; then
    chown -R "${PUID}:${PGID}" "${DATA_DIR:-/data}"
  fi
  chmod 700 "${DATA_DIR:-/data}"
  exec setpriv --reuid="${PUID}" --regid="${PGID}" --clear-groups -- "$@"
fi
exec "$@"
