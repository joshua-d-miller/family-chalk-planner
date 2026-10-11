#!/usr/bin/env bash
# Update Family Chalk Planner to the latest version on its branch, with automatic rollback
# if the new version doesn't start. Run as root:  /opt/family-chalk-planner/deploy/update.sh
#   --check   only show what would change
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/family-chalk-planner}"
SERVICE=family-chalk-planner
ENV_FILE="${ENV_FILE:-/etc/family-chalk-planner/planner.env}"
CHECK=no; [ "${1:-}" = "--check" ] && CHECK=yes

say() { printf '\033[1;33m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mError:\033[0m %s\n' "$*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || die "run as root"
cd "$APP_DIR"
[ -d .git ] || die "$APP_DIR isn't a git install (installed from a folder?). Re-run install.sh --source NEWDIR --force instead."

branch="$(git rev-parse --abbrev-ref HEAD)"
old="$(git rev-parse HEAD)"
git fetch --quiet origin
new="$(git rev-parse "origin/$branch")"
if [ "$old" = "$new" ]; then say "Already up to date ($(git log -1 --format='%h %s'))"; exit 0; fi
say "Changes:"; git log --oneline "$old..$new" | sed 's/^/    /'
[ "$CHECK" = yes ] && exit 0

changed="$(git diff --name-only "$old" "$new")"
git merge --quiet --ff-only "origin/$branch"
if grep -qx 'package-lock.json' <<<"$changed"; then say "Updating dependencies"; npm ci --omit=dev --no-audit --no-fund --loglevel=error; fi
if grep -qx 'face/requirements.txt' <<<"$changed" && [ -x face/venv/bin/python ]; then bash deploy/setup-face.sh "$APP_DIR"; fi
if grep -qx "deploy/$SERVICE.service" <<<"$changed"; then install -m 644 "deploy/$SERVICE.service" "/etc/systemd/system/$SERVICE.service"; systemctl daemon-reload; fi
chown -R root:root "$APP_DIR"; chmod -R go-w "$APP_DIR"

port="$(sed -n 's/^PORT=//p' "$ENV_FILE" 2>/dev/null | tail -1)"; port="${port:-3002}"
healthy() { for _ in $(seq 1 30); do curl -fsS "http://127.0.0.1:$port/api/today" >/dev/null 2>&1 && return 0; sleep 1; done; return 1; }
systemctl restart "$SERVICE"
if healthy; then
  say "Updated to $(git log -1 --format='%h %s'). The wall reloads itself in a few seconds."
else
  say "New version didn't start - rolling back to ${old:0:7}"
  journalctl -u "$SERVICE" -n 20 --no-pager || true
  git reset --quiet --hard "$old"
  grep -qx 'package-lock.json' <<<"$changed" && npm ci --omit=dev --no-audit --no-fund --loglevel=error
  systemctl restart "$SERVICE"
  healthy && die "rolled back; the board is running the previous version" || die "rollback didn't come up either - see journalctl -u $SERVICE"
fi
