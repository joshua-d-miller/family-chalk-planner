#!/usr/bin/env bash
: <<'HEADER'
===============================================================================
 Family Chalk Planner | Deploy | setting.sh
===============================================================================
 Version:   0.8.4
 Author:    Joshua D. Miller, Claude
 Updated:   2026-10-14

 Purpose:
     Reads or changes one board setting from the server itself, for when
     the admin console can't be reached (for example a wrong https address
     or proxy). Normally use the admin console, ⚙️ Board.

     sudo deploy/setting.sh get PUBLIC_URL
     sudo deploy/setting.sh set PUBLIC_URL https://board.example.com
     sudo deploy/setting.sh set TRUST_PROXY     (no value = clear it)

     Then: systemctl restart family-chalk-planner
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.7.0     2026-10-14   joshua    No more settings file - everything in the
                        claude    admin console and the database.

 0.8.4     2026-10-14   joshua    update.sh no longer stops silently without a
                        claude    .env; always says where it stopped.
===============================================================================
HEADER

set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONF=/etc/systemd/system/family-chalk-planner.service.d/server.conf
[ $# -ge 2 ] || { sed -n '/^ Purpose:/,/^=====/p' "$0" | sed '$d'; exit 2; }
DATA_DIR="$(sed -n 's/.*[" ]DATA_DIR=\([^" ]*\).*/\1/p' "$CONF" 2>/dev/null | tail -1 || true)"; DATA_DIR="${DATA_DIR:-$APP_DIR/data}"
UNIT_USER="$(systemctl show -p User --value family-chalk-planner 2>/dev/null || true)"
cd "$APP_DIR"
if [ -n "$UNIT_USER" ] && [ "$UNIT_USER" != root ] && [ "$(id -u)" = 0 ]; then
  exec runuser -u "$UNIT_USER" -- env DATA_DIR="$DATA_DIR" node server/chalkboard.js --setting "$@"
fi
exec env DATA_DIR="$DATA_DIR" node server/chalkboard.js --setting "$@"
