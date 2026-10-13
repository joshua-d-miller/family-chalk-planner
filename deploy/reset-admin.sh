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
set -a; [ -f "$ENV_FILE" ] && . "$ENV_FILE"; set +a
cd "$APP_DIR"
run env PORT=0 "$NODE" server/chalkboard.js --reset-admin
