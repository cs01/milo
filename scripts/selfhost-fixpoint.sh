#!/bin/sh
# Verify the self-hosting FIXED POINT: milo0 compiled by the oracle and milo0 compiled by
# itself must emit byte-identical IR.
#
#   stage 1   TS oracle compiles src-milo/main.milo   -> .selfhost/milo-self.bin
#   stage 2   stage 1 compiles src-milo/main.milo     -> stage2.ll
#   stage 3   stage 2 compiles src-milo/main.milo     -> stage3.ll
#   assert    stage2.ll == stage3.ll
#
# This does not gate changes in src/, and must not: chasing self-host parity is what got
# src-milo parked for months, and that rule stands. It IS run by .github/workflows/selfhost.yml,
# which is scoped by path to src-milo/, std/ and these scripts — so a src/-only commit never
# triggers it. What that workflow catches is a src-milo/ change that breaks the bootstrap,
# which nothing caught while this was hand-run on one machine.
#
# Every guard cap below is explicit. The default is min(4096, RAM/4), which enforced a
# different limit per machine and killed stage 1 on a 7 GB CI runner (cap 1792 MB) while
# passing on a 16 GB dev Mac. Measured need is under 3 GB for every stage.
#
# Run it when you have changed src-milo/ and want to know whether the bootstrap still
# converges. Takes ~2 minutes.
#
# Pass --asan to build stage2 with AddressSanitizer. src-milo contains no unsafe code, so an
# ASan report on it IS a compiler bug — there is nothing else to blame. That makes ASan a
# zero-false-positive oracle here, and it is what turned a mystery SIGKILL into a named frame
# when stage2 started dying in 0.5s. Costs ~2-3x; worth it the moment a stage misbehaves.
#
# Everything runs under scripts/guard.ts. An unguarded self-compile has crashed this machine
# twice — macOS enforces no rlimits, so the guard is the only real cap.
#
# NOTE: every stage checks its own exit status explicitly. `set -e` alone made this script die
# after printing a progress line and no verdict, which reads as "still running" rather than
# "failed" — and a caller that pipes this into `tail` sees the pipe's status, not the script's.
set -u

root=$(cd "$(dirname "$0")/.." && pwd)
out="$root/.selfhost"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# Native deps some std modules link against. -O0 keeps the link honest: at higher opt levels
# unused SSL/sqlite calls get DCE'd and a missing flag silently stops mattering.
libs="-lm -L/opt/homebrew/opt/openssl@3/lib -lssl -lcrypto -L/opt/homebrew/opt/sqlite/lib -lsqlite3"

echo "stage 1: oracle -> milo-self"
sh "$root/scripts/selfhost.sh"

asan=0
[ "${1:-}" = "--asan" ] && asan=1

# $1 label, $2 expected-nonempty output file, rest: command
stage() {
  label=$1; outfile=$2; shift 2
  # `if ! cmd` would make $? the negation's status (always 0), not the command's.
  "$@"
  st=$?
  if [ "$st" -ne 0 ]; then
    echo "FIXED POINT FAILED at $label — exit $st" >&2
    [ "$st" -eq 137 ] && echo "  (137 = SIGKILL: the guard's memory or timeout cap fired, or the child crashed)" >&2
    echo "  Re-run with --asan to get a named frame instead of a bare kill." >&2
    exit "$st"
  fi
  if [ ! -s "$outfile" ]; then
    echo "FIXED POINT FAILED at $label — exited 0 but produced no output ($outfile is empty)" >&2
    exit 1
  fi
}

echo "stage 2: milo-self compiles itself"
stage "stage 2 emit-ir" "$work/stage2.ll" \
  env MILO_ROOT="$root" bun "$root/scripts/guard.ts" --mem-mb 3072 --timeout-s 600 -- \
  "$out/milo-self.bin" emit-ir "$root/src-milo/main.milo" > "$work/stage2.ll"

if [ "$asan" -eq 1 ]; then
  echo "  (building stage2 with AddressSanitizer)"
  clang -O0 -g -w -fsanitize=address "$work/stage2.ll" -o "$work/stage2.bin" $libs || exit 1
  ASAN_OPTIONS=detect_leaks=0:allocator_may_return_null=1
  export ASAN_OPTIONS
else
  clang -O0 -w "$work/stage2.ll" -o "$work/stage2.bin" $libs || exit 1
fi

# The stack cap is raised for stage 3 only, and it is not papering over a bug: stage 2 is
# linked at -O0 here (see above), where nothing coalesces the 44 per-variant `alloca %Expr`
# slots in Expr$Clone$clone — a ~24 KB frame against the ~5.8 KB the shipped -O2 build has.
# Cloning a 340-deep AST then exhausts the default 8 MB stack in a binary that is otherwise
# healthy. macOS caps this at 64 MB; `ulimit -s` is silently ignored where it is unsupported.
ulimit -s 65520 2>/dev/null || true

echo "stage 3: stage 2 compiles itself"
stage "stage 3 emit-ir" "$work/stage3.ll" \
  env MILO_ROOT="$root" bun "$root/scripts/guard.ts" --mem-mb 3072 --timeout-s 800 -- \
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
