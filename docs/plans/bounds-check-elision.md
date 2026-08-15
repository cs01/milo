<!-- doc-meta
system: bounds-check-elision-plan
purpose: implementation plan for removing provably-in-range bounds checks without a --no-bounds-checks flag
key-files: src/codegen.ts, src/verify.ts, src/hir.ts, src/checker.ts
update-when: the elision sequence, the range lattice, or the prover's index support changes
last-verified: 2026-08-14
-->

# Bounds-check elision — implementation plan

**Goal.** Remove the bounds check on an index the compiler can *prove* in range, so a hot
inner loop pays nothing, and do it without ever offering a flag that removes the check on
an index it cannot prove.

**The rule this must not break.** From `docs/design.md` §Ethos and
`project_milo_overflow_semantics`: bounds are a *memory-safety* tier, not a correctness
tier. Overflow gets `@wrapping` because a wrapped add is still memory-safe. An unchecked
index is not, so there is no `--no-bounds-checks` and no `@unchecked` on a subscript —
**the only way a check disappears is that something proved it redundant.** A proof that
fails leaves the check in and stays silent; it never degrades safety, only speed.

## The identity rule

Both existing optimisations — the hoisted length and the `for i in 0..v.len()` proof —
are keyed on the *source name* of the container. A name is not an identity: a function
can declare the same name twice in sibling scopes, and a `let` is not a mutation, so
`loopBodyMutates` does not reject one. Every entry therefore records the `LocalInfo`
the name resolved to when it was made, and is honoured only while the name still
resolves to that same record.

Skipping that check produced a bounds check that compared one vec's index against
another vec's length (found in milojs's regex engine, whose `regexStrMatch` binds
`saves` twice). Fixtures: `tests/fixtures/boundsCheckShadowedVec.milo` and
`tests/runtime-errors/boundsCheckShadowedProof.milo`.

## Where we start

Every subscript emits a check, unconditionally:

- `emitBoundsCheck` (`src/codegen.ts`) emits `icmp ult` + branch to an abort block. It is
  called from the fixed-array path (`[N x T]`, constant size) and `genStringIndex`, and the
  Vec path does the same against a loaded length.
- There is no elision anywhere, no range lattice in the checker, and no `HIR` flag on an
  `IndexAccess` saying "checked" vs "proven".
- `milo prove` cannot help yet: `src/verify.ts` has no `IndexAccess` translation at all, and
  a length read does not survive lowering — both become `UNSUPPORTED`, and an obligation
  containing one is dropped rather than attempted.

So the prover route is *not* one change. It is a length model plus an index model plus a way
to carry the verdict into codegen.

## Sequence

Ordered so each stage ships a real win alone, cheapest first. Stage 1 is expected to cover
most of a rasteriser inner loop; stages 3–4 are what the user actually asked for and what
covers the cases stage 1 cannot see.

### Stage 1 — local range analysis in the checker (no solver)

A forward interval lattice over integer locals, per basic block, tracking `[lo, hi]` plus a
symbolic upper bound naming a length (`i < zbuf.len`). Enough to discharge the dominant
shape:

```milo
var i: i64 = 0
while i < zbuf.len { zbuf[i] = ...  i = i + 1 }     // provably in range
for y in 0..h { for x in 0..w { hdr[y * w + x] } }  // needs the multiply, see stage 2
```

Mark the `HIRExpr` `IndexAccess` with `proven: true`; `emitBoundsCheck` is then skipped for
it. Requires: the length expression is *loop-invariant* (no `push`/`clear`/`resize` on the
container anywhere in the loop body — a conservative syntactic check to start, since a
mutation invalidates the bound).

**This is the cheap 80%.** It is also the stage to measure first: LLVM already removes some
of these checks after inlining, so the honest number for "what does elision buy" has to come
from a real before/after on `examples/games/flight`, not from an estimate.

### Stage 2 — affine indices

`y * w + x` where `y < h`, `x < w`, and the buffer length is `w * h`. This is the rasteriser
case and it is *not* interval arithmetic — it needs the relation `y*w + x < w*h` given
`y <= h-1` and `x <= w-1`, which is nonlinear in the symbols `w` and `h`. Two options:
represent the index as an affine form over loop variables and match it against a length that
is a product of the same symbols (pattern-level, cheap, brittle), or hand it to the solver
(stage 4). Prefer routing this one to the solver rather than special-casing the shape.

### Stage 3 — teach the prover about lengths

Add to `src/verify.ts`:
- `len` as an uninterpreted function symbol per container, with the standing axiom
  `len(v) >= 0`. No element theory, no select/store.
- `IndexAccess` translation that emits the *obligation* `0 <= i < len(v)` rather than a value.

**The key scoping insight: eliding a bounds check does not need the sequence theory of
backlog Tier-2 #12.** #12 wants `forall i,j. v[i] <= v[j]` — reasoning about *contents*, which
needs select/store and trigger selection. A bounds check only ever asks about the *index*
versus *one length symbol*. That is linear scalar arithmetic over an opaque constant, which
is exactly what `std/smt`'s Fourier-Motzkin and z3 already decide today. This item is
therefore much cheaper than #12 and should not be sequenced behind it.

Mutation is the real subtlety, not the arithmetic: `len(v)` must be havoc'd at any call that
could take `&mut v`, and at any `push`/`pop`/`clear`. `collectMutations` already does the
analogous job for `&mut` params.

### Stage 4 — wire the verdict into codegen

`milo prove` runs as a separate command today. Elision needs the verdict *during* a normal
build, which is the real architectural question in this plan:

- **Do not** make `milo build` shell out to z3. A build must not depend on a solver being
  installed, and must not vary its output by whether one is.
- Run the in-box `std/smt` prover only, on a strict node budget, during `--release`. Anything
  it cannot discharge inside the budget keeps its check. Same binary semantics either way, so
  a missing/slow solver costs speed and never correctness.
- Emit `milo prove --explain-elision` to list what was and was not discharged, so the user can
  see why a hot loop still pays. Without this the feature is unactionable — you cannot tell a
  failed proof from an absent one.

**Determinism gate.** Elision must be a pure function of the source, never of solver wall
time. A timeout-based budget makes the emitted binary depend on machine load. Use a
deterministic step/node count, not milliseconds.

## Tests

- `tests/fixtures/` — a fixture per elided shape that still produces the right answer.
- `tests/runtime-errors/` — the negative half: an index the analysis *cannot* prove must
  still trap. A regression that silently elides an unprovable check is the one failure mode
  that matters, so this suite is the gate, not the fixtures.
- An IR-level test asserting the check is actually gone (`grep -c bounds.fail`), because a
  fixture passes whether or not the check was removed.
- Benchmark: `examples/games/flight` frame time, before/after, on a quiet box — the machine
  that produced four invalid overflow measurements (backlog Tier-2 #1) is the cautionary tale.

## Open questions

1. Does LLVM already remove the stage-1 checks after inlining? Measure before building
   anything — this decides whether stage 1 is worth shipping on its own.
2. Should a proven-in-range index still emit the check under `--debug`? Leaning yes: keep
   `-O0` maximally paranoid so a wrong proof shows up in development rather than only in
   release.
3. Is per-element disjointness needed for `&mut [T]` splits (backlog Tier-2 #9) to share this
   machinery? Probably not — that item's range-level disjointness has the same shape as this
   one, so they may share the affine-index representation from stage 2.
