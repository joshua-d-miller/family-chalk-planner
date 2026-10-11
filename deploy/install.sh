#!/usr/bin/env bash
# Family Chalk Planner installer for Debian 12/13 and Ubuntu 22.04/24.04
# (a Proxmox LXC, a VM, a Raspberry Pi with 64-bit OS, or any small Linux box). Run as root.
#
#   From GitHub:     bash install.sh --repo https://github.com/OWNER/family-chalk-planner.git
#   From a folder:   bash deploy/install.sh --source /path/to/family-chalk-planner
#
# Options:
#   --repo URL       git URL to clone (https, or an SSH alias for a private repo; see docs/install.md)
#   --branch NAME    branch or tag to install (default: main)
#   --source DIR     copy the app from a local folder instead of cloning
#   --no-face        skip the optional face finder (saves ~220 MB)
#   --no-start       install everything but don't start the service (used when migrating)
#   --force          reinstall over an existing install (settings and data are kept)
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/family-chalk-planner}"
ETC_DIR="${ETC_DIR:-/etc/family-chalk-planner}"
DATA_DIR="${DATA_DIR:-/var/lib/family-chalk-planner}"
SVC_USER="${SVC_USER:-chalkplanner}"
SERVICE=family-chalk-planner
REPO="" BRANCH=main SOURCE="" FACE=yes START=yes FORCE=no
# For testing only: SKIP_PACKAGES=1 (no apt/Node install), SKIP_SYSTEMD=1, SKIP_USER=1

while [ $# -gt 0 ]; do
  case "$1" in
    --repo) REPO="$2"; shift 2 ;;
    --branch) BRANCH="$2"; shift 2 ;;
    --source) SOURCE="$2"; shift 2 ;;
    --no-face) FACE=no; shift ;;
    --no-start) START=no; shift ;;
    --force) FORCE=yes; shift ;;
    -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

say() { printf '\033[1;33m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mError:\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || die "run as root (sudo bash install.sh ...)"
[ -n "$REPO" ] || [ -n "$SOURCE" ] || die "say where the app comes from: --repo URL or --source DIR"
if [ -e "$APP_DIR/server/chalkboard.js" ] && [ "$FORCE" != yes ]; then
  die "already installed in $APP_DIR. Use $APP_DIR/deploy/update.sh to update, or --force to reinstall."
fi

# ---- packages and Node.js 22 ----
node_ok() { command -v node >/dev/null && node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=5)?0:1)'; }
if [ "${SKIP_PACKAGES:-}" != 1 ]; then
  export DEBIAN_FRONTEND=noninteractive
  say "Installing packages (curl, git, ca-certificates)"
  apt-get update -qq
  apt-get install -y -qq curl git ca-certificates openssh-client >/dev/null
  if ! node_ok; then
    say "Installing Node.js 22 (NodeSource)"
    curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh
    bash /tmp/nodesource_setup.sh >/dev/null
    apt-get install -y -qq nodejs >/dev/null
    rm -f /tmp/nodesource_setup.sh
  fi
fi
node_ok || die "Node.js 22.5 or newer is required (found: $(node -v 2>/dev/null || echo none))"

# ---- the app (owned by root: the service can read it but not change it) ----
say "Installing the app into $APP_DIR"
mkdir -p "$APP_DIR"
if [ -n "$SOURCE" ]; then
  [ -f "$SOURCE/server/chalkboard.js" ] || die "$SOURCE doesn't look like the app (no server/chalkboard.js)"
  tar -C "$SOURCE" --exclude=node_modules --exclude=data --exclude=face/venv --exclude='*.env' -cf - . | tar -C "$APP_DIR" -xf -
