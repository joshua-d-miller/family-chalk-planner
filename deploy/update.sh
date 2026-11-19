#!/usr/bin/env bash
: <<'HEADER'
===============================================================================
 Family Chalk Planner | Deploy | update.sh
===============================================================================
 Version:   1.1.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-10-11
 Updated:   2026-11-17

 Purpose:
     Updates the board to the newest release, then restarts it. The
     database is backed up first, and if the new version doesn't come up
     healthy, the old code AND that copy of the database are put back: a
     newer version may have changed the database in a way the old one
     can't read.

 Usage:
     sudo bash <repo>/deploy/update.sh [--check | --from-board | --nightly]

 Options:
     (none)        update now, from a terminal
     --check       only show what would change
     --from-board  the admin console's "Update now" (started by the
                   family-chalk-planner-update service)
     --nightly     the nightly check (family-chalk-planner-nightly.timer):
                   notes what's available, and installs it if automatic
                   updates are on and it's a minor or patch release

 How it fits:
     What it installs is set in the admin console, ⚙️ Board, Updates:
     "Releases only" (the default) is the newest tagged release (vX.Y.Z);
     "Every change on main" follows the branch the folder is on, for
     people working on the board.

     The last 3 database copies are kept in <backup>/pre-update/. How it
     went is written to <data>/update-status.json for the admin console.
     Only one update runs at a time (a lock file).

 Returns:
     0  updated, already up to date, or (nightly) nothing to do
     1  stopped before changing anything, or rolled back: the message
        says which and why
     2  an unknown option
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.1.0     2026-10-11   joshua    Standalone service, installer, updater,
                        claude    tests.

 0.3.0     2026-10-11   joshua    Run from the git checkout: install only adds
                        claude    the systemd service.

 0.4.4     2026-10-14   joshua    Bundled fonts, stricter page protections,
                        claude    HTTPS/proxy warnings, media tidy-up,
                                  releases.

 0.7.0     2026-10-14   joshua    No more settings file - everything in the
                        claude    admin console and the database.

 0.8.1     2026-10-14   joshua    update.sh installs any missing packages
                        claude    (fonts) and undoes a half-finished update.

 0.8.4     2026-10-14   joshua    update.sh no longer stops silently without a
                        claude    .env; always says where it stopped.

 0.8.5     2026-10-14   joshua    Test the real install/update scripts in CI;
                        claude    fix fresh installs and the failed-update
                                  undo.

 0.13.0    2026-11-07   joshua    TypeScript groundwork: type-check, lint and
                        claude    format in CI; chores is the first TypeScript
                                  module.

                                  Updates: database backup and restore, a real
                                  health check, Update now and nightly
                                  updates.

                                  Releases carry the built screens; servers
                                  fetch them instead of building.

                                  Daylight saving and time zone tests; the
                                  newest libraries and CI actions.

 0.13.1    2026-11-07   joshua    A second run finishes an upgrade from 0.12:
                        claude    the screens, Update now and the nightly
                                  check.

 1.1.0    2026-11-17   joshua    Moves a NodeSource install to the
                        claude    recommended Node.js (26, or 22 on 32-bit
                                  ARM) on Update now; says when 32-bit support
                                  ends.
===============================================================================
HEADER

# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
### -------------------------------- ###
### | Options and where things are | ###
### -------------------------------- ###
### -E makes the error trap below cover failures inside functions too.      ###
set -Eeuo pipefail   # -E: the error trap below also covers failures inside functions
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env}"
SERVICE=family-chalk-planner
MODE=manual
case "${1:-}" in
  --check) MODE=check ;;
  --from-board) MODE=board ;;
  --nightly) MODE=nightly ;;
  '') ;;
  *) echo "Unknown option: $1 (use --check, --from-board or --nightly)" >&2; exit 2 ;;
esac

# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
### -------------------------------------------------- ###
### | Messages, and the status for the admin console | ###
### -------------------------------------------------- ###
### Status writes update-status.json (state, message, versions) so the      ###
### admin console can show how the update went. stop prints an error and    ###
### exits (the status is already written); die does both.                   ###
say() { printf '\033[1;33m==>\033[0m %s\n' "$*"; }
STATUS_FILE=""
status() {   # state, message: for the admin console (written once the data folder is known)
  [ -n "$STATUS_FILE" ] || return 0
  node -e 'const [f, state, message, from, to, avail] = process.argv.slice(1);
    let prev = {}; try { prev = JSON.parse(require("fs").readFileSync(f, "utf8")); } catch {}
    const o = { ...prev, state, message, at: new Date().toISOString() };
    if (from) o.from = from; if (to) o.to = to; if (avail !== undefined && avail !== "-") o.available = avail || null;
    require("fs").writeFileSync(f + ".tmp", JSON.stringify(o, null, 2)); require("fs").renameSync(f + ".tmp", f);' \
    "$STATUS_FILE" "$1" "$2" "${3:-}" "${4:-}" "${5:--}" 2>/dev/null || true
  [ -n "${SVC_OWNER:-}" ] && chown "$SVC_OWNER" "$STATUS_FILE" 2>/dev/null || true
}
stop() { printf '\033[1;31mError:\033[0m %s\n' "$*" >&2; exit 1; }   # (the status is already written)
die() { status failed "$*"; stop "$*"; }
trap 'printf "\033[1;31mError:\033[0m the update stopped unexpectedly (deploy/update.sh line %s) - nothing was changed\n" "$LINENO" >&2; status failed "The update stopped unexpectedly - nothing was changed"' ERR
[ "$(id -u)" = 0 ] || die "run as root"
cd "$APP_DIR"
[ -d .git ] || die "$APP_DIR isn't a git checkout"
OWNER="$(stat -c %U "$APP_DIR")"
as_owner() { if [ "$OWNER" = root ]; then "$@"; else runuser -u "$OWNER" -- "$@"; fi; }

# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
### --------------------- ###
### | Where the data is | ###
### --------------------- ###
### From the service definition (server.conf), an old .env, or the default. ###
### The database is copied from here before the update.                     ###
CONF="/etc/systemd/system/$SERVICE.service.d/server.conf"
confval() { [ -f "$CONF" ] || return 0; sed -n "s/.*[\" ]$1=\([^\" ]*\).*/\1/p" "$CONF" 2>/dev/null | tail -1; }
envval() { [ -f "$ENV_FILE" ] || return 0; sed -n "s/^$1=//p" "$ENV_FILE" 2>/dev/null | tr -d '"'"'"' ' | tail -1; }   # an old .env (before 0.7)
data_dir="$(confval DATA_DIR)"; data_dir="${data_dir:-$(envval DATA_DIR)}"; data_dir="${data_dir:-$APP_DIR/data}"
backup_dir="$(confval BACKUP_DIR)"; backup_dir="${backup_dir:-$(envval BACKUP_DIR)}"; backup_dir="${backup_dir:-$data_dir/backup}"
DB="$data_dir/chalkboard.db"
SVC_OWNER="$(stat -c %U:%G "$data_dir" 2>/dev/null || true)"
[ -d "$data_dir" ] && STATUS_FILE="$data_dir/update-status.json"
[ "$MODE" = board ] && rm -f "$data_dir/update-request"   # (the request that started this run)

# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
### ------------------------ ###
### | One update at a time | ###
### ------------------------ ###
### A second run (say, Update now while the nightly check runs) just says   ###
### so and leaves.                                                          ###
lockdir=/run/lock; [ -d "$lockdir" ] && [ -w "$lockdir" ] || lockdir=/tmp
exec 9>"$lockdir/family-chalk-planner-update.lock"
flock -n 9 || { say "Another update is already running"; exit 0; }

# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
### --------------------- ###
### | Reading the board | ###
### --------------------- ###
### Setting reads one plain setting straight from the database, read-only   ###
### (it never runs the board's code). deps_ok checks every package the      ###
### board needs (its fonts, sign-in, clipart) is there at the version       ###
### package-lock.json asks for. version_of reads a commit's version.        ###
setting() {   # read one plain board setting straight from the database (read-only; never runs the board's code)
  node -e 'const { DatabaseSync } = require("node:sqlite"); const d = new DatabaseSync(process.argv[1], { readOnly: true });
    const r = d.prepare("SELECT data FROM kv WHERE key = ?").get("settings"); const v = r ? JSON.parse(r.data)[process.argv[2]] : "";
    process.stdout.write(typeof v === "string" && !v.startsWith("k1:") ? v : "")' "$DB" "$1" 2>/dev/null
}
# every package the board needs (its fonts, sign-in, clipart…) present at the version package-lock.json asks for?
deps_ok() {
  as_owner node -e 'const lock = (require("./package-lock.json").packages) || {};
    for (const d of Object.keys(require("./package.json").dependencies || {})) {
      const want = (lock["node_modules/" + d] || {}).version; let have;
      try { have = require("./node_modules/" + d + "/package.json").version; } catch { process.exit(1); }
      if (want && have !== want) process.exit(1);
    }' 2>/dev/null
}
install_deps() { as_owner npm ci --omit=dev --no-audit --no-fund --loglevel=error; }
version_of() { as_owner git show "$1:package.json" 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).version||"")}catch{console.log("")}})'; }
major() { printf '%s' "${1%%.*}"; }

# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
### --------------------------- ###
### | What would be installed | ###
### --------------------------- ###
### A release (the newest vX.Y.Z tag), or the newest change on the folder's ###
### branch. Already there? Make sure the packages are complete, and stop.   ###
status checking "Looking for a newer version"
branch="$(as_owner git rev-parse --abbrev-ref HEAD)"
old="$(as_owner git rev-parse HEAD)"
as_owner git fetch --quiet --tags origin
channel="$(setting UPDATE_CHANNEL || true)"; channel="${channel:-$(envval UPDATE_CHANNEL)}"; channel="${channel:-release}"
target="origin/$branch"; tag=""
if [ "$channel" = release ]; then
  tag="$(as_owner git tag -l 'v[0-9]*.[0-9]*.[0-9]*' --sort=-v:refname | head -1)"
  if [ -n "$tag" ]; then target="$tag"; else say "No releases tagged yet - following $branch"; fi
fi
new="$(as_owner git rev-parse "$target^{commit}")"
old_v="$(version_of "$old")"; new_v="$(version_of "$new")"
if [ "$old" = "$new" ] || as_owner git merge-base --is-ancestor "$new" "$old"; then
  say "Already up to date ($(as_owner git log -1 --format='%h %s'))"
  if ! deps_ok; then   # e.g. an earlier update stopped before installing them: the board would fall back to plain fonts
    [ "$MODE" = check ] && { say "Some of the board's packages (fonts and others) are missing - run without --check to install them"; exit 0; }
    say "Some of the board's packages (fonts and others) are missing - installing them"
    install_deps; deps_ok || die "packages still incomplete after npm ci - see the messages above"
    systemctl restart "$SERVICE"; say "Installed and restarted."
  fi
  # finishing an upgrade from 0.12, whose update.sh brought the new code but not the screens or the
  # Update now / nightly services (the board shows the old screens until then)
  if [ "$MODE" != check ] && [ ! -f web/dist/index.html ]; then
    say "Fetching the board's screens"
    as_owner bash deploy/screens.sh || die "couldn't get the screens - see the messages above (the board keeps showing the old ones)"
  fi
  if [ "$MODE" != check ] && [ -f "/etc/systemd/system/$SERVICE.service" ] && [ ! -f "/etc/systemd/system/$SERVICE-update.path" ]; then
    say "Turning on Update now and the nightly update check"
    bash deploy/install.sh --unit-only
  fi
  status current "Up to date (v$old_v)" "" "" ""
  exit 0
fi

# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
### --------------------------------------------- ###
### | Nightly: only small updates by themselves | ###
### --------------------------------------------- ###
### With automatic updates on, the nightly check installs minor and patch   ###
### releases only; a new major version waits for Update now.                ###
say "Changes:"; as_owner git log --oneline "$old..$new" | sed 's/^/    /'
if [ "$MODE" = check ]; then status available "v$new_v is available" "" "" "v$new_v"; fi
if [ "$MODE" = nightly ]; then
  auto="$(setting AUTO_UPDATE || true)"
  if [ "$auto" != on ]; then status available "v$new_v is available" "" "" "v$new_v"; say "Automatic updates are off"; exit 0; fi
  if [ "$channel" != release ] || [ "$(major "$new_v")" != "$(major "$old_v")" ]; then
    status available "v$new_v is available: a bigger change, so it waits for Update now" "" "" "v$new_v"
    say "v$new_v is a new major version (or not a release): not installing it by itself"; exit 0
  fi
fi

# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
### ------------------------------------------------ ###
### | A newer Node.js, if the new version needs it | ###
### ------------------------------------------------ ###
### Read from the new version's package.json (engines). Updated from        ###
### NodeSource if that's where it came from; otherwise stop before changing ###
### anything, and say why.                                                  ###
need_node="$(as_owner git show "$new:package.json" 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const m=/(\d+)\.(\d+)/.exec((JSON.parse(s).engines||{}).node||"");console.log(m?m[1]+"."+m[2]:"")}catch{console.log("")}})' || true)"
node_at_least() { node -e 'const [a,b]=process.versions.node.split(".").map(Number),[x,y]=process.argv[1].split(".").map(Number);process.exit(a>x||(a===x&&b>=y)?0:1)' "$1"; }
from_nodesource() { ls /etc/apt/sources.list.d/nodesource* >/dev/null 2>&1; }
if [ -n "$need_node" ] && ! node_at_least "$need_node"; then
  if from_nodesource; then say "This version needs Node.js $need_node or newer (you have $(node -v)): it will be updated first"
  else say "This version needs Node.js $need_node or newer (you have $(node -v))"; fi
