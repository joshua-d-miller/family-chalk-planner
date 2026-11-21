#!/usr/bin/env bash
# shellcheck shell=bash
: <<'HEADER'
===============================================================================
 Family Chalk Planner | Deploy | node-version.sh
===============================================================================
 Version:   1.2.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-17
 Updated:   2026-11-21

 Purpose:
     Which Node.js this machine should run, and installing it from
     NodeSource. Sourced by deploy/install.sh and deploy/update.sh.

     The board's Node.js support:
       - 64-bit (amd64, arm64; Docker and the Home Assistant app too):
         Node.js 26, the recommended version.
       - 32-bit ARM (armhf: 32-bit Raspberry Pi OS): Node.js 22, the
         newest Node.js that still runs there (Node.js stopped making
         32-bit ARM builds with 24). Supported until Node.js 22's end of
         life on 2027-04-30; after that a 32-bit board keeps the last board
         version that runs on 22, and the 64-bit Raspberry Pi OS is the way
         forward. See docs/install.md → Node.js.
     From 1.2 a new install on a 64-bit machine needs Node.js 26
     (node_needed); the board's code keeps running on Node.js 22.18 or
     newer (package.json "engines") for as long as 32-bit boards are
     supported, so an update never stops a board that runs.

 Known limitations:
     Only NodeSource installs are moved to a newer Node.js; a Node.js
     installed another way is left as it is (and still works while it's
     22.18 or newer).
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.1.0    2026-11-17   joshua    New file: Node.js 26 on 64-bit machines,
                        claude    22 on 32-bit ARM.

 1.2.0    2026-11-21   joshua    node_needed / node_new_enough: Node.js 26
                        claude    is required for a new 64-bit install.
===============================================================================
HEADER

# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
### -------------------------- ###
### | The supported versions | ###
### -------------------------- ###
NODE_RECOMMENDED=26        # 64-bit machines
NODE_32BIT=22              # 32-bit ARM: the newest Node.js built for it
export NODE_32BIT_UNTIL=2027-04-30   # Node.js 22's end of life (used by install.sh and update.sh)

# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
### ----------------------------- ###
### | Which one this machine is | ###
### ----------------------------- ###
### 32-bit ARM by Debian's name for it (armhf, armel), else the kernel's    ###
### (armv7l, armv6l). CHALK_NODE_ARCH stands in for both (tests).           ###
node_is_32bit() {
  local arch="${CHALK_NODE_ARCH:-$(dpkg --print-architecture 2>/dev/null || uname -m)}"
  case "$arch" in armhf | armel | armv7l | armv6l) return 0 ;; *) return 1 ;; esac
}
node_target() { if node_is_32bit; then echo "$NODE_32BIT"; else echo "$NODE_RECOMMENDED"; fi; }
node_major() { node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }
# what a new install needs: 26 on a 64-bit machine (from 1.2), 22.18 on 32-bit ARM
node_needed() { if node_is_32bit; then echo "22.18"; else echo "$NODE_RECOMMENDED.0"; fi; }
node_new_enough() {
  command -v node >/dev/null &&
    node -e 'const [a,b]=process.versions.node.split(".").map(Number),[x,y]=process.argv[1].split(".").map(Number);process.exit(a>x||(a===x&&b>=y)?0:1)' "$(node_needed)"
}

# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
### ------------------------------ ###
### | Installing it (NodeSource) | ###
### ------------------------------ ###
### NodeSource keeps one repository per Node.js version, so moving to a     ###
### newer one means its setup script first, then the install.               ###
node_install() {
  local major="$1" rc=0
  curl -fsSL "https://deb.nodesource.com/setup_${major}.x" -o /tmp/nodesource_setup.sh || return 1
  bash /tmp/nodesource_setup.sh >/dev/null || rc=1
  [ "$rc" = 0 ] && { DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs >/dev/null || rc=1; }
  rm -f /tmp/nodesource_setup.sh
  return "$rc"
}
