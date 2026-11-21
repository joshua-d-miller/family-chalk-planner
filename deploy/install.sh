#!/usr/bin/env bash
: <<'HEADER'
===============================================================================
 Family Chalk Planner | Deploy | install.sh
===============================================================================
 Version:   1.2.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-10-11
 Updated:   2026-11-21

 Purpose:
     Installs Family Chalk Planner on a Debian or Ubuntu machine (a
     Proxmox container, a Raspberry Pi, a small PC). The git checkout IS
     the install: clone the repo wherever you like and run this from
     inside it. It only adds what can't live in the repo folder: Node.js
     22 (if missing), a service user, and the systemd services pointing
     back at this folder.

 Usage:
     git clone https://github.com/joshua-d-miller/family-chalk-planner.git \
         /opt/family-chalk-planner
     sudo bash /opt/family-chalk-planner/deploy/install.sh [options]

 Options:
     --no-face         skip the optional face finder for photo framing
                       (saves about 220 MB)
     --no-start        set everything up but don't start the service
     --unit-only       just (re)write the systemd services, e.g. after
                       moving the folder
     --data DIR        keep data somewhere else (default <repo>/data)
     --backup-dir DIR  nightly backups somewhere else (default
                       <data>/backup)
     --port N          port (default 3002)
     --bind ADDR       address to listen on (default 0.0.0.0)
     --user NAME       service user (default chalkplanner)

 How it fits:
     Data lives in <repo>/data, which git ignores, so updating the code
     never touches it (don't run `git clean -x` here). Every setting is
     made in the admin console (/admin, then ⚙️ Board) and kept in the
     database; only where the board listens and keeps its data are set
     here, in the service definition:

     /etc/systemd/system/family-chalk-planner.service.d/server.conf

     It also installs the two helpers the admin console uses to update the
     board: family-chalk-planner-update.path (Update now) and
     family-chalk-planner-nightly.timer (the nightly check). Both run
     deploy/update.sh as root; the board itself never gets root.

     For testing only (test/deploy-scripts.sh): SKIP_PACKAGES=1 (no apt or
     Node install), SKIP_SYSTEMD=1, SKIP_USER=1.

 Returns:
     0  installed (it prints the addresses and the setup code)
     1  stopped, with a message saying why
     2  an unknown option
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.1.0     2026-10-11   joshua    Standalone service, installer, updater,
                        claude    tests.

 0.3.0     2026-10-13   joshua    Run from the git checkout: install only adds
                        claude    the systemd service.

                                  Point docs and source link at joshua-d-
                                  miller/family-chalk-planner.

                                  Admin console, paired screens, sign-in with
                                  passkeys or password + authenticator.

 0.7.0     2026-10-14   joshua    No more settings file - everything in the
                        claude    admin console and the database.

 0.8.4     2026-10-14   joshua    update.sh no longer stops silently without a
                        claude    .env; always says where it stopped.

 0.13.0    2026-11-07   joshua    TypeScript groundwork: type-check, lint and
                        claude    format in CI; chores is the first TypeScript
                                  module.

                                  Updates: database backup and restore, a real
                                  health check, Update now and nightly
                                  updates.

                                  Releases carry the built screens; servers
                                  fetch them instead of building.

 1.1.0    2026-11-17   joshua    Node.js 26 on a 64-bit machine, 22 on 32-bit
                        claude    ARM (deploy/node-version.sh).

 1.2.0    2026-11-21   joshua    Node.js 26 is required on a 64-bit machine
                        claude    (installed from NodeSource if older).
===============================================================================
HEADER

# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
### ------------------------ ###
### | Settings and options | ###
### ------------------------ ###
### The folder this script lives in is the board's folder. The options      ###
### below override what's installed now, which overrides an old .env        ###
### (before 0.7), which overrides the defaults.                             ###
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env}"
DATA_DIR="" BACKUP_DIR="" PORT="" BIND="" SVC_USER=chalkplanner FACE=yes START=yes UNIT_ONLY=no
SERVICE=family-chalk-planner
# For testing only: SKIP_PACKAGES=1 (no apt/Node install), SKIP_SYSTEMD=1, SKIP_USER=1

