#!/usr/bin/env bash
# Read or change one board setting from the server, for when the admin console can't be reached
# (for example a wrong https address or proxy). Normally use the admin console → ⚙️ Board.
#   sudo /opt/family-chalk-planner/deploy/setting.sh get PUBLIC_URL
#   sudo /opt/family-chalk-planner/deploy/setting.sh set PUBLIC_URL https://board.example.com
#   sudo /opt/family-chalk-planner/deploy/setting.sh set TRUST_PROXY          (no value = clear it)
# Then: systemctl restart family-chalk-planner
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONF=/etc/systemd/system/family-chalk-planner.service.d/server.conf
[ $# -ge 2 ] || { sed -n '2,7p' "$0"; exit 2; }
DATA_DIR="$(sed -n 's/.*[" ]DATA_DIR=\([^" ]*\).*/\1/p' "$CONF" 2>/dev/null | tail -1 || true)"; DATA_DIR="${DATA_DIR:-$APP_DIR/data}"
UNIT_USER="$(systemctl show -p User --value family-chalk-planner 2>/dev/null || true)"
cd "$APP_DIR"
if [ -n "$UNIT_USER" ] && [ "$UNIT_USER" != root ] && [ "$(id -u)" = 0 ]; then
  exec runuser -u "$UNIT_USER" -- env DATA_DIR="$DATA_DIR" node server/chalkboard.js --setting "$@"
fi
exec env DATA_DIR="$DATA_DIR" node server/chalkboard.js --setting "$@"
