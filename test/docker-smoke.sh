#!/usr/bin/env bash
: <<'HEADER'
===============================================================================
 Family Chalk Planner | Tests | docker-smoke.sh
===============================================================================
 Version:   0.17.1
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-14
 Updated:   2026-11-14

 Purpose:
     The published image, run the two ways people run it:
       - Docker: it starts, answers its health check, prints the setup
         code, and its data belongs to the board's user
       - the Home Assistant app: Home Assistant's labels and version, its
         /data with options.json, UPDATER=homeassistant, "Reset the admin"
         happening once (not again on the next start, and again only after
         the option goes off and on), and a board ended by saved settings
         (code 3) started again inside the same container

     Needs Docker. In CI, after the image is built:
          bash test/docker-smoke.sh fcp:ci
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.17.1    2026-11-14   joshua    New file.
                        claude
===============================================================================
HEADER

set -euo pipefail
IMAGE="${1:-fcp:ci}"
names=()
fail() { echo "FAIL: $*"; for n in "${names[@]}"; do echo "--- $n log:"; docker logs "$n" 2>&1 | tail -30; done; exit 1; }
ok() { echo "ok: $*"; }
cleanup() { for n in "${names[@]}"; do docker rm -f "$n" >/dev/null 2>&1 || true; done; }
trap cleanup EXIT

# waits until the container's board answers its health check
healthy() {
  for _ in $(seq 1 60); do
    docker exec "$1" node -e "fetch('http://127.0.0.1:3002/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))" 2>/dev/null && return 0
    sleep 1
  done
  return 1
}
count() { docker logs "$1" 2>&1 | grep -c "$2" || true; }

# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
### ---------- ###
### | Docker | ###
### ---------- ###
names+=(fcp-docker)
docker run -d --name fcp-docker "$IMAGE" >/dev/null
healthy fcp-docker || fail "Docker: no health check answer"
[ "$(count fcp-docker 'setup code')" -ge 1 ] || fail "Docker: no setup code in the log"
[ "$(docker exec fcp-docker stat -c %u /data/chalkboard.db)" = 1000 ] || fail "Docker: the database isn't the board user's"
ok "Docker: starts, healthy, setup code, data owned by 1000"

# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
### ------------------------------------ ###
### | As the Home Assistant app runs it | ###
### ------------------------------------ ###
label() { docker inspect -f "{{ index .Config.Labels \"$1\" }}" "$IMAGE"; }
[ "$(label io.hass.type)" = app ] || fail "no io.hass.type=app label"
[ -n "$(label io.hass.version)" ] || fail "no io.hass.version label"
[ "$(label io.hass.arch)" = "amd64|aarch64" ] || fail "io.hass.arch isn't amd64|aarch64"
ok "Home Assistant labels: $(label io.hass.type) $(label io.hass.version) $(label io.hass.arch)"

# Home Assistant gives the app a /data volume with its options in options.json
vol="fcp-ha-data-$$"
docker volume create "$vol" >/dev/null
setopt() { docker run --rm -v "$vol:/data" --entrypoint sh "$IMAGE" -c "echo '{\"reset_admin\": $1}' > /data/options.json"; }
setopt false
names+=(fcp-ha)
docker run -d --name fcp-ha -v "$vol:/data" -e UPDATER=homeassistant -e TZ=America/Chicago "$IMAGE" >/dev/null
healthy fcp-ha || fail "app: no health check answer"
[ "$(count fcp-ha 'setup code')" -ge 1 ] || fail "app: no setup code in the log"
[ "$(count fcp-ha 'New setup code')" = 0 ] || fail "app: reset the admin with the option off"
ok "app: starts on its /data with options.json"

# "Reset the admin": once, not again on the next start; again after off and on
docker stop -t 20 fcp-ha >/dev/null; setopt true; docker start fcp-ha >/dev/null
healthy fcp-ha || fail "app: didn't come back after Reset the admin"
[ "$(count fcp-ha 'New setup code')" = 1 ] || fail "app: Reset the admin didn't happen once"
docker restart -t 20 fcp-ha >/dev/null; healthy fcp-ha || fail "app: didn't restart"
[ "$(count fcp-ha 'New setup code')" = 1 ] || fail "app: Reset the admin happened again with the option still on"
docker stop -t 20 fcp-ha >/dev/null; setopt false; docker start fcp-ha >/dev/null; healthy fcp-ha || fail "app: off again"
docker stop -t 20 fcp-ha >/dev/null; setopt true; docker start fcp-ha >/dev/null; healthy fcp-ha || fail "app: on again"
[ "$(count fcp-ha 'New setup code')" = 2 ] || fail "app: Reset the admin didn't happen after off and on"
ok "app: Reset the admin happens once each time it's turned on"

# Saved settings end the board with code 3: it starts again in the same container
names+=(fcp-restart)
docker run -d --name fcp-restart "$IMAGE" \
  sh -c 'if [ ! -f /data/.once ]; then touch /data/.once; echo "saved: ending with 3"; exit 3; fi; exec node server/chalkboard.js' >/dev/null
healthy fcp-restart || fail "restart: the board didn't start again after code 3"
[ "$(count fcp-restart 'starting again with the new settings')" = 1 ] || fail "restart: no 'starting again' line"
[ "$(docker inspect -f '{{.RestartCount}}' fcp-restart)" = 0 ] || fail "restart: Docker restarted the container instead"
ok "saved settings: the board starts again inside the container"

# Stopping the container stops the board cleanly (TERM passed on), quickly
start=$(date +%s); docker stop -t 20 fcp-restart >/dev/null; took=$(( $(date +%s) - start ))
[ "$took" -lt 15 ] || fail "stop: took ${took}s (TERM not passed on?)"
ok "stop: ${took}s"

docker volume rm "$vol" >/dev/null 2>&1 || true
echo "All Docker and Home Assistant app checks passed."
