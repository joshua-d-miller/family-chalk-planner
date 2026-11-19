#!/usr/bin/env bash
: <<'HEADER'
===============================================================================
 Family Chalk Planner | Tests | real-servers/start-radicale.sh
===============================================================================
 Version:   1.1.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-17
 Updated:   2026-11-17

 Purpose:
     Starts Radicale, a real CalDAV calendar server (the same protocol as
     iCloud, Nextcloud and Fastmail), on 127.0.0.1:5232 with one user
     (family / secret), for test/real-servers.test.ts. No accounts
     anywhere: everything lives in a folder that's thrown away.

 Usage:
     pip install radicale==3.5.4
     bash test/real-servers/start-radicale.sh [folder]
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.1.0    2026-11-17   joshua    New file.
                        claude
===============================================================================
HEADER
set -euo pipefail

# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
### ------------------------- ###
### | Its folder and config | ###
### ------------------------- ###
# A user with a plain password (a throwaway test server only)
DIR="${1:-$(mktemp -d)}"
mkdir -p "$DIR/collections"
printf 'family:secret\n' > "$DIR/users"
cat > "$DIR/config" <<EOF
[server]
hosts = 127.0.0.1:5232
[auth]
type = htpasswd
htpasswd_filename = $DIR/users
htpasswd_encryption = plain
[storage]
filesystem_folder = $DIR/collections
[logging]
level = warning
EOF

# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
### -------------------------- ###
### | Started, and answering | ###
### -------------------------- ###
python3 -m radicale --config "$DIR/config" > "$DIR/radicale.log" 2>&1 &
for _ in $(seq 1 50); do
  if curl -fsS -o /dev/null -u family:secret http://127.0.0.1:5232/ 2>/dev/null; then
    echo "Radicale is up on http://127.0.0.1:5232/ (folder: $DIR)"
    exit 0
  fi
  sleep 0.2
done
echo "Radicale didn't start:" >&2
cat "$DIR/radicale.log" >&2
exit 1
