#!/usr/bin/env bash
# Move a board that ran inside another Node app (the original "homelab-api" setup, where
# server.js ended with require('./chalkboard')) into its own family-chalk-planner service.
#
# 1. Clone the repo and install without starting:  bash <repo>/deploy/install.sh --no-start
# 2. Then:  bash <repo>/deploy/migrate-from-homelab-api.sh [options]
#      --old DIR          the old app folder            (default /opt/homelab-api)
#      --old-service NAME the old systemd service       (default homelab-api)
#      --timezone TZ --latitude N --longitude N --trash-day 0-6 --title "..."
#      --move-backups     use DATA_DIR/backup instead of keeping backups in OLD/backup
#      --rollback         undo: stop the new service, put the old setup back
set -euo pipefail
OLD=/opt/homelab-api OLD_SVC=homelab-api KEEP_BACKUPS=yes ROLLBACK=no
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env}" SERVICE=family-chalk-planner SVC_USER="${SVC_USER:-chalkplanner}"
declare -A SET=()
while [ $# -gt 0 ]; do
  case "$1" in
    --old) OLD="$2"; shift 2 ;;
    --old-service) OLD_SVC="$2"; shift 2 ;;
    --timezone) SET[TIMEZONE]="$2"; shift 2 ;;
    --latitude) SET[LATITUDE]="$2"; shift 2 ;;
    --longitude) SET[LONGITUDE]="$2"; shift 2 ;;
    --trash-day) SET[TRASH_DAY]="$2"; shift 2 ;;
    --title) SET[BOARD_TITLE]="\"$2\""; shift 2 ;;
    --move-backups) KEEP_BACKUPS=no; shift ;;
    --rollback) ROLLBACK=yes; shift ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done
say() { printf '\033[1;33m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mError:\033[0m %s\n' "$*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || die "run as root"

if [ "$ROLLBACK" = yes ]; then
  say "Rolling back to the old setup"
  systemctl disable --now "$SERVICE" 2>/dev/null || true
  [ -f "$OLD/server.js.pre-split" ] && cp -f "$OLD/server.js.pre-split" "$OLD/server.js"
  systemctl restart "$OLD_SVC"
  say "Done. The old app serves the board again (its data in $OLD was never changed)."
  exit 0
fi

[ -f "$OLD/chalkboard.db" ] || die "no $OLD/chalkboard.db - is --old right?"
[ -f "$APP_DIR/server/chalkboard.js" ] || die "run this from inside the family-chalk-planner folder"
[ -f "$ENV_FILE" ] || die "missing $ENV_FILE - run deploy/install.sh --no-start first"
DATA_DIR="$(sed -n 's/^DATA_DIR=//p' "$ENV_FILE" | tr -d '"' | tail -1)"; DATA_DIR="${DATA_DIR:-$APP_DIR/data}"

set_env() {
  local k="$1" v="$2" tmp
  if grep -qE "^#?${k}=" "$ENV_FILE"; then
    tmp="$(mktemp)"
    K="$k" V="$v" awk 'BEGIN{k=ENVIRON["K"]; v=ENVIRON["V"]; d=0} { if (!d && ($0 ~ "^"k"=" || $0 ~ "^#"k"=")) { print k"="v; d=1 } else print }' "$ENV_FILE" > "$tmp"
    cat "$tmp" > "$ENV_FILE"; rm -f "$tmp"
  else printf '%s=%s\n' "$k" "$v" >> "$ENV_FILE"; fi
}
old_env() {   # value of KEY from the old secrets file, exactly as written
  local f
  for f in "$OLD/secrets.env" "$OLD/.env"; do
    [ -f "$f" ] && { sed -n "s/^$1=//p" "$f" | tail -1; return; }
  done
}

say "Stopping $OLD_SVC"
systemctl stop "$OLD_SVC"

say "Copying the board's data into $DATA_DIR"
mkdir -p "$DATA_DIR"
cp -a "$OLD"/chalkboard.db* "$DATA_DIR"/
for d in clipart-cache photo-cache; do [ -d "$OLD/$d" ] && cp -a "$OLD/$d" "$DATA_DIR/"; done

if [ -x "$OLD/face/venv/bin/python" ] && [ ! -x "$APP_DIR/face/venv/bin/python" ]; then
  say "Reusing the installed face finder"
  cp -a "$OLD/face/venv" "$OLD/face/yunet.onnx" "$APP_DIR/face/" 2>/dev/null || true
  "$APP_DIR/face/venv/bin/python" -c 'import cv2' 2>/dev/null || bash "$APP_DIR/deploy/setup-face.sh" "$APP_DIR"
fi

say "Carrying settings over from $OLD"
map() { local v; v="$(old_env "$1")"; [ -n "$v" ] && set_env "$2" "$v"; return 0; }
map ICLOUD_USER CALDAV_USER; map ICLOUD_APP_PASSWORD CALDAV_PASSWORD; map ICLOUD_CALENDAR CALDAV_CALENDAR
map CALDAV_URL CALDAV_URL; map CHALK_PIN CHALK_PIN; map PHOTO_ALBUM_URL PHOTO_ALBUM_URL
for k in "${!SET[@]}"; do set_env "$k" "${SET[$k]}"; done

if [ "$KEEP_BACKUPS" = yes ] && [ -d "$OLD/backup" ]; then
  say "Keeping backups in $OLD/backup (Syncthing/restic need no changes)"
  set_env BACKUP_DIR "$OLD/backup"
  chown "$SVC_USER:$SVC_USER" "$OLD/backup"; [ -d "$OLD/backup/media" ] && chown -R "$SVC_USER:$SVC_USER" "$OLD/backup/media"
  drop="/etc/systemd/system/$SERVICE.service.d/hardening.conf"
  [ -f "$drop" ] && ! grep -qx "ReadWritePaths=$OLD/backup" "$drop" && echo "ReadWritePaths=$OLD/backup" >> "$drop"
fi
chown -R "$SVC_USER:$SVC_USER" "$DATA_DIR"; chmod 600 "$ENV_FILE"

say "Taking the board out of $OLD/server.js (copy kept as server.js.pre-split)"
[ -f "$OLD/server.js.pre-split" ] || cp -a "$OLD/server.js" "$OLD/server.js.pre-split"
sed -i -E "/require\(['\"]\.\/chalkboard(\.js)?['\"]\)/d" "$OLD/server.js"

systemctl daemon-reload
say "Starting $OLD_SVC and $SERVICE"
systemctl start "$OLD_SVC"
systemctl enable --quiet "$SERVICE"; systemctl restart "$SERVICE"
port="$(sed -n 's/^PORT=//p' "$ENV_FILE" | tail -1)"; port="${port:-3002}"
for _ in $(seq 1 30); do curl -fsS "http://127.0.0.1:$port/api/today" >/dev/null 2>&1 && break; sleep 1; done
if curl -fsS "http://127.0.0.1:$port/api/today" >/dev/null 2>&1; then
  say "Done: the board now runs as $SERVICE on port $port. $OLD_SVC runs without it."
  echo "    Old data is untouched in $OLD (delete chalkboard.db*, chalkboard.js, chalkboard-public, clipart-cache,"
  echo "    photo-cache and face/ there once you're happy). Undo with: $0 --rollback"
else
  die "$SERVICE didn't come up (journalctl -u $SERVICE -n 50). Undo with: $0 --rollback"
fi
