#!/usr/bin/env bash
# Milo vs Rust / Zig / Odin / Hylo (+ C baseline) on four small workloads.
# Separate from run.sh because it needs rustc, zig, odin, and a built hylo `hc`.

set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(dirname "$DIR")"
MILO="bun run $REPO/src/main.ts"
RUNS=${RUNS:-10}
WARMUP=${WARMUP:-2}
CC=${CC:-clang}
CFLAGS=${CFLAGS:--O2 -march=native}
# Hylo has no release build and no installer; point this at a `swift build`ed hc.
HC=${HC:-$HOME/git/hylo/.build/arm64-apple-macosx/debug/hc}

bold() { printf "\033[1m%s\033[0m\n" "$*"; }

build_all() {
  local b=$1
  cd "$DIR/$b"
  $MILO build "$b.milo" -o "${b}_milo" > /dev/null
  $CC $CFLAGS "$b.c" -o "${b}_c"
  rustc -O -C panic=abort "$b.rs" -o "${b}_rs"
  zig build-exe -O ReleaseFast -femit-bin="${b}_zig" "$b.zig"
  odin build "$b.odin" -file -o:speed -out:"${b}_odin"
}

bench() {
  local b=$1; shift
  hyperfine -N --warmup "$WARMUP" --runs "$RUNS" \
    --export-markdown "$DIR/results-langs-$b.md" \
    -n milo "./${b}_milo" -n rust "./${b}_rs" -n zig "./${b}_zig" \
    -n odin "./${b}_odin" "$@" -n c "./${b}_c"
}

bold "==> fib(35)"
build_all fib
# Only benchmark Hylo can express: its stdlib has no Movable conformance for
# Float64, so Array<Float64> does not instantiate and there is no float print.
"$HC" -O --emit binary -o fib_hylo fib.hylo
bench fib -n hylo ./fib_hylo

bold "==> 256x256 matmul"
build_all matmul
bench matmul

bold "==> quicksort 500k f64"
build_all sort
bench sort

bold "==> binarytrees depth 15"
build_all binarytrees
bench binarytrees
