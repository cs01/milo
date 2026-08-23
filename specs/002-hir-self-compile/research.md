# Phase 0 Research: Typed HIR Through the Expression Layer

**Date**: 2026-08-23 | **Spec**: [spec.md](./spec.md) | Measured on `cc045ef2`

## Finding 1 — This is a transcription, not a design problem

**The TypeScript compiler has zero `Unlowered`.**

```
grep -c Unlowered src/hir.ts src/lower.ts src/codegen.ts   →  0  0  0
```

`src/hir.ts` defines 120 expression kinds. `src/lower.ts` (1,479 lines) lowers every one
of them. `src/codegen.ts` (13,501 lines) consumes typed HIR exclusively. `src-milo/hir.milo`
already transcribes 103 of those 120 variants, and its own header says so: *"Transcribed
variant-for-variant from src/hir.ts, which is the spec: same taxonomy, same names, so a
milo-self bug can be diffed against the oracle on the same input."*

**Decision**: Treat `src/lower.ts` as the executable specification for `src-milo/lower.milo`,
arm for arm. For each expression kind, `src/lower.ts` shows what HIR node to build and
`src/codegen.ts` shows how to consume it.

**Rationale**: This retires the spec's highest-risk assumption (Note 5, "the existing HIR
node set is adequate"). The node set is not a guess; it is in production in the reference
compiler against the same 658 fixtures. The 17-variant gap between 103 and 120 is the
only genuine unknown, and it is enumerable up front rather than discovered halfway.

**Alternatives considered**: Designing HIR nodes per kind as we go. Rejected: it reintroduces
the design risk the oracle already eliminated, and it would let the two HIRs diverge, which
destroys the differential-diff property that makes milo-self bugs tractable.

## Finding 2 — The order of migration is free, and that was not obvious

`lowerExpr` is currently four lines: hoist statement blocks into an arena, wrap the whole
node in `mkUnlowered`. Nothing is lowered.

Migrating one kind at a time looked impossible at first: HIR lowering is top-down, so a
lowered child seemed unreachable while its parent is still `Unlowered` and holds a raw AST
node. It is in fact supported, deliberately. `hir.milo` states the mechanism: *"Milo cannot
RETURN the `&ExprNode` inside an Unlowered — second-class references — so every seam matches
the variant inline and calls this on the other arm."* Fifteen such inline seams already exist
in `codegen/stmt.milo`.

**Decision**: Mixed trees are the supported state. At each seam, `HExpr.Unlowered(e)` dispatches
to the AST walk and the other arm takes the HIR path. Kinds may be migrated in any order.

**Rationale**: Order being free means order can be chosen by leverage rather than forced by
structure. Choose by which kinds retire the most reconstruction sites and which appear in the
most fixtures.

**Alternatives considered**: A single cutover of all 103 kinds. Rejected by FR-007, and by
the recorded history: the previous HIR attempt was 1,210 lines, never imported, deleted in
`04738180`.

## Finding 3 — The silent-accept mechanism, located exactly

`placeTypeStr` returns `""` when it cannot derive a type. `markReceiverMoved` in
`codegen/expr.milo:407`:

```milo
let tyStr = placeTypeStr(cg, e, locs)
if tyStr.len == 0 {
    return
}
```

`markReceiverMoved` is what records that a receiver was consumed, so the enclosing scope does
not drop it again. When the type derivation fails, the function returns and the move is never
recorded. A failed derivation and "nothing to do here" are the same code path.

This is Constitution Principle I, inverted: *"Every 'unknown / can't tell / didn't match' path
MUST reject, not accept."* This path accepts, and what it accepts is a missing ownership
decision — a double-drop or a use-after-move.

**Decision**: `placeTypeStr`'s 12 call sites are the highest-priority targets, ahead of the
87 `hintTy` sites, despite being fewer.

**Rationale**: `hintTy` is 87 units of ugliness. `placeTypeStr` is 12 units of unsoundness.
The spec's SC-010 (12 → 0) is the criterion that touches correctness; SC-001 is hygiene.
This also connects the feature to the endgame verdict, which reads the wrongly-accepted
census rather than the fixture count.

**Alternatives considered**: Making `placeTypeStr` abort instead of returning `""`. Rejected
as the primary fix — it converts silent miscompiles into loud crashes on programs that
currently work, without supplying the type. Worth doing as a *transitional* assertion once
each call site's type is available from the node, to prove the site is genuinely dead.

## Finding 4 — The fast gate can be generated, not guessed

