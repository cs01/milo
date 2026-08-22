#!/usr/bin/env bash
# Retaining scanned literals as owned strings vs as Spans into a sealed buffer.
#
#   sh benchmarks/seal/run.sh
#
# Same scanner both sides, same checksum; only what gets KEPT differs. The owned
# side allocates once per retained literal, the span side keeps two integers and
# allocates only when its Vec doubles.
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
MILO="${MILO:-$(cd "$DIR/../.." && pwd)/milo}"
RUNS="${RUNS:-5}"

peak_mib() {
  case "$(uname -s)" in
    Darwin) awk '/maximum resident set size/ { printf "%.1f", $1/1048576 }' "$1" ;;
    *)      awk '/Maximum resident set size/ { printf "%.1f", $NF/1024 }' "$1" ;;
  esac
}

"$MILO" build "$DIR/seal_owned.milo" --release -o "$DIR/seal_owned" >/dev/null || exit 1
"$MILO" build "$DIR/seal_span.milo" --release -o "$DIR/seal_span" >/dev/null || exit 1

row() {
  bms=""; bmb=""
  i=0
  while [ "$i" -lt "$RUNS" ]; do
    /usr/bin/time -l "$2" >"$DIR/.out" 2>"$DIR/.err" || /usr/bin/time -v "$2" >"$DIR/.out" 2>"$DIR/.err"
    ms=$(sed -n 's/.*ms=\([0-9][0-9]*\).*/\1/p' "$DIR/.out")
    mb=$(peak_mib "$DIR/.err")
    if [ -n "$ms" ] && { [ -z "$bms" ] || [ "$ms" -lt "$bms" ]; }; then bms="$ms"; bmb="$mb"; fi
    i=$((i + 1))
  done
  printf "%-30s %5s ms   %7s MiB peak\n" "$1" "$bms" "$bmb"
}
echo "600k retained literals, best of $RUNS"
echo
row "owned string per literal" "$DIR/seal_owned"
row "Span into a sealed buffer" "$DIR/seal_span"
rm -f "$DIR/.out" "$DIR/.err"
