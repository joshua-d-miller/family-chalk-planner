#!/usr/bin/env bash
# Last resort when nobody can sign in to the admin console any more.
# Removes EVERY person, sign-in, passkey and paired screen (the calendar, drawings, meals,
# jars, photos and settings stay) and prints a new one-time setup code. Then open /admin,
# create the admin again, and re-pair the screens. Run on the server:
#   sudo /opt/family-chalk-planner/deploy/reset-admin.sh
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
