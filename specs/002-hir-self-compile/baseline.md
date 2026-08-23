# Measured Baseline

**Recorded**: 2026-08-23 | **Commit**: `251a87a6` | **Tree**: `../milo-hir` (worktree, own `.selfhost/` build)

## T004 — Reconstruction counters

| Counter | Count | Location |
|---|---|---|
| `astTypeStr` | 10 | `codegen/types.milo:5`, `codegen/emit.milo:3`, `codegen/expr.milo:2` |
| `resolveAstTy` | 5 | `codegen/expr.milo:3`, `codegen/stmt.milo:2` |
| `placeTypeStr` | 12 | `codegen/expr.milo:12` |
| `hintTy` | 87 | `codegen/expr.milo:65`, `codegen/stmt.milo:22` |
| `mkUnlowered` | 1 | `lower.milo:1` |
| **TOTAL** | **115** | |

Matches the spec's baseline exactly.

## T005 — Corpus

| Measure | Value |
|---|---|
| Manifest | 637 |
| Fixtures | 658 |
| Outside the manifest | 21 |

## T001 — Primary tree before-image (for SC-007)

Seven dirty entries, all pre-existing and none belonging to this feature: four modified
`examples/games/redline/*.milo`, plus untracked `a.out`, `benchmarks/shard/shard_balance`,
`m.txt`. The concurrent session's `std/seal.milo` work committed before this worktree was
created, so it is no longer in the dirty set. Stored at
`<scratchpad>/primary-before.txt`; T053 diffs against it.

## T014 — `placeTypeStr` blast radius

`placeTypeStr` (`src-milo/codegen/expr.milo:319`) handles **four** place kinds:

| Kind | Behavior on failure |
|---|---|
| `Expr.Ident` | `""` when neither a local nor a global |
| `Expr.FieldAccess` | `""` when the object's type or the field is unresolvable |
| `Expr.IndexAccess` | `""` when the container's element type is unresolvable |
| `Expr.UnaryOp` (deref) | `""` when the operand's type is unresolvable |
| `_` catch-all | **`""` unconditionally** |

The `_` arm is a second silent accept: every place expression that is not one of those four
kinds yields "no type" without any derivation being attempted, and callers cannot distinguish
that from a derivation that ran and failed.

## T015 — The twelve call sites

Three are internal recursion within `placeTypeStr` itself (`:331`, `:342`, `:358`).

The nine external consumers, **all of them ownership decisions**:

| Site | Function | What `""` causes |
|---|---|---|
| `:407` | `markReceiverMoved` | Returns early. The receiver move is never recorded, so the enclosing scope drops it again. |
| `:460` | `genOwnedArg` | Argument ownership decision skipped |
| `:480` | `genOwnedArg` | " |
| `:512` | `genOwnedArg` | " |
| `:547` | `genOwnedArg` | " |
| `:3329` | `genAsCast` | Inline-array cast path not taken |
| `:6541` | `genIndex` | Object place type unknown |
| `:8288` | `genCall` | Extern inline-array argument path not taken |
| `:8717` | `genLvalueWithHint` | Object place type unknown |

That every consumer is an ownership or memory-layout decision is what ranks these 12 sites
ahead of `hintTy`'s 87. `hintTy` is untidy; this is unsound.

---

## T010/T011 — Gate falsification, and what it proved

Both fast gates were confirmed to fail on a deliberately injected defect before either was
trusted (FR-024). The result for T011 is worth more than the checkbox.

### T010 — G1 (`hir-ratchet.ts`)

Injected a throwaway `hintTy` call into `src-milo/codegen/types.milo`.

| State | `--check` exit |
|---|---|
| Clean | 0 (`RATCHET OK`, total 115 → 115) |
| Defect present | **1** (`hintTy 87 → 89`) |
| Reverted | 0 |

### T011 — G2 (`hir-cover.ts`), and a measurement of the other three gates

Injected one character-class of defect into `genVecFindAnyAll`
(`src-milo/codegen/expr.milo:825`): initialise `find`'s result cell to the `Some` tag
instead of `None`, so `Vec.find` reports a hit on a vector that contains no match. Rebuilt
milo-self (binary stamp `3b871732` → `7679ec85`, confirming the defect was really in the
compiler under test), then ran every gate:

| Gate | Verdict on a compiler that miscompiles `Vec.find` | Time |
|---|---|---|
| **G2** `hir-cover --check --for VecFind` | **FAIL** — `vecFind: output-mismatch — line 2: want "not found" got "found: 4"` | seconds |
| G3 `selfhost-fixpoint.sh` | `FIXED POINT HOLDS — stage2 == stage3, byte-identical`, exit 0 | minutes |
| G5 `selfhost-rejects.ts --check` | `SOUNDNESS RATCHET OK — all 118 manifest entries still behave correctly`, exit 0 | minutes |

**Two of the three gates that run before every push report success on a compiler that
silently returns the wrong answer.** This is not a criticism of either: the fixpoint proves
the compiler reproduces itself, and the soundness ratchet proves it accepts and rejects the
right programs. Neither claims to run the corpus, and neither does.

This is the mechanism behind the six regressions that shipped under green gates in one
session, reproduced deliberately and measured rather than asserted. It is the reason
`contracts/gates.md` makes the corpus sweep mandatory before every push, and the reason G2
exists to make that class of defect visible in seconds rather than 48 minutes.

