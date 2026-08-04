# Worksheet: a checker that stops when it should, and a machine that hunts for the spellings it misses

- **Slug / tag:** `ws/fatal-and-ownership-fuzzer`
- **Started:** 2026-08-03
- **Status:** done
- **Related:** `docs/worksheets/2026-08-03-fail-closed-places.md` (the two items left
  behind by it), backlog Tier 1 residue, `scripts/prove-soundness-fuzz.ts`

## Goal

Two leftovers from the place-walker change, done together because the second one
tests the first.

1. `checker.error()` returns `void`, so the checker reports a broken invariant and
   keeps running on it. Give it a `fatal(): never` — and the error *recovery* that
   makes throwing affordable.
2. There was no machine hunting for ownership holes. Every one found so far was
   found by a person writing a game or a port and hitting `exit 133`. Build the
   falsifier so discovery does not depend on someone writing the right program.

## What landed

### `fatal(): never` and its boundaries

`fatal(msg, span, hint)` reports and throws `CheckAbort`. The value is not the
throw, it is where the throw *stops*:

| boundary | absorbs |
|---|---|
| per statement in a function body | a fatal in one statement; the next still checks |
| per function in `check()` | a fatal in a signature or contract, before any body |
| `check()` itself | a fatal in a whole-program pass with no finer boundary |

`recover()` rewinds what the abandoned work left raised — scope depth, `unsafe`
depth, loop depth, closure state. Those are not bookkeeping: a leftover
`unsafeDepth` makes the *next* function's raw address-of legal outside `unsafe`,
and a leftover `loopDepth` makes its `break` legal outside a loop.
`tests/checkerRecovery.test.ts` asserts all three, and each assertion was checked
by disabling the corresponding rewind and watching exactly one test fail.

`resolveAssignTarget` is the first conversion, chosen because its `| null` existed
only to encode "the error already fired" — six callers had to remember to check it
and do nothing but bail. It now returns a target or does not return.

The outermost boundary matters most in the LSP, which runs the checker on
half-typed code on every keystroke: an escaped throw means the file shows *no*
diagnostics, not the wrong ones.

### `scripts/fuzz-ownership.ts`

Generates programs from an ownership model it also uses to predict their stdout,
then executes them. Half are written correct and half have a use-after-move
spliced in, so both directions are pinned at once — a checker that accepts
everything fails the second half, one that rejects everything fails the first.

Three oracles on an accepted program: it aborts (double free), it prints something
other than what it owns (use of freed or zeroed memory), or it was invalid and
compiled anyway. Runs under `MallocScribble=1`, which is what makes the second one
fire on macOS at all — without it a use-after-free usually reads the right bytes
out of memory nothing has reused yet.

Generation is biased at the shapes where a move is spelled *indirectly*, because
that is where every hole in this compiler's history has lived: the tail of an
`if`, of a `match`, of `??`, a field out of a struct, an argument to a method.

## What it found, first run, six cases

`let x = p.a` twice compiled. The first move zeroed the field so nothing could
double-free; the second read handed back the zeroed slot as an empty string.
Memory-safe, and silently wrong — the outcome the ethos ranks *below* a false
rejection.

Root cause: `VarInfo.moved` is one bit for a whole binding. Moving out of a field
marked the *expression* (so codegen would zero it) and recorded nothing about
which field had left.

Fix: `VarInfo.movedPlaces` — the field chains already moved out. Marked in
`tryMoveLeaf`, checked on read in `checkExpr`'s `FieldAccess` (a move position
reads first, so checking in both places would double-report), cleared on
assignment, and covering-prefix aware: once `p.i` is gone, so is `p.i.t`. Moving
the whole binding after a partial move is rejected too, for the same reason —
handing on a struct with a zeroed field passes it off as real data.

## Decisions

- **Not every `error()` becomes a `fatal()`.** The ~100 sites that report a type
  mismatch and continue with a valid fallback are *good* recovery: `a + b` with
  two bad operands should say so twice. Converting them would cost a diagnostic
  per statement and buy nothing, since an error already blocks codegen. `fatal()`
  is for the sites where the invariant the following code needs is the one that
  just failed.
- **Only static field chains are tracked.** An index step is a runtime value:
  marking `v[i]` moved would either over-reject every later `v[j]` or be unsound
  for a different `j`. Those keep the move-zeroing, which is memory-safe on its
  own.