while [ $# -gt 0 ]; do
  case "$1" in
    --no-face) FACE=no; shift ;;
    --no-start) START=no; shift ;;
    --unit-only) UNIT_ONLY=yes; shift ;;
    --data) DATA_DIR="$2"; shift 2 ;;
    --backup-dir) BACKUP_DIR="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --bind) BIND="$2"; shift 2 ;;
    --user) SVC_USER="$2"; shift 2 ;;
    -h|--help) sed -n '/^ Usage:/,/^ Returns:/p' "$0" | sed '$d'; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
### ------------ ###
### | Messages | ###
### ------------ ###
### Say prints a step in yellow; die prints an error in red and stops.      ###
say() { printf '\033[1;33m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mError:\033[0m %s\n' "$*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || die "run as root (sudo bash deploy/install.sh)"
[ -f "$APP_DIR/server/chalkboard.js" ] || die "run this from inside the family-chalk-planner folder"

# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
### --------------------------------- ###
### | Reading what is installed now | ###
### --------------------------------- ###
### Envval reads a value from an old .env file (before 0.7); confval reads  ###
### one from the service definition (server.conf) that this script writes.  ###
### Server-level settings come from: an option, then what's installed now,  ###
### then an old .env, then the default.                                     ###
envval() { [ -f "$ENV_FILE" ] || return 0; sed -n "s/^$1=//p" "$ENV_FILE" 2>/dev/null | tr -d '"' | tail -1; }   # an old .env (before 0.7)
CONF="/etc/systemd/system/$SERVICE.service.d/server.conf"
confval() { [ -f "$CONF" ] || return 0; sed -n "s/.*[\" ]$1=\([^\" ]*\).*/\1/p" "$CONF" 2>/dev/null | tail -1; }
# server-level settings: option > what's installed now > an old .env > default
DATA_DIR="${DATA_DIR:-$(confval DATA_DIR)}"; DATA_DIR="${DATA_DIR:-$(envval DATA_DIR)}"; DATA_DIR="${DATA_DIR:-$APP_DIR/data}"
BACKUP_DIR="${BACKUP_DIR:-$(confval BACKUP_DIR)}"; BACKUP_DIR="${BACKUP_DIR:-$(envval BACKUP_DIR)}"
PORT="${PORT:-$(confval PORT)}"; PORT="${PORT:-$(envval PORT)}"; PORT="${PORT:-3002}"
BIND="${BIND:-$(confval BIND)}"; BIND="${BIND:-$(envval BIND)}"; BIND="${BIND:-0.0.0.0}"
case "$PORT" in ''|*[!0-9]*) die "--port needs a number" ;; esac
for v in "$DATA_DIR" "$BACKUP_DIR" "$BIND"; do case "$v" in *[\ \"]*) die "paths and addresses can't contain spaces or quotes: $v" ;; esac; done

# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
### ------------------------ ###
### | The systemd services | ###
### ------------------------ ###
### Writes the board's service (pointing at this folder, running as the     ###
### service user), its server.conf (port, address, data folders) and the    ###
### Update now / nightly update helpers. The service is sandboxed only      ###
### where the system can do it: some LXC containers can't create the        ###
### namespaces the sandbox needs, so it runs without it there.              ###
write_unit() {
  [ "${SKIP_SYSTEMD:-}" = 1 ] && return 0
  local node unit="/etc/systemd/system/$SERVICE.service" drop="/etc/systemd/system/$SERVICE.service.d"
  node="$(command -v node)"
  sed -e "s#@APP_DIR@#$APP_DIR#g" -e "s#@ENV_FILE@#$ENV_FILE#g" -e "s#@NODE@#$node#g" -e "s#@USER@#$SVC_USER#g" \
    "$APP_DIR/deploy/$SERVICE.service" > "$unit"
  chmod 644 "$unit"
  mkdir -p "$drop"
  {
    echo "# Written by deploy/install.sh. Change with: install.sh --unit-only --port N --data DIR --backup-dir DIR"
    echo "[Service]"
    printf 'Environment="PORT=%s" "BIND=%s" "DATA_DIR=%s" "UPDATER=systemd"' "$PORT" "$BIND" "$DATA_DIR"
    [ -n "$BACKUP_DIR" ] && printf ' "BACKUP_DIR=%s"' "$BACKUP_DIR"
    echo
  } > "$CONF"
  chmod 644 "$CONF"
  # sandboxing only where it works (some LXC containers can't create the namespaces it needs)
  if systemd-run --quiet --wait --collect -p ProtectSystem=strict -p PrivateTmp=yes -p ProtectHome=read-only -p RestrictNamespaces=yes -p NoNewPrivileges=yes /bin/true 2>/dev/null; then
    {
      cat "$APP_DIR/deploy/hardening.conf"
      echo "ReadWritePaths=$DATA_DIR"
      [ -n "$BACKUP_DIR" ] && echo "ReadWritePaths=$BACKUP_DIR"
    } > "$drop/hardening.conf"
  else
    say "This system can't sandbox services (common in LXC without nesting) - running without it"
    rm -f "$drop/hardening.conf"
  fi
  # "Update now" in the admin console, and the nightly update check (both run deploy/update.sh as root)
  local u
  for u in "$SERVICE-update.service" "$SERVICE-update.path" "$SERVICE-nightly.service" "$SERVICE-nightly.timer"; do
    sed -e "s#@APP_DIR@#$APP_DIR#g" -e "s#@DATA_DIR@#$DATA_DIR#g" "$APP_DIR/deploy/$u" > "/etc/systemd/system/$u"
    chmod 644 "/etc/systemd/system/$u"
  done
  systemctl daemon-reload
  systemctl enable --quiet --now "$SERVICE-update.path" "$SERVICE-nightly.timer" || say "Couldn't turn on Update now / the nightly check - updates still work with deploy/update.sh"
}

# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
### --------------- ###
### | --unit-only | ###
### --------------- ###
### Just rewrite the services (e.g. after moving the folder) and stop.      ###
if [ "$UNIT_ONLY" = yes ]; then write_unit; say "Service updated to run from $APP_DIR"; exit 0; fi

# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
### ------------------------ ###
### | Packages and Node.js | ###
### ------------------------ ###
### The board needs Node.js 26 on a 64-bit machine (22.18 on 32-bit ARM):  ###
### it runs TypeScript directly. Installed from NodeSource if it's missing  ###
### or too old (SKIP_PACKAGES: checked, not installed). Then the board's    ###
### packages (npm ci, without the developer tools) and its screens (from    ###
### the release, or built here when following a branch). The service user   ###
### can read the code but never change it.                                  ###
node_ok() { command -v node >/dev/null && node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=18)?0:1)'; }
if [ "${SKIP_PACKAGES:-}" != 1 ]; then
  export DEBIAN_FRONTEND=noninteractive
  say "Installing packages (curl, git, ca-certificates)"
  apt-get update -qq
  apt-get install -y -qq curl git ca-certificates >/dev/null
  # Node.js 26 on a 64-bit machine; 22 on 32-bit ARM, the newest built for it (deploy/node-version.sh)
  # shellcheck source=deploy/node-version.sh
  . "$APP_DIR/deploy/node-version.sh"
  # (from 1.2 a 64-bit machine needs Node.js 26: an older one is moved up to it)
  if ! node_ok || ! node_new_enough; then
    say "Installing Node.js $(node_target) (NodeSource)"
    node_install "$(node_target)" || die "Couldn't install Node.js $(node_target) from NodeSource"
  fi
  if node_is_32bit; then
    say "A 32-bit system: the board runs on Node.js $NODE_32BIT, supported until $NODE_32BIT_UNTIL. For updates after that, use a 64-bit system (docs/install.md → Node.js)."
  fi
