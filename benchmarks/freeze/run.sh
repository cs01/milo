#!/usr/bin/env bash
# Generational arena lookup vs the same lookups after freeze().
#
#   sh benchmarks/freeze/run.sh
#
# 1M items, 10M lookups. Both print the same checksum. The difference is what a
# lookup has to do: the generational path checks arena identity, bounds and the
# slot generation and hands back an Option; the frozen path cannot go stale, so it
# checks bounds and returns T.
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
MILO="${MILO:-$(cd "$DIR/../.." && pwd)/milo}"
RUNS="${RUNS:-5}"

"$MILO" build "$DIR/freeze_gen.milo" --release -o "$DIR/freeze_gen" >/dev/null || exit 1
"$MILO" build "$DIR/freeze_frozen.milo" --release -o "$DIR/freeze_frozen" >/dev/null || exit 1

best() {
  b=""
  i=0
  while [ "$i" -lt "$RUNS" ]; do
    ms=$("$1" | sed -n 's/.*ms=\([0-9][0-9]*\).*/\1/p')
    if [ -n "$ms" ] && { [ -z "$b" ] || [ "$ms" -lt "$b" ]; }; then b="$ms"; fi
    i=$((i + 1))
  done
  echo "$b"
}
g=$(best "$DIR/freeze_gen")
f=$(best "$DIR/freeze_frozen")
printf "%-26s %5s ms\n" "arena.get (generational)" "$g"
printf "%-26s %5s ms\n" "frozen.get (infallible)" "$f"
echo
echo "best of $RUNS. The nanoseconds are the smaller half of the story: the frozen"
echo "path also removes the Option from every call site, which is why it exists."
