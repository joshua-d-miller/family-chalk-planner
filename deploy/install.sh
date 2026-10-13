#!/usr/bin/env bash
# Family Chalk Planner installer. The git checkout IS the install: clone the repo wherever you
# like and run this from inside it. It only adds what can't live in the repo folder:
# Node.js 22 (if missing), a service user, and the systemd service pointing back at this folder.
#
#   git clone https://github.com/joshua-d-miller/family-chalk-planner.git /opt/family-chalk-planner
#   sudo bash /opt/family-chalk-planner/deploy/install.sh
#
# Settings live in <repo>/.env (root-only) and data in <repo>/data; both are git-ignored, so
# `git pull` never touches them. (Don't run `git clean -x` here: it would delete them.)
#
# Options:
#   --no-face      skip the optional face finder for photo framing (saves ~220 MB)
#   --no-start     set everything up but don't start the service (used when migrating)
#   --unit-only    just (re)write the systemd service, e.g. after moving the folder
#   --data DIR     keep data somewhere else (default <repo>/data)
#   --user NAME    service user (default chalkplanner)
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env}"
DATA_DIR="" SVC_USER=chalkplanner FACE=yes START=yes UNIT_ONLY=no
SERVICE=family-chalk-planner
# For testing only: SKIP_PACKAGES=1 (no apt/Node install), SKIP_SYSTEMD=1, SKIP_USER=1

while [ $# -gt 0 ]; do
  case "$1" in
    --no-face) FACE=no; shift ;;
    --no-start) START=no; shift ;;
    --unit-only) UNIT_ONLY=yes; shift ;;
    --data) DATA_DIR="$2"; shift 2 ;;
    --user) SVC_USER="$2"; shift 2 ;;
    -h|--help) sed -n '2,19p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

say() { printf '\033[1;33m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mError:\033[0m %s\n' "$*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || die "run as root (sudo bash deploy/install.sh)"
[ -f "$APP_DIR/server/chalkboard.js" ] || die "run this from inside the family-chalk-planner folder"
envval() { sed -n "s/^$1=//p" "$ENV_FILE" 2>/dev/null | tr -d '"' | tail -1; }

# ---- systemd service (pointing at this folder) ----
write_unit() {
  [ "${SKIP_SYSTEMD:-}" = 1 ] && return 0
  local node data bd unit="/etc/systemd/system/$SERVICE.service" drop="/etc/systemd/system/$SERVICE.service.d"
  node="$(command -v node)"
  data="$(envval DATA_DIR)"; data="${data:-$APP_DIR/data}"
  sed -e "s#@APP_DIR@#$APP_DIR#g" -e "s#@ENV_FILE@#$ENV_FILE#g" -e "s#@NODE@#$node#g" -e "s#@USER@#$SVC_USER#g" \
    "$APP_DIR/deploy/$SERVICE.service" > "$unit"
  chmod 644 "$unit"
  mkdir -p "$drop"
  # sandboxing only where it works (some LXC containers can't create the namespaces it needs)
  if systemd-run --quiet --wait --collect -p ProtectSystem=strict -p PrivateTmp=yes -p ProtectHome=read-only -p RestrictNamespaces=yes -p NoNewPrivileges=yes /bin/true 2>/dev/null; then
    {
      cat "$APP_DIR/deploy/hardening.conf"
      echo "ReadWritePaths=$data"
      bd="$(envval BACKUP_DIR)"; [ -n "$bd" ] && echo "ReadWritePaths=$bd"
    } > "$drop/hardening.conf"
  else
    say "This system can't sandbox services (common in LXC without nesting) - running without it"
    rm -f "$drop/hardening.conf"
  fi
  systemctl daemon-reload
}
if [ "$UNIT_ONLY" = yes ]; then write_unit; say "Service updated to run from $APP_DIR"; exit 0; fi

# ---- packages and Node.js 22 ----
node_ok() { command -v node >/dev/null && node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=5)?0:1)'; }
if [ "${SKIP_PACKAGES:-}" != 1 ]; then
  export DEBIAN_FRONTEND=noninteractive
  say "Installing packages (curl, git, ca-certificates)"
  apt-get update -qq
  apt-get install -y -qq curl git ca-certificates >/dev/null
  if ! node_ok; then
    say "Installing Node.js 22 (NodeSource)"
    curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh
    bash /tmp/nodesource_setup.sh >/dev/null
    apt-get install -y -qq nodejs >/dev/null
    rm -f /tmp/nodesource_setup.sh
  fi