fi
node_ok || die "Node.js 22.18 or newer is required (found: $(node -v 2>/dev/null || echo none))"
if [ -f "$APP_DIR/deploy/node-version.sh" ]; then
  # shellcheck source=deploy/node-version.sh
  . "$APP_DIR/deploy/node-version.sh"
  node_new_enough || die "Node.js $(node_needed | cut -d. -f1) is required on a 64-bit machine (found: $(node -v)). Install it (https://nodejs.org or NodeSource), then run this again."
fi

say "Installing dependencies"
OWNER="$(stat -c %U "$APP_DIR")"
as_owner() { if [ "$OWNER" = root ]; then "$@"; else runuser -u "$OWNER" -- "$@"; fi; }   # keep the checkout owned by whoever cloned it
( cd "$APP_DIR" && as_owner npm ci --omit=dev --no-audit --no-fund --loglevel=error )
as_owner bash "$APP_DIR/deploy/screens.sh"   # the screens, built (releases carry them)
chmod -R o-w "$APP_DIR"   # the service user can read the code but never change it

# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
### -------------------- ###
### | The service user | ###
### -------------------- ###
### A system user with no home and no shell: the board runs as it.          ###
if [ "${SKIP_USER:-}" != 1 ] && ! id "$SVC_USER" >/dev/null 2>&1; then
  say "Creating system user $SVC_USER"
  useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin "$SVC_USER"
