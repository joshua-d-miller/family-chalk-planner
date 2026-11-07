#!/usr/bin/env bash
: <<'HEADER'
===============================================================================
 Family Chalk Planner | Deploy | reset-admin.sh
===============================================================================
 Version:   0.8.4
 Author:    Joshua D. Miller, Claude
 Updated:   2026-10-14

 Purpose:
     The last resort when nobody can sign in to the admin console any
     more. Removes EVERY person, sign-in, passkey and paired screen (the
     calendar, drawings, meals, jars, photos and settings stay) and prints
     a new one-time setup code. Then open /admin, create the admin again,
     and pair the screens again.

     sudo /opt/family-chalk-planner/deploy/reset-admin.sh [--yes]
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.3.0     2026-10-13   joshua    Admin console, paired screens, sign-in with
                        claude    passkeys or password + authenticator.

 0.4.0     2026-10-13   joshua    More defined cork; fix CI (ShellCheck SC1090
                        claude    in deploy/reset-admin.sh).

 0.7.0     2026-10-14   joshua    No more settings file - everything in the
                        claude    admin console and the database.

 0.8.4     2026-10-14   joshua    update.sh no longer stops silently without a
                        claude    .env; always says where it stopped.
===============================================================================
HEADER

set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env}"
if [ "${1:-}" != "--yes" ]; then
  echo "This removes every account and every paired screen of Family Chalk Planner."
  read -r -p "Type RESET to continue: " ans
  [ "$ans" = RESET ] || { echo "Nothing changed."; exit 1; }
fi
UNIT_USER="$(systemctl show -p User --value family-chalk-planner 2>/dev/null || true)"
NODE="$(command -v node)"
run() { if [ -n "$UNIT_USER" ] && [ "$(id -u)" = 0 ]; then runuser -u "$UNIT_USER" -- "$@"; else "$@"; fi; }
# where the data is: the service definition (install.sh), or an old .env
CONF=/etc/systemd/system/family-chalk-planner.service.d/server.conf
DATA_DIR="$(sed -n 's/.*[" ]DATA_DIR=\([^" ]*\).*/\1/p' "$CONF" 2>/dev/null | tail -1 || true)"
[ -z "$DATA_DIR" ] && [ -f "$ENV_FILE" ] && DATA_DIR="$(sed -n 's/^DATA_DIR=//p' "$ENV_FILE" | tr -d '"' | tail -1)"
DATA_DIR="${DATA_DIR:-$APP_DIR/data}"
cd "$APP_DIR"
run env PORT=0 DATA_DIR="$DATA_DIR" "$NODE" server/chalkboard.js --reset-admin
