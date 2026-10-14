#!/usr/bin/env bash
# Update Family Chalk Planner to the newest release, then restart, with automatic rollback
# if the new version doesn't start. Run as root:  sudo bash <repo>/deploy/update.sh
#   --check   only show what would change
# Admin console → ⚙️ Board → Updates: "Releases only" (default) = the newest tagged release (vX.Y.Z);
# "Every change on main" = for people working on the board.
set -euo pipefail
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env}"
SERVICE=family-chalk-planner
CHECK=no; [ "${1:-}" = "--check" ] && CHECK=yes

say() { printf '\033[1;33m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mError:\033[0m %s\n' "$*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || die "run as root"
cd "$APP_DIR"
[ -d .git ] || die "$APP_DIR isn't a git checkout"
OWNER="$(stat -c %U "$APP_DIR")"
as_owner() { if [ "$OWNER" = root ]; then "$@"; else runuser -u "$OWNER" -- "$@"; fi; }

branch="$(as_owner git rev-parse --abbrev-ref HEAD)"
old="$(as_owner git rev-parse HEAD)"
as_owner git fetch --quiet --tags origin
CONF="/etc/systemd/system/$SERVICE.service.d/server.conf"
confval() { sed -n "s/.*[\" ]$1=\([^\" ]*\).*/\1/p" "$CONF" 2>/dev/null | tail -1; }
envval() { sed -n "s/^$1=//p" "$ENV_FILE" 2>/dev/null | tr -d '"'"'"' ' | tail -1; }   # an old .env (before 0.7)
data_dir="$(confval DATA_DIR)"; data_dir="${data_dir:-$(envval DATA_DIR)}"; data_dir="${data_dir:-$APP_DIR/data}"
setting() {   # read one plain board setting straight from the database (read-only; never runs the board's code)
  node -e 'const { DatabaseSync } = require("node:sqlite"); const d = new DatabaseSync(process.argv[1] + "/chalkboard.db", { readOnly: true });
    const r = d.prepare("SELECT data FROM kv WHERE key = ?").get("settings"); const v = r ? JSON.parse(r.data)[process.argv[2]] : "";
    process.stdout.write(typeof v === "string" && !v.startsWith("k1:") ? v : "")' "$data_dir" "$1" 2>/dev/null
}
channel="$(setting UPDATE_CHANNEL || true)"; channel="${channel:-$(envval UPDATE_CHANNEL)}"; channel="${channel:-release}"
target="origin/$branch"
if [ "$channel" = release ]; then
  tag="$(as_owner git tag -l 'v[0-9]*.[0-9]*.[0-9]*' --sort=-v:refname | head -1)"
  if [ -n "$tag" ]; then target="$tag"; else say "No releases tagged yet - following $branch"; fi
fi
new="$(as_owner git rev-parse "$target^{commit}")"
if [ "$old" = "$new" ] || as_owner git merge-base --is-ancestor "$new" "$old"; then say "Already up to date ($(as_owner git log -1 --format='%h %s'))"; exit 0; fi
say "Changes:"; as_owner git log --oneline "$old..$new" | sed 's/^/    /'
[ "$CHECK" = yes ] && exit 0

changed="$(as_owner git diff --name-only "$old" "$new")"
as_owner git merge --quiet --ff-only "$new"
if grep -qx 'package-lock.json' <<<"$changed"; then say "Updating dependencies"; as_owner npm ci --omit=dev --no-audit --no-fund --loglevel=error; fi
if grep -qx 'face/requirements.txt' <<<"$changed" && [ -x face/venv/bin/python ]; then bash deploy/setup-face.sh "$APP_DIR"; fi
if grep -qE '^deploy/(family-chalk-planner\.service|hardening\.conf)$' <<<"$changed"; then bash deploy/install.sh --unit-only; fi
chmod -R o-w "$APP_DIR"

port="$(confval PORT)"; port="${port:-$(envval PORT)}"; port="${port:-3002}"
healthy() { for _ in $(seq 1 30); do curl -fsS "http://127.0.0.1:$port/api/today" >/dev/null 2>&1 && return 0; sleep 1; done; return 1; }
systemctl restart "$SERVICE"
if healthy; then
  say "Updated to ${tag:-$(as_owner git log -1 --format='%h %s')}. The wall reloads itself in a few seconds."
  # 0.7+: the old settings file was read once and moved into the database - put it aside
  if [ -f "$ENV_FILE" ] && [ -f "$CONF" ]; then
    mv "$ENV_FILE" "$ENV_FILE.moved-to-admin-console"; chmod 600 "$ENV_FILE.moved-to-admin-console"
    say "Your settings now live in the admin console (⚙️ Board). The old .env was renamed to $(basename "$ENV_FILE").moved-to-admin-console - delete it once you've checked ⚙️ Board."
  fi
else
  say "New version didn't start - rolling back to ${old:0:7}"
  journalctl -u "$SERVICE" -n 20 --no-pager || true
  as_owner git reset --quiet --hard "$old"
  if grep -qx 'package-lock.json' <<<"$changed"; then as_owner npm ci --omit=dev --no-audit --no-fund --loglevel=error; fi
  systemctl restart "$SERVICE"
  if healthy; then die "rolled back; the board is running the previous version"; else die "rollback didn't come up either - see journalctl -u $SERVICE"; fi
fi
