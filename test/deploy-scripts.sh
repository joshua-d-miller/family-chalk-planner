#!/usr/bin/env bash
: <<'HEADER'
===============================================================================
 Family Chalk Planner | Tests | deploy-scripts.sh
===============================================================================
 Version:   0.13.0
 Author:    Joshua D. Miller, Claude
 Updated:   2026-11-07

 Purpose:
     Runs deploy/install.sh and deploy/update.sh the way a real server
     does (as root), with systemd and the health check stubbed out: a
     fresh install, then updates with and without an old .env and
     server.conf, an "already up to date" run, and an update that fails
     and must be undone.

     Needs root. In CI:
          sudo env "PATH=$PATH" bash test/deploy-scripts.sh
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.8.5     2026-10-14   joshua    Test the real install/update scripts in CI;
                        claude    fix fresh installs and the failed-update
                                  undo.

                                  CI: fix ShellCheck 0.9 warning (SC2120) in
                                  test/deploy-scripts.sh.

 0.13.0    2026-11-07   joshua    TypeScript groundwork: type-check, lint and
                        claude    format in CI; chores is the first TypeScript
                                  module.

                                  Updates: database backup and restore, a real
                                  health check, Update now and nightly
                                  updates.

                                  Releases carry the built screens; servers
                                  fetch them instead of building.
===============================================================================
HEADER

set -euo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[ "$(id -u)" = 0 ] || { echo "run as root (it writes the systemd unit, like a real install)" >&2; exit 1; }
W="$(mktemp -d)"
UNIT=/etc/systemd/system/family-chalk-planner.service
DROP=/etc/systemd/system/family-chalk-planner.service.d
CONF="$DROP/server.conf"
UNITS=(/etc/systemd/system/family-chalk-planner-{update.service,update.path,nightly.service,nightly.timer})
cleanup() { rm -rf "$W" "$UNIT" "$DROP" "${UNITS[@]}"; }
trap cleanup EXIT
[ -e "$UNIT" ] && { echo "a real family-chalk-planner service is installed here - not touching it" >&2; trap - EXIT; rm -rf "$W"; exit 1; }

# stand-ins: systemd does nothing, no sandboxing (like many LXCs), and the board's health check answers
# like a healthy board running the checked-out version. Version 99.0.0 is a broken release: starting it
# changes the database (like a new version's database update would), and then it isn't healthy.
mkdir -p "$W/bin"
printf '#!/bin/sh\nexit 0\n' > "$W/bin/journalctl"
broken="[ \"\$(node -p 'require(\"$W/app/package.json\").version' 2>/dev/null)\" = 99.0.0 ]"
cat > "$W/bin/systemctl" <<SH
#!/bin/sh
[ "\$1" = start ] && $broken && node -e 'const {DatabaseSync}=require("node:sqlite");const d=new DatabaseSync(process.argv[1]);d.exec("PRAGMA user_version = 99; UPDATE marker SET v = \x27changed by the new version\x27")' "$W/app/data/chalkboard.db" 2>/dev/null
exit 0
SH
cat > "$W/bin/curl" <<SH
#!/bin/sh
$broken && exit 22
case "\$*" in
  *api/health*) printf '{"ok":true,"version":"v%s","db":1}' "\$(node -p 'require("$W/app/package.json").version')" ;;
  */) echo '<meta name="board-version" content="1">' ;;
esac
exit 0
SH
printf '#!/bin/sh\nexit 1\n' > "$W/bin/systemd-run"
chmod +x "$W/bin/"*
export PATH="$W/bin:$PATH"
G=(git -c user.name=ci -c user.email=ci@example.com)
pass() { printf '  ok  %s\n' "$*"; }
fail() { printf 'FAIL  %s\n' "$*" >&2; [ -f "$W/out" ] && sed 's/^/      /' "$W/out" >&2; exit 1; }

