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

---

## Seam conversion, iteration 1 — what landed and what the gate caught

`genLetBinding` and `genReturnValue` now take `&HExprNode`. Corpus green
(`RATCHET OK — all 637 manifest fixtures still pass`), ratchet unchanged at 115. Pushed as
`546c12d1`.

Converting seams while every node is still `Unlowered` is behaviour-identical by
construction, which is the point: the plumbing gets proven by the corpus separately from
the first kind that flows through it. When a kind does break, the cause is the kind.

### The ratchet caught a real mistake, not a bookkeeping one

The first cut of both arms passed the surrounding hint into `genHExpr`:

```milo
v0 = genHExpr(cg, value, locs, sigs, hintTy.clone())
```

`hintTy` went 87 → 88 and the gate refused it. The fix was not to rebaseline — the code was
wrong. A lowered node carries the type the checker gave it, so consulting a hint on that
path is the exact re-derivation this feature removes. Passing `""` is more correct AND
returns the counter to 115.

Worth recording how close this came to being missed: the first check read `$?` after a
pipe, which returns `tail`'s status, and printed `exit=0` directly beneath the ratchet's
failure text. Re-run through a file, it was exit 1. That is the silent-success shape again,
in the act of verifying a gate designed to prevent it.

### Seams deliberately left aborting

| Seam | Why it stays loud |
|---|---|
| `genIf` → `constFoldBool` | Folds on the WRITTEN form, and its comment is explicit that this is required rather than an optimization: a dead arm may call a symbol that exists on no other target. A silently unfolded branch is a link error on some platform, so an abort is the better failure. |
| `genStmt`/`Match` → `genMatchAst` | Needs syntax and ownership together. A real conversion, not a wrapper. |

### Why `genAssignAst` has no shared wrapper

Seven `genOwnedArg(cg, value, …)` call sites want one HIR-dispatching helper. `genOwnedArg`'s
own parameter is named `hintTy`, so any wrapper that forwards a hint adds two to that
counter. Renaming the parameter to slip past the gate would be gaming it. The ratchet header
states there is no honest reason for a counter to rise mid-migration, so the conversion
inlines the dispatch at each site instead — which is also the idiom second-class references
force everywhere else in this codebase.

---

## Corrections to this document

Two claims recorded earlier turned out to be wrong. Both are corrected here rather than
edited away, because the mistakes are the useful part.

### The IntLit `i64` default is the language spec, not a defect

This document earlier called `if ty.len == 0 { ty = "i64" }` in `genExpr`'s `Expr.IntLit`
arm "the clearest small example of the defect this feature exists to remove". It is the
opposite. `docs/language-reference.md:136`:

> An integer literal with **no type context** defaults to `i64` … `let a = 5  // i64 (no context)`

An empty hint IS the no-type-context case, so the line implements the documented rule
exactly. The site is now annotated in place so the mistake is not repeated.

This matters beyond the one line: **an invented type and a documented default are
identical in shape**, and only the spec distinguishes them. Every "silent default" found
by pattern must be checked against the language reference before it is called a bug.

### `genArrayRepeat`'s `elemTy = "i64"` is unreachable

