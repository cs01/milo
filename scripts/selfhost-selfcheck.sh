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
# This is cheap (a check, not a build) and is NOT the full fixed point. For that — stage2
# and stage3 emitting byte-identical IR — use scripts/selfhost-fixpoint.sh (~2 min).
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

out=$(MILO_ROOT="$root" bun "$root/scripts/guard.ts" --mem-mb 4096 --timeout-s 300 -- \
  "$self" check "$root/src-milo/main.milo" 2>&1) && status=0 || status=$?

if [ "$status" -eq 0 ]; then
  echo "SELF-CHECK OK — milo-self type-checks its own source"
  exit 0
fi

echo "SELF-CHECK FAILED — milo-self cannot type-check src-milo:"
echo "$out" | head -20
echo
echo "Two things this usually means:"
echo "  * src-milo uses a language/stdlib feature milo-self does not implement yet."
echo "    The TS oracle accepts it, so nothing else notices. Either implement the"
echo "    feature in src-milo, or stop using it in the compiler's own source."
echo "  * A checker rule you just added OVER-REJECTS. src-milo is 25k lines of real"
echo "    Milo; if a new rule is too strict, it shows up here long before any fixture."
exit 1
