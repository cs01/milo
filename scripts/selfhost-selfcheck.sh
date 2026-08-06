#!/bin/sh
# Can milo-self still type-check src-milo? Run this after EVERY change to src-milo.
#
# The fixture and negative-test censuses measure milo-self against tests/. They cannot
# see the one property that makes this a self-hosting compiler: milo-self must be able to
# compile its own source. That property died silently for hours while every census stayed
# green, because a lane wrote src-milo code using a feature milo-self does not implement.
#
# Two distinct failure shapes this catches, both invisible to tests/:
#   1. src-milo uses a feature milo-self lacks (an `as` import alias, HashMap.isEmpty()).
#      The TS oracle compiles it; milo-self chokes on the compiler's own source.
#   2. A new checker rule OVER-REJECTS and refuses valid code. src-milo is 25k lines of
#      real Milo and is a far better over-rejection detector than any fixture — a borrow
#      rule that no fixture exercises will still hit the compiler itself.
#
# Two stages, because `check` alone is not enough. A gap that lives in codegen — a method
# the checker knows and the emitter does not — type-checks clean and then dies at build.
# This script used to stop after `check`, and that hole was found by a human running
# `build` by hand. Pass --quick to skip the build stage when iterating on checker rules.
#
# This is NOT the full fixed point. For that — stage2 and stage3 emitting byte-identical
# IR — use scripts/selfhost-fixpoint.sh (~2 min).
#
# Per docs/self-hosting.md this must never GATE a change in src/. It gates changes to
# src-milo/, which is a different thing: a self-hosted compiler that cannot compile itself
# is not self-hosted.
#
# Runs under scripts/guard.ts — milo-self is untrusted and an unguarded self-compile has
# crashed this machine twice.
set -e

root=$(cd "$(dirname "$0")/.." && pwd)
self="$root/.selfhost/milo-self.bin"

if [ ! -x "$self" ]; then
  echo "missing $self — run scripts/selfhost.sh first" >&2
  exit 1
fi

quick=0
[ "$1" = "--quick" ] && quick=1

explain() {
  echo
  echo "Three things this usually means:"
  echo "  * src-milo uses a language/stdlib feature milo-self does not implement yet."
  echo "    The TS oracle accepts it, so nothing else notices. Either implement the"
  echo "    feature in src-milo, or stop using it in the compiler's own source."
  echo "  * A checker rule you just added OVER-REJECTS. src-milo is 25k lines of real"
  echo "    Milo; if a new rule is too strict, it shows up here long before any fixture."
  echo "  * (build stage only) the checker knows a construct the emitter does not."
}

out=$(MILO_ROOT="$root" bun "$root/scripts/guard.ts" --mem-mb 4096 --timeout-s 300 -- \
  "$self" check "$root/src-milo/main.milo" 2>&1) && status=0 || status=$?

if [ "$status" -ne 0 ]; then
  echo "SELF-CHECK FAILED — milo-self cannot type-check src-milo:"
  echo "$out" | head -20
  explain
  exit 1
fi

if [ "$quick" -eq 1 ]; then
  echo "SELF-CHECK OK (--quick: type-check only, build stage skipped)"
  exit 0
fi

# The build needs more headroom than the check: codegen holds the whole module.
probe=$(mktemp -t milo-selfbuild)
trap 'rm -f "$probe"' EXIT
out=$(MILO_ROOT="$root" bun "$root/scripts/guard.ts" --mem-mb 6144 --timeout-s 600 -- \
  "$self" build "$root/src-milo/main.milo" -o "$probe" 2>&1) && status=0 || status=$?

if [ "$status" -ne 0 ]; then
  echo "SELF-BUILD FAILED — milo-self type-checks src-milo but cannot compile it:"
  echo "$out" | head -20
  explain
  exit 1
fi

echo "SELF-CHECK OK — milo-self type-checks AND compiles its own source"
exit 0
