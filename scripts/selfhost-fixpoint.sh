#!/bin/sh
# Verify the self-hosting FIXED POINT: milo0 compiled by the oracle and milo0 compiled by
# itself must emit byte-identical IR.
#
#   stage 1   TS oracle compiles src-milo/main.milo   -> .selfhost/milo-self.bin
#   stage 2   stage 1 compiles src-milo/main.milo     -> stage2.ll
#   stage 3   stage 2 compiles src-milo/main.milo     -> stage3.ll
#   assert    stage2.ll == stage3.ll
#
# THIS IS NOT A GATE. Nothing in CI or `bun test` runs it, and nothing should: per
# docs/self-hosting.md and long-standing project policy, self-host parity must never block a
# change in src/. Chasing that parity is what got src-milo parked for months. This exists so
# the state can be CHECKED cheaply and deliberately, not enforced.
#
# Run it when you have changed src-milo/ and want to know whether the bootstrap still
# converges. Takes ~2 minutes.
#
# Everything runs under scripts/guard.ts. An unguarded self-compile has crashed this machine
# twice — macOS enforces no rlimits, so the guard is the only real cap.
set -e

root=$(cd "$(dirname "$0")/.." && pwd)
out="$root/.selfhost"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# Native deps some std modules link against. -O0 keeps the link honest: at higher opt levels
# unused SSL/sqlite calls get DCE'd and a missing flag silently stops mattering.
libs="-lm -L/opt/homebrew/opt/openssl@3/lib -lssl -lcrypto -L/opt/homebrew/opt/sqlite/lib -lsqlite3"

echo "stage 1: oracle -> milo-self"
sh "$root/scripts/selfhost.sh"

echo "stage 2: milo-self compiles itself"
MILO_ROOT="$root" bun "$root/scripts/guard.ts" --mem-mb 4096 --timeout-s 600 -- \
  "$out/milo-self.bin" emit-ir "$root/src-milo/main.milo" > "$work/stage2.ll"
clang -O0 -w "$work/stage2.ll" -o "$work/stage2.bin" $libs

echo "stage 3: stage 2 compiles itself"
MILO_ROOT="$root" bun "$root/scripts/guard.ts" --mem-mb 4096 --timeout-s 800 -- \
  "$work/stage2.bin" emit-ir "$root/src-milo/main.milo" > "$work/stage3.ll"

s2=$(wc -l < "$work/stage2.ll" | tr -d ' ')
s3=$(wc -l < "$work/stage3.ll" | tr -d ' ')
echo "stage2: $s2 lines   stage3: $s3 lines"

if cmp -s "$work/stage2.ll" "$work/stage3.ll"; then
  echo "FIXED POINT HOLDS — stage2 == stage3, byte-identical"
  exit 0
fi

echo "DIVERGED — stage2 != stage3. First difference:"
diff "$work/stage2.ll" "$work/stage3.ll" | head -20
echo
echo "A divergence means milo0 compiled by the oracle and milo0 compiled by itself disagree."
echo "Historically the causes have been: an enum payload sized without alignment padding"
echo "(shows up only at -O2), a hashmap seeded from getentropy (nondeterministic between"
echo "runs), or a string builder leaving cap undefined. See docs/self-hosting.md."
exit 1