Counted as a hazard from a grep. Reading it shows both following branches assign `elemTy`
unconditionally (from the hint, else from the repeated value's own type), and Milo requires
the `var` be initialised. Nobody falls through to it. Annotated, not "fixed".

## The census that beat the counters

Working down the list of counter names missed a real bug. Searching for the defect's
SHAPE — "tests for empty, then assigns a concrete type" — found it:

```
expr.milo:6350  genFieldClosureCall   retTyStr = "i64"   ← found via the hintTy counter
stmt.milo:3042  genClosureCall        retTyStr = "i64"   ← found only by shape census
```

Twins, in different files, same consequence: a closure whose return type could not be
recovered gets its result READ as a pointer-sized integer, so a returned String is garbage
at every use. The counters pointed at one and never at the other.

Third time this session the same lesson landed:

| Occasion | What the counter said | What was true |
|---|---|---|
| After renaming `placeTypeStr` | 115 → 103, best result of the session | Parser stopped matching; re-derivation untouched |
| `genArrayRepeat` | a `hintTy` hazard | unreachable initialiser |
| `genClosureCall` | nothing at all | a real wrong-type read |

The counters measure mentions. They are a fine ratchet against drift and a poor map of
danger.

## Final tally for the fail-closed pass

| | |
|---|---|
| Real hazards closed | 7 |
| Miscounted as hazards (unreachable or spec-mandated) | 2 |
| Found by shape census, invisible to every counter | 1 |
| False-abort rounds, all caught by the corpus before pushing | 5 |
| Counter mentions across the four ratchet symbols | ~114 |

Roughly one real hazard per sixteen mentions. The kind-by-kind HIR migration would have
worked the 114 and found the 7 only incidentally, while the ratchet ticked down by ones
and looked like progress throughout.

---

## The site where HIR is genuinely the fix

The `IntLit` claim was retracted above (it implements the documented default). This is its
honest replacement, found by extending the shape census from "invents a type" to
"skips when it cannot tell".

`disambiguateStructLit` (`codegen/expr.milo:88`) picks among a generic struct's
monomorphizations — `Pair_i32_i32` vs `Pair_string_i32` — by matching each literal field's
value category against the candidate's field type. Its own comment states the problem:
*"which the checker already resolved, but the AST keeps the bare name."*

When `exprCategory` cannot categorise a field it returns `""` and the field's evidence is
skipped. That path is not exceptional: `exprCategory` answers for five literal kinds and
returns `""` for every ident, call and field read.

**The hazard.** If the skipped field is the one that would have excluded a candidate,
exactly one survivor remains, and the function returns the wrong monomorphization — whose
fields are then read at the wrong types. With two or more survivors it returns the bare
base name and the failure is loud downstream. The single-survivor case is the silent one.

**Why fail-closed does not apply here.** Every other can't-tell site in this pass could
abort, because the unknown case was rare and indicated a lost type. Here the unknown case
is the normal path, so an abort would fire constantly on correct programs. Strictness
cannot rescue a function whose evidence is structurally too weak.

**What does fix it.** The checker resolved this literal's type; the backend is
reconstructing it from value shapes because the AST kept the bare name. Carrying the
checker's type to codegen removes the guess rather than making the guessing cleverer.

That is the argument for the HIR migration, stated at one concrete site instead of as a
count. It is a better argument than the ratchet ever made: not "87 mentions of hintTy",
but "this function guesses, and the guess can be wrong, and no amount of strictness here
can help".

### What this changes about the remaining work

The fail-closed pass is finished — every can't-tell site that CAN reject now does. What
remains for HIR is the residue: sites where the backend must reconstruct because the
information never arrived. Those are found by asking "does this function have enough
evidence to be right?", not by counting symbols.

---

## Where the fail-closed vein runs out

A census of every codegen helper whose catch-all answers "I don't know" with a falsy value
found 20 candidates. Nearly all are honest predicates: `isFixedArrayTy` returning false for
a non-array is the right answer, not a guess. Two looked like real conflations.

### `placeRootIsOwned` — predicted hazard, disproved by probe

`Expr.IndexAccess` is absent from its match, so `v[0].field` falls to `_ => false` and
reports "not an owned root". Since NOT marking a consumed receiver means the enclosing
scope drops it again, that reads as a double free.

It isn't one. Probe:

```milo
let s = v[0].consume()   // consume takes self: Self, by value
print(s)                 // alpha
print(v[0].name)         // alpha  ← still there
```

Indexing a struct out of a container materialises a COPY, so the receiver is a temp rather
than a place, and there is no ownership decision to skip. Clean under ASan on both
compilers. `false` is the correct answer here.

(The clone-on-index is a known separate issue. It is a performance and ergonomics question,
not unsoundness.)

### Prediction scorecard

| Predicted hazard | Verdict | Disproved by |
|---|---|---|
| `placeTypeStr` conflation (8 sites) | REAL | — |
| `resolveTyStr` pass-through | REAL | — |
| `genAsCast` unresolved target | REAL | — |
| closure return type ×2 | REAL | — |
| deref pointee | REAL | — |
| empty array literal | REAL | — |
| `genArrayRepeat` default | false | reading — both branches assign |
| `IntLit` default | false | the language reference — it IS the rule |
| `placeRootIsOwned` on IndexAccess | false | a probe — the element is cloned |

**7 real, 3 false.** The last two attempts were both false, which is the signal that this
vein is worked out: what remains are predicates that are correct by construction.

Structural analysis over-predicts hazards. Every one of the three was disproved in minutes
by reading the code, the spec, or running a five-line probe — none needed the corpus. That
ordering is worth keeping: read, check the spec, probe, and only then change the compiler.