- **Per-place state had to join the existing flow merge, not sit beside it.**
  Found the hard way — see below.

## Found on the way

`examples/tools/java-dap` stopped compiling: `pkt.body` is moved inside an
`if … { … return }` and read after it. The move-merge machinery
(`snapshotMoveState`/`restoreMoveState`, "a branch that always returns does not
leak its moves") was written entirely in terms of the per-binding boolean, so the
new per-place state was never saved, restored, or merged and leaked out of a
branch that returns.

That is the same defect shape as the one the previous worksheet closed — state
that exists in two places and only one of them knows the rule. The snapshot now
carries both halves (`{moved, places}`), `mergeMoveState` does the union
direction, and the eight textually identical loop-move blocks collapsed into one
`checkLoopMoves` that applies the rule one level down as well: a field moved out
in a loop body is just as gone on iteration two.

Worth stating plainly: the fuzzer found the hole, and the *examples corpus* found
the over-correction. Neither would have caught both.

## Ethos review — the case against this change

Per AGENT_WORKFLOW.md §5, argued against each clause of *"a memory-safe systems
language that guides you to correct, readable programs."*

**memory-safe — what spelling reaches the new rule and gets the permissive
branch?** `staticFieldPath` returns null for any index, deref, or payload step, so
`v[0]` twice is not tracked. Probed it: on an owned `Vec<string>` it does not even
move — three reads of `v[0]` each yield `delta` and the Vec keeps its element, so
it clones. Memory-safe, but it is backlog Tier 1 #7 again: the same operation
answers differently depending on the container it is spelled through, and this
change widens the gap between the two answers by making the field side stricter.
Not a hole this opened, and the direction is right (fields moved from *silently
wrong* to *rejected*), but the row is now more uneven, not less. It belongs with
the Tier 1 #7 decision, which is a breaking change and needs its own call.

Probed the spellings that *do* reach it, all rejected correctly: nested
`p.i.t` twice, `p.i` then `p.i.t` (prefix), a field moved through an `if` tail then
read, and the whole struct moved after a field left.

**guides you — what does a user see?** `use of moved value 'p.a'` at the second
use, with a hint naming the point of transfer and `.clone()`. When a prefix is
what left, the hint names the prefix, not the leaf, because cloning the leaf would
not help. Before: no diagnostic and an empty string.

**correct — where does this fail open?** `staticFieldPath` returning null means
*not tracked*, which is accept — the pre-existing behavior, and stated above. The
`fatal()` boundaries fail closed in the other direction: an unwind that reaches
`check()` still returns the diagnostics collected so far rather than throwing at
the caller.

**readable — could someone infer the rule?** `movedPlaces` is one field on
`VarInfo` next to `moved`, documented as the same question asked about a part
instead of the whole. The merge is one helper each for union, restore, and the
loop rule, where there used to be eight copies of the loop rule.

## Verification

- `bun test` — see below; `tests/run.test.ts` 737 pass / 0 fail (3 new fixtures).
- `tsc` on `src/` — 0 errors, gate held at zero.
- `bun scripts/run-examples.ts` — 71 compiled, 24 ran, 0 failed.
- `bun scripts/fuzz-ownership.ts` across seeds 4/11/21/37/101, 150 cases: no
  findings, and the counters non-vacuous every run (valid accepted > 0, invalid
  rejected = invalid total).
- New fixtures: `tests/errors/moveFieldTwice.milo`,
  `tests/errors/movePartiallyMovedStruct.milo`,
  `tests/fixtures/moveFieldThenReassign.milo`.
- New tests: `tests/checkerRecovery.test.ts`, `tests/ownershipSoundness.test.ts`
  (40 cases, fixed seed, in CI).

## Blockers / open questions

- Tier 1 #7 (one aliasing rule, three answers by container) now has a wider gap
  between the field answer and the index answer. Still needs the breaking-change
  decision.
- Reading a partially-moved struct *by borrow* is still accepted — `borrow(p)`
  after `p.a` left sees a zeroed field. Rust rejects it. Moving it is now
  rejected, which covers the case where the zeroed field gets passed on as data;
  the borrow case only reads it, and rejecting it would need the same
  partial-move-through-a-reference analysis with no evidence yet that anyone hits
  it.
- The fuzzer generates one struct shape and string payloads. Vec-of-struct,
  enum payloads, closures capturing by move, and `Drop` impls are all untried
  ground; each is a shape entry, not a redesign.
