#!/usr/bin/env bash
: <<'HEADER'
===============================================================================
 Family Chalk Planner | Deploy | screens.sh
===============================================================================
 Version:   0.13.0
 Author:    Joshua D. Miller, Claude
 Updated:   2026-11-07

 Purpose:
     Puts the board's screens (the React app in web/dist) in place for the
     code that's checked out.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    Releases carry the built screens; servers
                        claude    fetch them instead of building.
===============================================================================
HEADER

set -euo pipefail
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"
say() { printf '\033[1;33m==>\033[0m %s\n' "$*"; }

# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
### --------------------------- ###
### | Swapping the screens in | ###
### --------------------------- ###
### The new folder replaces web/dist in one move, so a screen loading in    ###
### the middle never gets half of each.                                     ###
put() {   # $1: a folder with the built screens -> web/dist (swapped in at once)
  [ -f "$1/index.html" ] || return 1
  rm -rf web/dist.old
  [ -d web/dist ] && mv web/dist web/dist.old
  mv "$1" web/dist
  rm -rf web/dist.old
}

# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
### ----------------------------------- ###
### | A release: download its screens | ###
### ----------------------------------- ###
### The tag screens-vX.Y.Z holds them; .version says which ones are in      ###
### place, so a second run does nothing.                                    ###
tag="$(git describe --tags --exact-match HEAD 2>/dev/null | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' || true)"
if [ -n "$tag" ]; then
  have="$(cat web/dist/.version 2>/dev/null || true)"
  [ "$have" = "$tag" ] && { say "Screens for $tag already in place"; exit 0; }
  if git fetch --quiet origin "refs/tags/screens-$tag:refs/tags/screens-$tag" 2>/dev/null; then
    rm -rf web/dist.new && mkdir -p web/dist.new
    git archive "screens-$tag" | tar -x -C web/dist.new
    echo "$tag" > web/dist.new/.version
    put web/dist.new && { say "Screens for $tag in place"; exit 0; }
  fi
  say "This release has no built screens to download (releases before 0.13 don't): the board works as before"
  exit 0
fi

# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
### ---------------------------------- ###
### | Not a release: build them here | ###
### ---------------------------------- ###
### Needs the developer packages (npm ci), so this is for people following  ###
### a branch.                                                               ###
# not a release: build them, if the tools are here (they're the developer packages)
if [ -x node_modules/.bin/vite ] || npm ci --no-audit --no-fund --loglevel=error >/dev/null 2>&1; then
  if npx vite build --outDir dist.new >/dev/null 2>&1 && [ -f web/dist.new/index.html ]; then
    git rev-parse --short HEAD > web/dist.new/.version
    put web/dist.new && say "Screens built for $(cat web/dist/.version)"
    exit 0
  fi
fi
rm -rf web/dist.new
say "Couldn't build the screens here (run: npm ci && npm run build): the board works as before"

# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
