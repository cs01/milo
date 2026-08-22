#!/usr/bin/env bash
# Literal search over one large file: sequential vs read-only string windows.
#
#   sh benchmarks/strscan/run.sh
#
# This is the single-large-file case, which is where a grep has no file-level
# parallelism to fall back on. Both programs count OCCURRENCES (not matching lines)
# and must agree; the sequential one uses the optimised `indexOfFrom`, the parallel
# one a naive byte compare per window, so the per-core comparison is unfavourable to
# the parallel side on purpose.
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
MILO="${MILO:-$(cd "$DIR/../.." && pwd)/milo}"
RUNS="${RUNS:-3}"
CORPUS="${CORPUS:-$DIR/corpus.txt}"

[ -f "$CORPUS" ] || python3 "$DIR/gen.py" "$CORPUS"

"$MILO" build "$DIR/scan_seq.milo" --release -o "$DIR/scan_seq" >/dev/null || exit 1
"$MILO" build "$DIR/scan_par.milo" --release -o "$DIR/scan_par" >/dev/null || exit 1

best() {
  b=""
  i=0
  while [ "$i" -lt "$RUNS" ]; do
    ms=$("$@" | sed -n 's/.*ms=\([0-9][0-9]*\).*/\1/p')
    if [ -n "$ms" ] && { [ -z "$b" ] || [ "$ms" -lt "$b" ]; }; then b="$ms"; fi
    i=$((i + 1))
  done
  echo "$b"
}

mib=$(wc -c <"$CORPUS" | awk '{printf "%.1f", $1/1048576}')
printf "corpus %s MiB, best of %s\n\n" "$mib" "$RUNS"

count_of() { "$@" | sed -n 's/.*count=\([0-9][0-9]*\).*/\1/p'; }

want=$(count_of "$DIR/scan_seq" "$CORPUS")
printf "%-34s %5s ms\n" "sequential (indexOfFrom)" "$(best "$DIR/scan_seq" "$CORPUS")"

bad=0
for w in 1 2 4 8; do
  got=$(count_of "$DIR/scan_par" "$CORPUS" "$w")
  ms=$(best "$DIR/scan_par" "$CORPUS" "$w")
  if [ "$got" = "$want" ]; then
    printf "%-34s %5s ms\n" "windows x$w (naive compare)" "$ms"
  else
    printf "%-34s %5s ms   COUNT MISMATCH: %s vs %s\n" "windows x$w" "$ms" "$got" "$want"
    bad=1
  fi
done
echo
if [ "$bad" = 0 ]; then
  echo "all windowings agree with the sequential count ($want occurrences)."
else
  echo "A count mismatch means a window boundary lost or double-counted a match,"
  echo "which is exactly what the overlap and the own-range check exist to prevent."
  exit 1
fi