fi

# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
### ------------------- ###
### | The data folder | ###
### ------------------- ###
### The only place the service can write: the database, uploads, backups.   ###
mkdir -p "$DATA_DIR"
[ "${SKIP_USER:-}" = 1 ] || chown -R "$SVC_USER:$SVC_USER" "$DATA_DIR"
chmod 750 "$DATA_DIR"

# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
### ------------------------------ ###
### | The face finder (optional) | ###
### ------------------------------ ###
### Frames photos on the people in them. If it can't be installed, photos   ###
### use a centered crop instead; the board works either way.                ###
if [ "$FACE" = yes ]; then
  say "Installing the face finder (photo framing; a minute or two)"
  bash "$APP_DIR/deploy/setup-face.sh" "$APP_DIR" || say "Face finder skipped (photos will use a centered crop)"
fi

# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
### ------------------------------ ###
### | Start, and say where it is | ###
### ------------------------------ ###
### Starts the service, waits up to 30 seconds for it to answer, then       ###
### prints the addresses (and the one-time setup code on a new install).    ###
if [ "${SKIP_SYSTEMD:-}" != 1 ]; then
  say "Installing the $SERVICE service (runs from $APP_DIR)"
  write_unit
  systemctl enable --quiet "$SERVICE"
  if [ "$START" = yes ]; then
    systemctl restart "$SERVICE"
    port="$PORT"
    for _ in $(seq 1 30); do curl -fsS "http://127.0.0.1:$port/api/today" >/dev/null 2>&1 && break; sleep 1; done
    curl -fsS "http://127.0.0.1:$port/api/today" >/dev/null 2>&1 || die "the service didn't come up - see: journalctl -u $SERVICE -n 50"
  fi
fi

ip="$(hostname -I 2>/dev/null | awk '{print $1}')"; port="$PORT"
echo
say "Family Chalk Planner is installed (running from $APP_DIR)."
echo "    Wall display:  http://${ip:-<this-machine>}:${port:-3002}/"
echo "    Tablet editor: http://${ip:-<this-machine>}:${port:-3002}/edit"
if [ -f "$DATA_DIR/setup-code.txt" ]; then
  echo "    Setup code:    $(cat "$DATA_DIR/setup-code.txt")   (open http://${ip:-<this-machine>}:${port:-3002}/admin and create the admin account)"
fi
echo "    Admin console: http://${ip:-<this-machine>}:${port:-3002}/admin  (⚙️ Board: calendar, weather, photos; pair screens, invite people)"
echo "    Updates:       $APP_DIR/deploy/update.sh"

# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