# "GitHub": this working tree as one commit
mkdir "$W/seed"
tar -C "$SRC" --exclude=./node_modules --exclude=./.git --exclude=./data --exclude=./face/venv -cf - . | tar -C "$W/seed" -xf -
( cd "$W/seed" && "${G[@]}" init -q -b main && "${G[@]}" add -A && "${G[@]}" commit -qm base )
git clone -q --bare "$W/seed" "$W/origin.git"
newer() { ( cd "$W/seed" && echo "<!-- $1 -->" >> README.md && "${G[@]}" commit -qam "$1" && git push -q "$W/origin.git" main ); }
board() {   # a board installed from "GitHub", optionally with an old .env and/or server.conf
  rm -rf "$W/app" "$DROP" "$UNIT"; git clone -q "$W/origin.git" "$W/app"
  cp -a "$SRC/node_modules" "$W/app/" 2>/dev/null || true
  mkdir -p "$W/app/data"
  [ "$1" = env ] || [ "$1" = both ] && printf 'PORT=3002\nDATA_DIR=%s/data\nBOARD_TITLE="Test"\n' "$W/app" > "$W/app/.env"
  if [ "$1" = conf ] || [ "$1" = both ]; then mkdir -p "$DROP"; printf '[Service]\nEnvironment="PORT=3002" "BIND=0.0.0.0" "DATA_DIR=%s/data"\n' "$W/app" > "$CONF"; fi
  return 0
}
head_is() { [ "$(git -C "$W/app" rev-parse HEAD)" = "$(git -C "$W/origin.git" rev-parse main)" ]; }

echo "deploy scripts:"
# 1. fresh install: no .env, no server.conf
board none
SKIP_PACKAGES=1 SKIP_USER=1 bash "$W/app/deploy/install.sh" --no-face --no-start > "$W/out" 2>&1 || fail "fresh install"
grep -q "\"PORT=3002\"" "$CONF" && grep -q "\"DATA_DIR=$W/app/data\"" "$CONF" || fail "fresh install wrote server.conf"
pass "fresh install writes the service and server.conf"

# 2. updates from every starting point
for start in none env conf both; do
  board "$start"; newer "update from $start"
  bash "$W/app/deploy/update.sh" --check > "$W/out" 2>&1 || fail "update --check ($start)"
  grep -q "update from $start" "$W/out" || fail "update --check lists the new commit ($start)"
  bash "$W/app/deploy/update.sh" > "$W/out" 2>&1 || fail "update ($start)"
  head_is || fail "update reached the newest commit ($start)"
  pass "update with .env/server.conf: $start"
done
[ -f "$W/app/.env.moved-to-admin-console" ] && [ ! -f "$W/app/.env" ] || fail "an old .env is put aside once server.conf exists"
pass "old .env renamed after a healthy update"

# 3. nothing new: says so and succeeds
bash "$W/app/deploy/update.sh" > "$W/out" 2>&1 && grep -q "Already up to date" "$W/out" || fail "already up to date"
pass "already up to date"

# 4. a step fails after the new code is in place: the previous version comes back, with a message
board conf; old="$(git -C "$W/app" rev-parse HEAD)"
( cd "$W/seed" && echo '{ broken' > package-lock.json && "${G[@]}" commit -qam "broken lockfile" && git push -q "$W/origin.git" main )
if bash "$W/app/deploy/update.sh" > "$W/out" 2>&1; then fail "a failed update reports failure"; fi
[ "$(git -C "$W/app" rev-parse HEAD)" = "$old" ] || fail "a failed update goes back to the previous version"
grep -q "stopped at deploy/update.sh line" "$W/out" || fail "a failed update says where it stopped"
pass "failed update is undone and explained"

# 5. the new version needs a newer Node.js than this server has (and it didn't come from NodeSource):
#    nothing changes, and it says why
board conf; old="$(git -C "$W/app" rev-parse HEAD)"
( cd "$W/seed" && node -e 'const f="package.json",p=JSON.parse(require("fs").readFileSync(f));p.engines={node:">=99.0"};require("fs").writeFileSync(f,JSON.stringify(p,null,2))' \
  && "${G[@]}" commit -qam "needs node 99" && git push -q "$W/origin.git" main )
