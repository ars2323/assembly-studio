#!/usr/bin/env bash
# Usage: probe/run.sh [build]   compiles RarsProbe into probe/build/classes
# RARS_JAR defaults to the jar probe/setup.sh builds from the pinned source (the one the app ships).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
export RARS_HOME="${RARS_HOME:-${XDG_CACHE_HOME:-$HOME/.cache}/assembly-studio/rars}"
export RARS_JAR="${RARS_JAR:-$RARS_HOME/rars-src.jar}"
[ -f "$RARS_JAR" ] || { echo "RARS_JAR=$RARS_JAR not found; run probe/setup.sh" >&2; exit 1; }
echo "RARS_JAR=$RARS_JAR"

build() {
  rm -rf "$HERE/build/classes"; mkdir -p "$HERE/build/classes"
  javac --release 11 -cp "$RARS_JAR" -d "$HERE/build/classes" "$HERE"/src/*.java
}

case "${1:-build}" in
  build) build ;;
  *) echo "unknown: $1" >&2; exit 2 ;;
esac