FR-027 requires that any substitute for the 48-minute sweep first be shown to catch what the
sweep catches. `selfhost-sweep.ts` has `--filter`, but refuses `--check` with it: *"--check
ratchets against the whole manifest; it cannot be combined with --filter."* So no subset
ratchet exists today.

The TypeScript compiler already emits full HIR for any program: `milo emit-hir foo.milo --all`.
Running it over `tests/fixtures/` yields, for every fixture, the exact set of expression kinds
it exercises. Inverting that map gives, for every expression kind, the fixtures that cover it.

**Decision**: Build `scripts/hir-cover.ts` generating a kind → fixtures index from
`milo emit-hir --json`, and gate a migration step on the fixtures covering the kinds it
touched. Report the input count on every run.

**Rationale**: Satisfies Principle IV (generated from the code, not a hand-maintained list),
FR-023 (states how many inputs it checked), and FR-027 (the subset is derived from what the
change actually touched rather than chosen by intuition). It also answers a question the spec
raised as an edge case: a kind covered by zero fixtures shows up as an empty list, so
"migrated but never exercised" becomes visible instead of silent.

**Alternatives considered**: Time-boxed random subset. Rejected: gives no coverage guarantee
for the kind just changed, which is precisely the class of defect being guarded. Running the
full sweep every time. Rejected as the inner loop only; it remains the pre-push gate.

## Finding 5 — Worktree conflicts with the constitution, and needs saying

The constitution states: *"Commits go directly to `main`; there are no feature branches in this
repo."* A git worktree cannot check out `main` while the primary tree has it.

**Decision**: Worktree on a short-lived branch, rebased onto and merged into `main` at every
green step, branch deleted at the end. Recorded in Complexity Tracking.

**Rationale**: The rule's target is long-lived divergent branches. A branch that merges on every
green commit produces the same history the rule wants. The isolation is required by a fact the
constitution does not cover: another session currently holds uncommitted edits to `std/seal.milo`
and two new fixtures in the primary tree, and a full-suite run was already invalidated once by
an edit landing mid-run.

**Alternatives considered**: Working directly in the primary tree. Rejected: 48-minute
verification runs cannot be trusted while another session edits the files under test, and a
prior session lost work to a concurrent `git add -A`.

## Resolved unknowns

| Spec assumption | Status |
|---|---|
| HIR node set adequate for the expression language | **Resolved.** 103 of 120 transcribed; `src/` runs the full set in production. 17-variant gap enumerable up front. |
| Migration can proceed one kind at a time | **Resolved.** Inline `Unlowered` seams make mixed trees the supported state. |
| A faster gate can substitute for the sweep | **Resolved in principle.** Derive coverage from `emit-hir`; must still be shown to fail on an injected defect before being trusted. |
| Worktree vs. no-feature-branches | **Resolved.** Short-lived branch, merged every green step. Recorded as a deviation. |

## Finding 6 — The node set is complete. Answered, not deferred.

The spec carried "is the HIR node set adequate?" as its highest-risk assumption. It is cheap
to answer by diffing the two taxonomies, so it was answered before planning rather than
discovered at kind 90:

| | Count |
|---|---|
| Kinds in `src/hir.ts` (HExpr + HStmt + HPattern) | 120 |
| Kinds in `src-milo/hir.milo` | 128 |
| Present in `src/`, absent from `src-milo/` | **1** |

The single genuine gap is `Forget`, a statement kind. Three apparent gaps (`EnumPattern`,
`LiteralPattern`, `WildcardPattern`) exist in `src-milo` under an `H` prefix. The remaining
extras (`IterVec`, `IterString`, `IterHashMap`, `IterArray`, `MapKey`, `MapValue`, `ViewLines`,
`ViewSplit`) are `src-milo` enumerating as variants what `src/` encodes as string fields, which
is stricter, not divergent. `Unlowered` is the bridge itself.

**Decision**: Treat the taxonomy as complete. Add `Forget` when its migration step arrives.

**Rationale**: The risk this feature carried into planning was that a significant expression
kind had no representation and scope would grow mid-migration. It does not exist. Every one of
the 103 expression kinds `src-milo` needs is already declared; none is lowered. The work is
filling in `lowerExpr` and deleting the AST walk behind it, against a reference implementation
that runs the same 658 fixtures.

**Consequence for sequencing**: The spec's Note 5 mitigation ("attempt the most structurally
awkward kind first, to test the adequacy assumption early") is no longer needed for that
purpose. Order can be chosen purely by leverage. See Finding 3 — start where the unsoundness is.