if bash "$W/app/deploy/update.sh" > "$W/out" 2>&1; then fail "an update needing a newer Node.js reports failure"; fi
[ "$(git -C "$W/app" rev-parse HEAD)" = "$old" ] || fail "an update needing a newer Node.js leaves the code as it was"
grep -q "needs Node.js 99.0 or newer" "$W/out" || fail "an update needing a newer Node.js says so"
pass "update needing a newer Node.js stops before changing anything"

# 6. the new version doesn't come up healthy after changing the database: the old code AND the database
#    from before the update come back
( cd "$W/seed" && cp "$SRC/package.json" "$SRC/package-lock.json" . && "${G[@]}" commit -qam "fixed again" && git push -q "$W/origin.git" main )
board conf; old="$(git -C "$W/app" rev-parse HEAD)"
node -e 'const {DatabaseSync}=require("node:sqlite");const d=new DatabaseSync(process.argv[1]);d.exec("CREATE TABLE marker (v TEXT); INSERT INTO marker VALUES (\x27before\x27); PRAGMA user_version = 1")' "$W/app/data/chalkboard.db" 2>/dev/null
( cd "$W/seed" && node -e 'const f="package.json",p=JSON.parse(require("fs").readFileSync(f));p.version="99.0.0";p.engines={node:">=22.18"};require("fs").writeFileSync(f,JSON.stringify(p,null,2))' \
  && "${G[@]}" commit -qam "a version that won't start" && git push -q "$W/origin.git" main )
if bash "$W/app/deploy/update.sh" > "$W/out" 2>&1; then fail "an update that doesn't start reports failure"; fi
[ "$(git -C "$W/app" rev-parse HEAD)" = "$old" ] || fail "rollback: the previous code"
v="$(node -e 'const {DatabaseSync}=require("node:sqlite");const d=new DatabaseSync(process.argv[1]);const r=d.prepare("PRAGMA user_version").get();console.log(d.prepare("SELECT v FROM marker").get().v+"/"+r.user_version)' "$W/app/data/chalkboard.db" 2>/dev/null)"
[ "$v" = "before/1" ] || fail "rollback: the database from before the update (got $v)"
ls "$W/app/data/backup/pre-update/"chalkboard-v*.db >/dev/null 2>&1 || fail "the database was backed up before the update"
grep -q '"state": "rolledback"' "$W/app/data/update-status.json" || fail "the console is told it rolled back"
pass "update that doesn't start: old code and its database come back"

# 7. the nightly check with automatic updates off: notes what's available, changes nothing
board conf; old="$(git -C "$W/app" rev-parse HEAD)"; newer "nightly"
bash "$W/app/deploy/update.sh" --nightly > "$W/out" 2>&1 || fail "nightly check"
[ "$(git -C "$W/app" rev-parse HEAD)" = "$old" ] || fail "nightly check with automatic updates off doesn't update"
grep -q '"state": "available"' "$W/app/data/update-status.json" || fail "nightly check notes the new version"
pass "nightly check: automatic updates off"
# 8. a release: its built screens come with it (the screens-vX.Y.Z tag), nothing is built on the server
board conf
( cd "$W/seed" && node -e 'const f="package.json",p=JSON.parse(require("fs").readFileSync(f));p.version="0.99.0";require("fs").writeFileSync(f,JSON.stringify(p,null,2))' \
  && "${G[@]}" commit -qam "release 0.99.0" && git tag v0.99.0 && git push -q "$W/origin.git" main v0.99.0 )
s="$(mktemp -d)"; ( cd "$s" && echo '<!-- screens for v0.99.0 -->' > index.html && mkdir assets && echo x > assets/a.js \
  && "${G[@]}" init -q && "${G[@]}" add -A && "${G[@]}" commit -qm screens && git push -q "$W/origin.git" HEAD:refs/tags/screens-v0.99.0 )
bash "$W/app/deploy/update.sh" > "$W/out" 2>&1 || fail "update to a release"
grep -q 'screens for v0.99.0' "$W/app/web/dist/index.html" && [ "$(cat "$W/app/web/dist/.version")" = v0.99.0 ] || fail "the release's built screens are in place"
pass "a release brings its built screens"
echo "deploy scripts: all passed"
