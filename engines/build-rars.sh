#!/usr/bin/env bash
# Builds the RISC-V engine's Java parts from the pins in engines/engines.lock:
#
#   bash engines/build-rars.sh <dir>
#
#   <dir>/src/       RARS source at rars_commit, with its jsoftfloat submodule
#   <dir>/rars.jar   built by RARS's own build-jar.sh, class files for Java
#                    <javac_release> (through JDK_JAVAC_OPTIONS: RARS is not touched)
#   <dir>/classes/   probe/src/*.java (RarsProbe) compiled against that jar
#
# Runs on Linux and in Git Bash on Windows.  Needs a JDK (java, javac,
# jar) and git on PATH; the JDK should be the pinned Temurin (engines.yml uses
# actions/setup-java), any JDK >= 11 builds the same class file version.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCK="$ROOT/engines/engines.lock"

fail() { echo "build-rars: FAIL: $*" >&2; exit 1; }

[ $# -eq 1 ] || { echo "usage: bash engines/build-rars.sh <dir>" >&2; exit 2; }
mkdir -p "$1"
DIR="$(cd "$1" && pwd)"

# One value from engines.lock (CR stripped: a Windows checkout may have CRLF).
pin() {
  local v
  v="$(tr -d '\r' < "$LOCK" | sed -n "s/^$1=//p" | tail -n 1)"
  [ -n "$v" ] || fail "no '$1=' in $LOCK"
  printf '%s' "$v"
}
RARS_REPO="$(pin rars_repo)"
RARS_COMMIT="$(pin rars_commit)"
RELEASE="$(pin javac_release)"

for tool in git java javac jar; do
  command -v "$tool" >/dev/null || fail "'$tool' not on PATH (a JDK and git are needed)"
done
echo "build-rars: $(javac -version 2>&1)"

src="$DIR/src"
head="$(git -C "$src" rev-parse HEAD 2>/dev/null || true)"
if [ "$head" = "$RARS_COMMIT" ]; then
  echo "build-rars: RARS source at $RARS_COMMIT (reused)"
else
  echo "build-rars: cloning $RARS_REPO at $RARS_COMMIT"
  rm -rf "$src"
  # autocrlf off: on Windows git would turn the resources' line ends into CRLF,
  # and the jar built there would differ from the one built on Linux.
  git -c core.autocrlf=false clone -q "$RARS_REPO" "$src"
  git -C "$src" config core.autocrlf false
  git -C "$src" -c advice.detachedHead=false checkout -q "$RARS_COMMIT"
  git -C "$src" -c core.autocrlf=false submodule update --init -q
  git -C "$src/src/jsoftfloat" config core.autocrlf false
fi
[ "$(git -C "$src" rev-parse HEAD)" = "$RARS_COMMIT" ] || fail "RARS source is not at $RARS_COMMIT"

echo "build-rars: building rars.jar with RARS's build-jar.sh (javac --release $RELEASE)"
rm -f "$DIR/rars.jar" "$src/rars.jar"
rm -rf "$src/build"
(cd "$src" && JDK_JAVAC_OPTIONS="--release $RELEASE" ./build-jar.sh)
[ -f "$src/rars.jar" ] || fail "build-jar.sh made no rars.jar"
mv "$src/rars.jar" "$DIR/rars.jar"
rm -rf "$src/build"
# RARS itself must stay untouched; only untracked build output is allowed.
if [ -n "$(git -C "$src" status --porcelain --untracked-files=no)" ]; then
  git -C "$src" status --short >&2
  fail "the RARS source tree was modified by the build"
fi

echo "build-rars: compiling probe/src against rars.jar"
shopt -s nullglob
sources=("$ROOT"/probe/src/*.java)
[ ${#sources[@]} -gt 0 ] || fail "no $ROOT/probe/src/*.java"
rm -rf "$DIR/classes"
mkdir -p "$DIR/classes"
javac --release "$RELEASE" -encoding UTF-8 -cp "$DIR/rars.jar" -d "$DIR/classes" "${sources[@]}"
[ -f "$DIR/classes/RarsProbe.class" ] || fail "no RarsProbe.class in $DIR/classes"

echo "build-rars: ok: $DIR/rars.jar, $DIR/classes/ ($RARS_COMMIT, --release $RELEASE)"
