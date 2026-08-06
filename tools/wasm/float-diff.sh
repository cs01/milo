#!/bin/bash
# Differential test for the wasm64 runtime's float formatting and parsing:
# builds the same two probes natively and for wasm64 and diffs stdout byte for
# byte. The native binary's libc is the oracle — a green run means
# tools/wasm/runtime.c's dtoa/strtod agree with a real libc exactly, which is
# the property src/codegen.ts's print-and-re-parse round-trip search depends on.
#
#   PATH="/opt/homebrew/opt/llvm/bin:$PATH" tools/wasm/float-diff.sh
#
# Needs node (not bun — see tools/wasm/run.mjs) and a clang with a wasm64
# backend, same as `milo build --target=wasm64`.
#
# Two probes, because they cover different surfaces:
#   float-selftest.c  — snprintf/strtod/strtof directly: %f %e %g at fifteen
#                       precisions, endptr behaviour, ties, subnormals. One
#                       source compiled against the host libc and against
#                       runtime.c.
#   float-diff.milo   — the same conversions reached the way Milo reaches them,
#                       through codegen's @milo.fmt.f64 helper.
set -u
cd "$(dirname "$0")/../.." || exit 1
ROOT=$PWD
OUT=$(mktemp -d "${TMPDIR:-/tmp}/milo-floatdiff.XXXXXX")
trap 'rm -rf "$OUT"' EXIT

CLANG=${CLANG:-clang}
if ! "$CLANG" --print-targets 2>/dev/null | grep -q wasm64; then
  for c in /opt/homebrew/opt/llvm/bin/clang /usr/local/opt/llvm/bin/clang; do
    if [ -x "$c" ] && "$c" --print-targets 2>/dev/null | grep -q wasm64; then CLANG=$c; break; fi
  done
fi
if ! "$CLANG" --print-targets 2>/dev/null | grep -q wasm64; then
  echo "error: no clang with a wasm64 backend (brew install llvm)" >&2
  exit 2
fi

status=0

echo "== float-selftest.c (snprintf/strtod directly) =="
"$CLANG" -O2 -o "$OUT/selftest-native" tools/wasm/float-selftest.c || exit 1
# Same link line as src/main.ts's linkWasm, minus the Milo IR.
"$CLANG" --target=wasm64-unknown-unknown -ffreestanding -O2 -nostdlib -fuse-ld=lld \
  -Wl,--no-entry -Wl,--export=main \
  tools/wasm/runtime.c tools/wasm/float-selftest.c -o "$OUT/selftest.wasm" || exit 1
"$OUT/selftest-native" > "$OUT/selftest.native.txt" || exit 1
node tools/wasm/run.mjs "$OUT/selftest.wasm" > "$OUT/selftest.wasm.txt" || exit 1
if diff -u "$OUT/selftest.native.txt" "$OUT/selftest.wasm.txt" > "$OUT/selftest.diff"; then
  echo "  OK — $(wc -l < "$OUT/selftest.native.txt" | tr -d ' ') lines identical"
else
  echo "  FAIL — $(grep -c '^-[^-]' "$OUT/selftest.diff") differing lines:"
  head -40 "$OUT/selftest.diff"
  status=1
fi

echo "== float-diff.milo (through the compiler) =="
MILO="bun run $ROOT/src/main.ts"
$MILO build tools/wasm/float-diff.milo -o "$OUT/fd-native" >/dev/null || exit 1
$MILO build tools/wasm/float-diff.milo --target=wasm64 -o "$OUT/fd.wasm" >/dev/null 2>&1 || exit 1
"$OUT/fd-native" > "$OUT/fd.native.txt" || exit 1
node tools/wasm/run.mjs "$OUT/fd.wasm" > "$OUT/fd.wasm.txt" || exit 1
if diff -u "$OUT/fd.native.txt" "$OUT/fd.wasm.txt" > "$OUT/fd.diff"; then
  echo "  OK — $(wc -l < "$OUT/fd.native.txt" | tr -d ' ') lines identical"
else
  echo "  FAIL — $(grep -c '^-[^-]' "$OUT/fd.diff") differing lines:"
  head -40 "$OUT/fd.diff"
  status=1
fi

exit $status
