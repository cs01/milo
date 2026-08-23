# Implementation Plan: Typed HIR Through the Expression Layer

**Branch**: `002-hir-self-compile` | **Date**: 2026-08-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-hir-self-compile/spec.md`

## Summary

`src-milo`'s HIR stops at the statement boundary. Statements are lowered and
`codegen/stmt.milo` walks HIR, but **every expression** crosses into the backend as
`HExpr.Unlowered(astNode)` — one catch-all site — into 9,622 lines of `codegen/expr.milo`
that re-derive from syntax what the checker already computed. 115 backend sites exist solely
to reconstruct frontend knowledge.

Phase 0 changed the shape of this work. The reference compiler has **zero `Unlowered`**:
`src/lower.ts` lowers all 120 kinds and `src/codegen.ts` consumes typed HIR only. And a
taxonomy diff shows `src-milo/hir.milo` is missing exactly **one** kind (`Forget`). So this is
not a design problem with an unknown node set. It is a transcription against a working oracle
that already runs the same 658 fixtures, one expression kind at a time, with a monotone counter
and a differential sweep proving each step.

Sequencing is driven by Finding 3: `placeTypeStr` (12 sites) outranks `hintTy` (87 sites),
because `placeTypeStr` returns `""` on failure and `markReceiverMoved` reads `""` as "skip the
ownership decision". That is unsoundness, not untidiness, and it is the defect class the
endgame verdict actually reads.

## Technical Context

**Language/Version**: Milo (`src-milo/`, self-hosted); TypeScript on Bun (`src/`, the reference)

**Primary Dependencies**: LLVM (clang), Bun runtime. No new dependencies.

**Storage**: N/A. Baselines are JSON under `tests/` (`hir-ratchet.json`, `selfhost-manifest.txt`).

**Testing**: `tests/fixtures/*.milo` (658, annotated `// @expect:`) via `bun test tests/run.test.ts`;
`scripts/selfhost-sweep.ts` for the differential corpus; `scripts/hir-ratchet.ts` for the counters.

**Target Platform**: macOS + Linux, aarch64 + x86_64. Unchanged by this work.

**Project Type**: Compiler.

**Performance Goals**: None. Neither compile speed nor emitted-code size is a goal; neither may
regress past `selfhost-irsize.ts`'s existing tolerance.

**Constraints**: Host memory guards are OS-safety and MUST NOT be weakened — macOS enforces no
rlimits. `.selfhost/milo-self.bin` never run bare. `MILO_RUN_UNGUARDED=1` never committed. Sweep
concurrency not raised without redoing the arithmetic in `scripts/guard.ts`.

**Scale/Scope**: 103 expression kinds to lower; 115 reconstruction sites to retire; 9,622 lines
of AST-walking codegen to replace; 21 fixtures outside the manifest.

## Constitution Check

*GATE: evaluated before Phase 0, re-evaluated after Phase 1.*

| Principle | Verdict | Evidence |
|---|---|---|
| **I. Memory safety is the product.** Every "can't tell" path must reject, not accept. | **PASS — and this is the point.** The feature exists to remove a path that accepts. `markReceiverMoved` returns silently when `placeTypeStr` yields `""`, skipping a receiver-move record: a double-drop produced by a failed type derivation. C3 makes both mismatch directions abort. | research.md Finding 3; contracts/hir-seam.md C2–C3 |
| **II. The checker owns every semantic error.** | **PASS.** Strengthened: the checker's types reach the backend instead of being re-derived there. No new rejection path is added to codegen. | FR-001 |
| **III. Nothing works until it has been run.** | **PASS.** No step is complete without the fixture corpus. G4 is mandatory before every push, explicitly because it is the only gate that caught the six regressions G3 and G5 missed. FR-024 requires each gate be observed failing before it is trusted. | contracts/gates.md |
| **IV. Generate it, don't restate it.** | **PASS.** The coverage index is generated from `milo emit-hir --json`, not hand-maintained. It consumes the JSON surface rather than importing `src/*.ts`. | research.md Finding 4 |
| **V. Done spans the whole toolchain.** | **PASS, narrowly — see note.** No language surface changes, so the formatter and LSP are untouched by construction. A kind with zero covering fixtures must get one before it counts as migrated (G2). | contracts/gates.md G2 |
| **Self-host never gates a `src/` change.** | **PASS.** Direction preserved. This work is entirely inside `src-milo/` plus one new script, and is itself gated by the self-host suite. | Out of Scope |
| **Memory guards.** | **PASS.** No guard weakened, no concurrency raised. The worktree gets its own `.selfhost/` build. Exit 137 is documented as a guard kill, not a fixture failure. | quickstart.md |
| **Commits go directly to `main`; no feature branches.** | **DEVIATION — recorded below.** | Complexity Tracking |

**Post-Phase-1 re-evaluation**: no new violations. The design added one script and one branch
deviation. The largest risk the spec carried into planning (an inadequate node set) was
measured and closed at 1 missing kind, so no complexity was added to absorb it.

## Project Structure

### Documentation (this feature)

```text
specs/002-hir-self-compile/
├── plan.md              # this file
├── spec.md
├── research.md          # Phase 0 — six findings, all spec unknowns resolved
├── data-model.md        # Phase 1 — the seam, its invariants, the counters
├── quickstart.md        # Phase 1 — runnable validation
├── contracts/
│   ├── hir-seam.md      # C1–C6: lowering, type access, abort-both-directions
│   └── gates.md         # G1–G5: what runs when, and how each may fail
└── checklists/requirements.md
```

### Source Code (repository root)

```text
src-milo/
├── hir.milo             # taxonomy: complete but for `Forget`. Bridge deleted at the end.
├── lower.milo           # THE WORK: lowerExpr is 4 lines today. One arm per kind.
└── codegen/
    ├── expr.milo        # 9,622 lines of AST walk. Shrinks as kinds migrate.
    ├── stmt.milo        # already HIR; holds the 15 existing Unlowered seams
    ├── emit.milo        # 2 Unlowered seams
    └── types.milo       # astTypeStr concentration (5 sites)

src/                     # THE ORACLE — read, never modified by this feature
├── hir.ts               # 120 kinds, zero Unlowered
├── lower.ts             # 1,479 lines: what lower.milo must become
└── codegen.ts           # 13,501 lines: typed-HIR consumption, arm by arm

scripts/
├── hir-ratchet.ts       # exists. The monotone counter.
└── hir-cover.ts         # NEW. kind → fixtures, generated from emit-hir --json.

tests/
├── hir-ratchet.json     # baseline: total 115
├── selfhost-manifest.txt # baseline: 637 of 658
└── fixtures/            # new fixtures for any kind with zero coverage
```

**Structure Decision**: No new source layout. The work is concentrated in
`src-milo/lower.milo` (grows) and `src-milo/codegen/expr.milo` (shrinks), against `src/lower.ts`
and `src/codegen.ts` as the read-only specification. One new script, `scripts/hir-cover.ts`.
All of it in a worktree at `../milo-hir`.

## Execution Phases

### Phase A — Make the gates trustworthy (before any migration)

Nothing is migrated until the instruments are known to work. FR-024, and the recorded history
of four silent-success failures in one session.

1. Build `scripts/hir-cover.ts` per contracts/gates.md G2. Zero fixtures for a kind exits
   non-zero rather than reporting success.
2. Inject a defect; confirm G1 and G2 each fail and name what broke.
3. Record the live baseline (ratchet 115, manifest 637/658). The denominator is moving.

**Exit**: both fast gates observed failing on a real defect.

### Phase B — Retire `placeTypeStr` (12 sites, the unsoundness)

Ordered first despite being the smaller number. Lower the kinds those 12 sites reach, so each
site's type comes from the node. Convert each retired site to an assertion before deleting it,
to prove it is genuinely dead rather than merely unreferenced.

**Exit**: `placeTypeStr` = 0 (SC-010). `markReceiverMoved` can no longer skip a move because a
derivation failed.

### Phase C — Retire `hintTy`, `astTypeStr`, `resolveAstTy` (102 sites)

The bulk. One kind per step: read `src/lower.ts` for the arm, read `src/codegen.ts` for the
consumption, delete the AST walk behind it, run G1 + G2. Prefer kinds with high fixture
coverage first — evidence per step is what makes the sweep affordable to defer to push time.

**Exit**: all four reconstruction counters at 0.

### Phase D — Delete the bridge

Remove the last `mkUnlowered` site, change `ty` to a bare `TypeKind`, delete the `Unlowered`
variant, `hexprAbort`, and every remaining seam. **If it compiles, the migration is complete** —
the type checker is the proof, not a script.

**Exit**: SC-002. `codegen/expr.milo` consumes only typed HIR.

### Phase E — Close the corpus gap

The 21 outside the manifest. Phase 0 predicts some close for free: several fail because the
backend re-derives a type and gets it wrong. Re-sweep, then attack what remains — 5 drop-glue
output mismatches, 4 parse errors, a genuine saturating-multiply sign bug, and the rest.
Each one still outside at the end gets a written classification.

**Exit**: SC-003, SC-004.

**Phase ordering note**: E is last but partially resolves itself during B–D. Re-run the sweep
at the start of E rather than planning against tonight's 637 — the number will have moved from
both ends.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| A feature branch, against "commits go directly to `main`; there are no feature branches in this repo" | A git worktree cannot check out `main` while the primary tree holds it, and the user asked for a worktree. Another session currently has uncommitted edits to `std/seal.milo` and two new fixtures in the primary tree. | Working directly in the primary tree: a 48-minute sweep cannot be trusted while another session edits the files under test — this already invalidated one full-suite run — and a prior session lost work to a concurrent `git add -A`. Mitigation: the branch is short-lived, rebased onto and merged into `main` at every green step, deleted at the end. The rule's target is long-lived divergence; merging every green step produces the history the rule wants. |
| A new gate script (`hir-cover.ts`) | FR-027 requires a fast substitute for the 48-minute sweep in the inner loop, and no subset ratchet exists: `selfhost-sweep.ts --check` explicitly refuses `--filter`. | A time-boxed random subset gives no coverage guarantee for the kind just changed, which is exactly the defect class being guarded. Running the full sweep per kind makes ~100 migration steps unaffordable. The index is generated from `emit-hir --json`, so it is not a hand-maintained list. |