fi
node_ok || die "Node.js 22.5 or newer is required (found: $(node -v 2>/dev/null || echo none))"

say "Installing dependencies"
OWNER="$(stat -c %U "$APP_DIR")"
as_owner() { if [ "$OWNER" = root ]; then "$@"; else runuser -u "$OWNER" -- "$@"; fi; }   # keep the checkout owned by whoever cloned it
( cd "$APP_DIR" && as_owner npm ci --omit=dev --no-audit --no-fund --loglevel=error )
chmod -R o-w "$APP_DIR"   # the service user can read the code but never change it

# ---- service user ----
if [ "${SKIP_USER:-}" != 1 ] && ! id "$SVC_USER" >/dev/null 2>&1; then
  say "Creating system user $SVC_USER"
  useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin "$SVC_USER"
fi

# ---- settings (root-only) ----
set_env() {   # set_env KEY VALUE - replace the line if present, otherwise append
  local k="$1" v="$2" tmp
  if grep -qE "^#?${k}=" "$ENV_FILE"; then
    tmp="$(mktemp)"
    K="$k" V="$v" awk 'BEGIN{k=ENVIRON["K"]; v=ENVIRON["V"]; d=0} { if (!d && ($0 ~ "^"k"=" || $0 ~ "^#"k"=")) { print k"="v; d=1 } else print }' "$ENV_FILE" > "$tmp"
    cat "$tmp" > "$ENV_FILE"; rm -f "$tmp"
  else printf '%s=%s\n' "$k" "$v" >> "$ENV_FILE"; fi
}
if [ ! -f "$ENV_FILE" ]; then
  say "Creating settings file $ENV_FILE"
  cp "$APP_DIR/.env.example" "$ENV_FILE"
  tz="$(timedatectl show -p Timezone --value 2>/dev/null || cat /etc/timezone 2>/dev/null || true)"
  [ -n "$tz" ] && set_env TIMEZONE "$tz"
fi
[ -n "$DATA_DIR" ] && set_env DATA_DIR "$DATA_DIR"
chmod 600 "$ENV_FILE"; chown root:root "$ENV_FILE"

# ---- data folder (the only place the service can write) ----
DATA_DIR="$(envval DATA_DIR)"; DATA_DIR="${DATA_DIR:-$APP_DIR/data}"
mkdir -p "$DATA_DIR"
[ "${SKIP_USER:-}" = 1 ] || chown -R "$SVC_USER:$SVC_USER" "$DATA_DIR"
chmod 750 "$DATA_DIR"

# ---- optional face finder ----
if [ "$FACE" = yes ]; then
  say "Installing the face finder (photo framing; a minute or two)"
  bash "$APP_DIR/deploy/setup-face.sh" "$APP_DIR" || say "Face finder skipped (photos will use a centered crop)"
fi

# ---- start ----
if [ "${SKIP_SYSTEMD:-}" != 1 ]; then
  say "Installing the $SERVICE service (runs from $APP_DIR)"
  write_unit
  systemctl enable --quiet "$SERVICE"
  if [ "$START" = yes ]; then
    systemctl restart "$SERVICE"
    port="$(envval PORT)"; port="${port:-3002}"
    for _ in $(seq 1 30); do curl -fsS "http://127.0.0.1:$port/api/today" >/dev/null 2>&1 && break; sleep 1; done
    curl -fsS "http://127.0.0.1:$port/api/today" >/dev/null 2>&1 || die "the service didn't come up - see: journalctl -u $SERVICE -n 50"
  fi
fi

ip="$(hostname -I 2>/dev/null | awk '{print $1}')"; port="$(envval PORT)"
echo
say "Family Chalk Planner is installed (running from $APP_DIR)."
echo "    Wall display:  http://${ip:-<this-machine>}:${port:-3002}/"
echo "    Tablet editor: http://${ip:-<this-machine>}:${port:-3002}/edit"
if [ -f "$DATA_DIR/setup-code.txt" ]; then
  echo "    Setup code:    $(cat "$DATA_DIR/setup-code.txt")   (open http://${ip:-<this-machine>}:${port:-3002}/admin and create the admin account)"
fi
echo "    Admin console: http://${ip:-<this-machine>}:${port:-3002}/admin  (pair screens, invite people)"
echo "    Settings:      $ENV_FILE  (calendar, timezone, weather, trash day, photos)"
echo "                   then: systemctl restart $SERVICE"
echo "    Updates:       $APP_DIR/deploy/update.sh"
