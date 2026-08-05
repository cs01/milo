#!/usr/bin/env bash
# rgbench — compare our rg against real ripgrep, honestly.
#
# Two things make a naive `time ./miloRg pat .` meaningless on this machine:
# a loaded box (concurrent Milo builds from other sessions routinely push load
# past 10 on a 10-core laptop), and a terminal on stdout (rendering 200k lines
# costs more than either search, and it hits both tools, so it looks like a
# tie when it is really just Terminal.app). This refuses the first and avoids
# the second.
set -uo pipefail

MILO="${1:-/tmp/miloRg}"
CORPUS="${2:-$HOME/git/llvm-project}"
RUNS="${RUNS:-3}"
MAXLOAD="${MAXLOAD:-3.0}"

load=$(uptime | sed 's/.*load averages*: *//' | awk '{print $1}' | tr -d ,)
if awk "BEGIN{exit !($load > $MAXLOAD)}"; then
    echo "load average is $load (max $MAXLOAD) — numbers would be noise." >&2
    echo "busiest processes:" >&2
    ps -Ao %cpu,command -r | head -5 | cut -c1-120 >&2
    echo "wait for it to settle, or re-run with MAXLOAD=99 to override." >&2
    exit 1
fi

[ -x "$MILO" ] || { echo "no milo rg binary at $MILO" >&2; exit 1; }
command -v rg >/dev/null || { echo "real rg not on PATH" >&2; exit 1; }
[ -d "$CORPUS" ] || { echo "no corpus at $CORPUS" >&2; exit 1; }

# Best-of-N, not mean: the minimum is the run least disturbed by whatever else
# the machine was doing, which is the number that reflects the code.
best() {
    local b=999 t
    for _ in $(seq "$RUNS"); do
        # stdout to /dev/null: we are timing the search, not the terminal.
        t=$( { /usr/bin/time -p "$@" >/dev/null; } 2>&1 | awk '/^real/{print $2}' )
        b=$(awk "BEGIN{print ($t<$b)?$t:$b}")
    done
    echo "$b"
}

printf '%-28s %8s %8s %8s\n' case milo rg ratio
for spec in \
    "literal|clang" \
    "regex|[A-Za-z_]+_ready" \
    "rare-literal|TargetInfo" \
    "no-match|zqzqzqzq" ; do
    name="${spec%%|*}"; pat="${spec#*|}"
    m=$(best "$MILO" "$pat" "$CORPUS")
    r=$(best rg "$pat" "$CORPUS")
    printf '%-28s %7ss %7ss %7sx\n' "$name" "$m" "$r" "$(awk "BEGIN{printf \"%.2f\", $m/$r}")"
done

# rg defaults to min(cores,12) threads, which is a bad pick on a 4P+6E Mac —
# comparing only against its default flatters us, so pin it too.
m=$(best "$MILO" clang "$CORPUS")
r4=$(best rg --threads 4 clang "$CORPUS")
printf '%-28s %7ss %7ss %7sx\n' "literal (rg --threads 4)" "$m" "$r4" "$(awk "BEGIN{printf \"%.2f\", $m/$r4}")"

# Time-to-first-line: what a human actually feels on a big tree.
python3 - "$MILO" "$CORPUS" <<'PY'
import subprocess, sys, time
milo, corpus = sys.argv[1], sys.argv[2]
for name, cmd in (("milo", [milo, "clang", corpus]), ("rg", ["rg", "clang", corpus])):
    t = time.time()
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    p.stdout.readline()
    print("%-28s %7.3fs to first line" % (name, time.time() - t))
    p.kill(); p.wait()
PY