The defect was reverted and the binary stamp returned to `3b871732`; G2 passes clean.

## T012 — Kinds with no covering fixture

4 of 121 declared kinds are unexercised by the entire 658-fixture corpus:

| Kind | Consequence |
|---|---|
| `CFnCall` | Migrating it proves nothing |
| `RangeCheck` | " |
| `VecEnumerate` | " |
| `VecReverse` | " |

Each needs a fixture before it counts as migrated (T035). Everything else has coverage;
the four kinds Phase 3 depends on are covered by 625 (`Ident`), 179 (`FieldAccess`),
132 (`IndexAccess`) and 67 (`UnaryOp`) fixtures.

---

## Phase 3 discovery — the task list had the sequencing backwards

Attempting the first kind end to end (`IntLit`, deliberately the simplest) surfaced a
prerequisite neither the plan nor the task list accounted for. Recorded here because it
changes the shape of the remaining work.

### What was assumed

T016–T020 assumed migrating a kind is: add a `lowerExpr` arm, add a `genHExpr` arm, run
the gates. Research Finding 2 supported this — inline `Unlowered` seams make mixed trees
the supported state, so kinds can migrate in any order.

### What is actually true

Kinds can migrate in any order **once the seams accept lowered nodes**, and today most do
not. `genHExpr` already exists (`codegen/expr.milo:8784`) and `FieldAccess` already has a
typed path there, so the dispatcher pattern is proven. But the seams that reach it are
not the only ones. The statement layer calls **AST-specific functions** directly:

| Seam | Calls | Takes |
|---|---|---|
| `genStmt` / `HStmt.Let` | `genLetBinding(…, *av, …)` | `&ExprNode` |
| `genStmt` / `HStmt.Return` | `genReturnValue(…, *av, …)` | `&ExprNode` |
| `genIf` | `constFoldBool(cg, *c)` | `&ExprNode` — reads syntax, not value |
| `genAssign` | `genAssignAst(cg, *t, *v, …)` | `&ExprNode` ×2 |
| `genProgram` ×2 | global initializers | `&ExprNode` |

Each unwraps `Unlowered` to get an AST node and aborts on anything else. So lowering
`IntLit` makes `let x = 5` abort:

```
internal error: 'hit' initializer reached the untyped backend as a lowered IntLit
```

The abort is the design working correctly — it named the kind and the position rather
than miscompiling — but it means **a kind cannot be lowered until every seam that can
receive it takes a `&HExprNode`**. For `IntLit` that is essentially all of them.

### The corrected order

Seams first, then kinds. A seam can be converted independently: change its parameter to
`&HExprNode`, call `genHExpr` where it needs a value, and match `Unlowered` inline only
where it genuinely needs syntax (`constFoldBool` does — it folds on the written form, not
the evaluated one). Once a seam takes HIR, every kind flows through it for free.

Kinds are cheap **after** the seams are converted, and impossible before. The task list
reads the other way round and must be resequenced: what T016–T020 describe is the second
half of the work, not the first.

### What was kept

`genIntLitVal` (`codegen/expr.milo:8816`), extracted from the `Expr.IntLit` arm of
`genExpr`. Behaviour-neutral: the AST arm still computes its type from the hint and
delegates. It exists because the typed path will need the same ptr/float/unsigned rules,
and two copies of "what does `let b: u8 = 200` mean" is one copy too many.

Worth noting what that arm does today, since it is the clearest small example of the
defect this feature exists to remove:

```milo
var ty = hintTy.clone()
if ty.len == 0 {
    ty = "i64"
}
```

An integer literal that no one threaded a hint down to becomes `i64`, whatever the
checker decided. Not a crash, not a diagnostic — a plausible default.

### Per-kind cost, measured

`IntLit` is the simplest kind in the language: no children, no ownership, no move
semantics. It still needed edits in 4 analysis pre-scans, 1 dispatcher arm, 1 lowering
arm, and would have needed 6 seam conversions. Three pre-scans (`trailingIdentName`,
`isOwnedTempNode`, `pushIfBareIdentH`) needed nothing, because their existing defaults
already answer correctly for a literal.

Budget the remaining ~100 kinds against that, not against "two lines each".

---

## The flaky-pass guard earned its keep on the first try

Two independent full sweeps reported `arrayOfGenericElements` as newly passing. Both were
right, and adopting it would still have been wrong:

```
NOT ADOPTED — passed the sweep but not 3 confirmation run(s):
  arrayOfGenericElements (failed confirmation 1/3: run-crash)
```

The fixture passes the sweep and crashes on re-run. FR-011 exists for exactly this, and
this repo has been caught by this exact fixture before: a prior session put an aborting
`arrayOfGenericElements` into the manifest on the strength of a single passing run.

Manifest stays at **637**. The confirmation requirement is not ceremony — it is the
difference between a ratchet that records progress and one that records noise.

`--write` also prepends a stray blank line to `tests/selfhost-manifest.txt` on every run.
Harmless (the count parser skips blanks) but it makes every `--write` show a spurious
one-line diff. Reverted here; worth fixing in the script.

### Corpus status, unchanged and honest

| | |
|---|---|
| Manifest | 637 |
| Fixtures | 658 |
| Outside | 21, of which `arrayOfGenericElements` is **flaky rather than failing** — it needs a root cause, not a ratchet entry (T048) |
