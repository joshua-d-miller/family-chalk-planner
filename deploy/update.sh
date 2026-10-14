#!/usr/bin/env bash
# Update Family Chalk Planner to the newest release, then restart, with automatic rollback
# if the new version doesn't start. Run as root:  sudo bash <repo>/deploy/update.sh
#   --check   only show what would change
# UPDATE_CHANNEL in .env: "release" (default) = the newest tagged release (vX.Y.Z);
#                         "main" = every change as soon as it's on the main branch (for developers).
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
channel="$(sed -n 's/^UPDATE_CHANNEL=//p' "$ENV_FILE" 2>/dev/null | tail -1 | tr -d '"'"'"' ')" || true; channel="${channel:-release}"
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

port="$(sed -n 's/^PORT=//p' "$ENV_FILE" 2>/dev/null | tail -1)" || true; port="${port:-3002}"
healthy() { for _ in $(seq 1 30); do curl -fsS "http://127.0.0.1:$port/api/today" >/dev/null 2>&1 && return 0; sleep 1; done; return 1; }
systemctl restart "$SERVICE"
if healthy; then
  say "Updated to ${tag:-$(as_owner git log -1 --format='%h %s')}. The wall reloads itself in a few seconds."
else
  say "New version didn't start - rolling back to ${old:0:7}"
  journalctl -u "$SERVICE" -n 20 --no-pager || true
  as_owner git reset --quiet --hard "$old"
  if grep -qx 'package-lock.json' <<<"$changed"; then as_owner npm ci --omit=dev --no-audit --no-fund --loglevel=error; fi
  systemctl restart "$SERVICE"
  if healthy; then die "rolled back; the board is running the previous version"; else die "rollback didn't come up either - see journalctl -u $SERVICE"; fi
fi