elif [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch --quiet origin && git -C "$APP_DIR" checkout --quiet "$BRANCH" && git -C "$APP_DIR" merge --quiet --ff-only "origin/$BRANCH"
else
  [ -z "$(ls -A "$APP_DIR" 2>/dev/null)" ] || die "$APP_DIR is not empty and not a git checkout"
  git clone --quiet --branch "$BRANCH" "$REPO" "$APP_DIR"
fi
( cd "$APP_DIR" && npm ci --omit=dev --no-audit --no-fund --loglevel=error )
chown -R root:root "$APP_DIR"
chmod -R go-w "$APP_DIR"

# ---- service user and data folder ----
if [ "${SKIP_USER:-}" != 1 ] && ! id "$SVC_USER" >/dev/null 2>&1; then
  say "Creating system user $SVC_USER"
  useradd --system --home-dir "$DATA_DIR" --no-create-home --shell /usr/sbin/nologin "$SVC_USER"
fi
mkdir -p "$DATA_DIR"
[ "${SKIP_USER:-}" = 1 ] || chown -R "$SVC_USER:$SVC_USER" "$DATA_DIR"
chmod 750 "$DATA_DIR"

# ---- settings (secrets stay root-only) ----
mkdir -p "$ETC_DIR"; chmod 700 "$ETC_DIR"
ENV_FILE="$ETC_DIR/planner.env"
NEW_PIN=""
set_env() {   # set_env KEY VALUE  - replace the line if present, otherwise append
  local k="$1" v="$2"
  if grep -qE "^#?${k}=" "$ENV_FILE"; then
    local tmp; tmp="$(mktemp)"
    K="$k" V="$v" awk 'BEGIN{k=ENVIRON["K"]; v=ENVIRON["V"]; done=0} { if (!done && ($0 ~ "^"k"=" || $0 ~ "^#"k"=")) { print k"="v; done=1 } else print }' "$ENV_FILE" > "$tmp"
    cat "$tmp" > "$ENV_FILE"; rm -f "$tmp"
  else
    printf '%s=%s\n' "$k" "$v" >> "$ENV_FILE"
  fi
}
if [ ! -f "$ENV_FILE" ]; then
  say "Creating settings file $ENV_FILE"
  cp "$APP_DIR/.env.example" "$ENV_FILE"
  NEW_PIN="$(printf '%06d' $(( $(od -An -N4 -tu4 /dev/urandom | tr -d ' ') % 1000000 )))"
  set_env CHALK_PIN "$NEW_PIN"
  set_env DATA_DIR "$DATA_DIR"
  tz="$(timedatectl show -p Timezone --value 2>/dev/null || cat /etc/timezone 2>/dev/null || true)"
  [ -n "$tz" ] && set_env TIMEZONE "$tz"
fi
chmod 600 "$ENV_FILE"; chown root:root "$ENV_FILE"

# ---- optional face finder ----
if [ "$FACE" = yes ]; then
  say "Installing the face finder (photo framing; a minute or two)"
  bash "$APP_DIR/deploy/setup-face.sh" "$APP_DIR" || say "Face finder skipped (photos will use a centered crop)"
fi

# ---- systemd ----
if [ "${SKIP_SYSTEMD:-}" != 1 ]; then
  say "Installing the $SERVICE service"
  install -m 644 "$APP_DIR/deploy/$SERVICE.service" "/etc/systemd/system/$SERVICE.service"
  mkdir -p "/etc/systemd/system/$SERVICE.service.d"
  # sandboxing only where it works (some LXC containers can't create the namespaces it needs)
  if systemd-run --quiet --wait --collect -p ProtectSystem=strict -p PrivateTmp=yes -p ProtectHome=yes -p RestrictNamespaces=yes -p NoNewPrivileges=yes /bin/true 2>/dev/null; then
    {
      cat "$APP_DIR/deploy/hardening.conf"
      echo "ReadWritePaths=$DATA_DIR"
      bd="$(sed -n 's/^BACKUP_DIR=//p' "$ENV_FILE" | tr -d '"' | tail -1)"
      [ -n "$bd" ] && echo "ReadWritePaths=$bd"
    } > "/etc/systemd/system/$SERVICE.service.d/hardening.conf"
  else
    say "This system can't sandbox services (common in LXC without nesting) - running without it"
    rm -f "/etc/systemd/system/$SERVICE.service.d/hardening.conf"
  fi
  systemctl daemon-reload
  systemctl enable --quiet "$SERVICE"
  if [ "$START" = yes ]; then
    systemctl restart "$SERVICE"
    port="$(sed -n 's/^PORT=//p' "$ENV_FILE" | tail -1)"; port="${port:-3002}"
    for _ in $(seq 1 30); do curl -fsS "http://127.0.0.1:$port/api/today" >/dev/null 2>&1 && break; sleep 1; done
    curl -fsS "http://127.0.0.1:$port/api/today" >/dev/null 2>&1 || die "the service didn't come up - see: journalctl -u $SERVICE -n 50"
  fi
fi

ip="$(hostname -I 2>/dev/null | awk '{print $1}')"; port="$(sed -n 's/^PORT=//p' "$ENV_FILE" | tail -1)"
echo
say "Family Chalk Planner is installed."
echo "    Wall display:  http://${ip:-<this-machine>}:${port:-3002}/"
echo "    Tablet editor: http://${ip:-<this-machine>}:${port:-3002}/edit"
[ -n "$NEW_PIN" ] && echo "    Editing PIN:   $NEW_PIN   (write it down; change it in $ENV_FILE)"
echo "    Settings:      $ENV_FILE  (calendar, timezone, weather, trash day, photos)"
echo "                   then: systemctl restart $SERVICE"
echo "    Updates:       $APP_DIR/deploy/update.sh"