fi
[ "$MODE" = check ] && exit 0
status running "Updating to v$new_v" "v$old_v" "v$new_v"
if [ -n "$need_node" ] && ! node_at_least "$need_node"; then
  if from_nodesource; then
    say "Updating Node.js"
    apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs >/dev/null || true
  fi
  node_at_least "$need_node" || die "This version needs Node.js $need_node or newer (found $(node -v)). Update Node.js, then run this again. Nothing was changed."
fi

# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
### --------------------------- ###
### | The recommended Node.js | ###
### --------------------------- ###
### Node.js 26 on a 64-bit machine (22 on 32-bit ARM, the newest built for ###
### it): a NodeSource install that's older moves to it, on Update now (not ###
### overnight: a new Node.js is a bigger change). If that doesn't work,    ###
### the board carries on with the Node.js it has (still new enough).       ###
if [ "${SKIP_PACKAGES:-}" != 1 ] && [ -f "$APP_DIR/deploy/node-version.sh" ]; then
  # shellcheck source=deploy/node-version.sh
  . "$APP_DIR/deploy/node-version.sh"
  want="$(node_target)"
  if from_nodesource && [ "$(node_major)" -lt "$want" ]; then
    if [ "$MODE" = nightly ]; then
      say "Node.js $want is recommended (you have $(node -v)): it comes with the next Update now"
    else
      say "Moving to Node.js $want (you have $(node -v))"
      node_install "$want" || say "Couldn't move to Node.js $want: carrying on with $(node -v)"
    fi
  fi
  if node_is_32bit; then
    say "A 32-bit system: the board runs on Node.js $NODE_32BIT, supported until $NODE_32BIT_UNTIL. For updates after that, use a 64-bit system (docs/install.md → Node.js)."
  fi
fi

# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
### ------------------------------------------ ###
### | The new code, its packages and screens | ###
### ------------------------------------------ ###
### If anything here fails before the restart, the old code (and its        ###
### packages and screens) go back rather than leaving new files next to an  ###
### old running board.                                                      ###
changed="$(as_owner git diff --name-only "$old" "$new")"
as_owner git merge --quiet --ff-only "$new"
# if anything below fails before the restart, put the old code (and its packages) back rather than
# leaving new files next to an old running board
undo() {
  printf '\033[1;31mError:\033[0m the update stopped at deploy/update.sh line %s\n' "${1:-?}" >&2
  say "Going back to ${old:0:7}"
  as_owner git reset --quiet --hard "$old"
  if grep -qx 'package-lock.json' <<<"$changed"; then as_owner npm ci --omit=dev --no-audit --no-fund --loglevel=error || true; fi
  as_owner bash deploy/screens.sh || true
  status failed "The update stopped before the new version started; still on v$old_v" "v$old_v" "v$new_v"
}
trap 'undo $LINENO' ERR
if grep -qx 'package-lock.json' <<<"$changed" || ! deps_ok; then say "Installing packages (fonts and others)"; install_deps; fi
deps_ok || { say "Packages still incomplete after npm ci"; false; }   # (goes back to the previous version)
as_owner bash deploy/screens.sh   # the new screens, built (releases carry them)
if grep -qx 'face/requirements.txt' <<<"$changed" && [ -x face/venv/bin/python ]; then bash deploy/setup-face.sh "$APP_DIR"; fi
if grep -qE '^deploy/(family-chalk-planner[a-z-]*\.(service|path|timer)|hardening\.conf)$' <<<"$changed"; then bash deploy/install.sh --unit-only; fi
chmod -R o-w "$APP_DIR"

# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
### --------------------------------------------------- ###
### | The database, copied while the board is stopped | ###
### --------------------------------------------------- ###
### So the copy is complete. Kept as <backup>/pre-update/chalkboard-v<old   ###
### version>-<date>.db.                                                     ###
snapshot=""
systemctl stop "$SERVICE"
if [ -f "$DB" ]; then
  mkdir -p "$backup_dir/pre-update"
  snapshot="$backup_dir/pre-update/chalkboard-v$old_v-$(date +%Y%m%d-%H%M%S).db"
  node -e 'const { DatabaseSync } = require("node:sqlite"); const d = new DatabaseSync(process.argv[1]);
    d.prepare("VACUUM INTO ?").run(process.argv[2]); d.close()' "$DB" "$snapshot"
  chmod 600 "$snapshot"; [ -n "$SVC_OWNER" ] && chown "$SVC_OWNER" "$backup_dir/pre-update" "$snapshot" 2>/dev/null || true
  # shellcheck disable=SC2012  # (names are ours: chalkboard-v<version>-<date>.db)
  ls -1t "$backup_dir"/pre-update/chalkboard-*.db 2>/dev/null | tail -n +4 | xargs -r rm -f
  say "Database backed up to $snapshot"
fi
restore_db() {
  [ -n "$snapshot" ] && [ -f "$snapshot" ] || return 0
  say "Putting back the database from before the update"
  cp "$snapshot" "$DB.restore" && mv "$DB.restore" "$DB" && rm -f "$DB-wal" "$DB-shm"
  [ -n "$SVC_OWNER" ] && chown "$SVC_OWNER" "$DB" 2>/dev/null || true
  chmod 600 "$DB"
}

# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
### ----------------------------------- ###
### | Healthy, or put everything back | ###
### ----------------------------------- ###
### Healthy means the board answers, its database is up to date, and it's   ###
### the version just installed. Versions before 0.13 have no /api/health,   ###
### so going back to one of those only needs the board to answer. Not       ###
### healthy: stop it, put back the database from before, then the old code, ###
### its packages and screens, and start it again.                           ###
port="$(confval PORT)"; port="${port:-$(envval PORT)}"; port="${port:-3002}"
healthy() {   # $1: the version that should be running
  local out
  for _ in $(seq 1 45); do
    out="$(curl -fsS "http://127.0.0.1:$port/api/health" 2>/dev/null || true)"
    # (versions before 0.13 have no /api/health: going back to one, the board answering is enough)
    [ -z "$out" ] && curl -fsS "http://127.0.0.1:$port/api/today" >/dev/null 2>&1 \
      && [ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/api/health")" = 404 ] && out='{"ok":true}'
    if [ -n "$out" ] && node -e 'const h = JSON.parse(process.argv[1]); process.exit(h.ok && (!h.version || h.version === "v" + process.argv[2]) ? 0 : 1)' "$out" "$1" 2>/dev/null \
      && curl -fsS "http://127.0.0.1:$port/" 2>/dev/null | grep -q 'board-version'; then return 0; fi
    sleep 1
  done
  return 1
}
trap - ERR
systemctl start "$SERVICE"
if healthy "$new_v"; then
  say "Updated to ${tag:-$(as_owner git log -1 --format='%h %s')}. The wall reloads itself in a few seconds."
  status updated "Updated to v$new_v" "v$old_v" "v$new_v" ""
  # 0.7+: the old settings file was read once and moved into the database - put it aside
  if [ -f "$ENV_FILE" ] && [ -f "$CONF" ]; then
    mv "$ENV_FILE" "$ENV_FILE.moved-to-admin-console"; chmod 600 "$ENV_FILE.moved-to-admin-console"
    say "Your settings now live in the admin console (⚙️ Board). The old .env was renamed to $(basename "$ENV_FILE").moved-to-admin-console - delete it once you've checked ⚙️ Board."
  fi
else
  say "New version didn't start properly - going back to ${old:0:7}"
  journalctl -u "$SERVICE" -n 20 --no-pager || true
  systemctl stop "$SERVICE" || true
  restore_db
  as_owner git reset --quiet --hard "$old"
  if grep -qx 'package-lock.json' <<<"$changed"; then
    as_owner npm ci --omit=dev --no-audit --no-fund --loglevel=error || say "Couldn't reinstall the previous version's packages"
  fi
  as_owner bash deploy/screens.sh || true
  systemctl start "$SERVICE" || true
  if healthy "$old_v"; then
    status rolledback "v$new_v didn't start properly, so the board went back to v$old_v (with its database from before)" "v$old_v" "v$new_v"
    stop "rolled back; the board is running the previous version"
  else
    status failed "v$new_v didn't start, and going back didn't come up either - see journalctl -u $SERVICE" "v$old_v" "v$new_v"
    stop "rollback didn't come up either - see journalctl -u $SERVICE"
  fi
fi

# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
