#!/bin/sh
# Container start: make /data writable by the board's user (PUID:PGID, default 1000:1000), then
# drop root and run the board. Already running as a non-root user? Just run it.
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
