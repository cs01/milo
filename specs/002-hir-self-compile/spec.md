# Feature Specification: Typed HIR Through the Expression Layer, Self-Compiling in a Worktree

**Feature Branch**: `002-hir-self-compile`

**Created**: 2026-08-23

**Status**: Draft

**Input**: User description: "get the hir working and self compile working in a work tree"

## Context: What "Working" Means Here

The self-hosted compiler (`src-milo/`) already has a typed HIR and already
self-compiles. Neither is the problem. The problem is that the HIR stops at the
statement boundary, and the fixture corpus stops 21 short of the TypeScript
compiler's.

Measured on `cc045ef2`, 2026-08-23:

| Layer | State |
|---|---|
| Statements | Lowered to `HStmt`; `codegen/stmt.milo` walks HIR |
| Expressions | **Not lowered.** Every expression enters codegen as `HExpr.Unlowered(astNode)` |
| `codegen/expr.milo` | 9,622 lines walking the raw AST, re-deriving types the checker already computed |
| Self-compile fixpoint | Holds. stage2 == stage3 byte-identical |
| Fixture corpus | 637 of 658 in the manifest; 21 outside it |

The HIR ratchet (`bun scripts/hir-ratchet.ts`) counts the symbols that exist only
because the backend must reconstruct frontend knowledge. It reads 115:

| Counter | Count | What it means |
|---|---|---|
| `hintTy` | 87 | An expected type threaded *down* the tree because nodes cannot carry their own |
| `placeTypeStr` | 12 | Re-derives a place's type; returns `""` on failure, which callers read as "skip the ownership decision" |
| `astTypeStr` | 10 | Re-derives a type string from syntax |
| `resolveAstTy` | 5 | Resolves an AST type to a backend type string |
| `mkUnlowered` | 1 | The single sanctioned escape hatch, wrapping *every* expression |

That `mkUnlowered: 1` is not "nearly done". It is one catch-all bridge carrying
the entire expression language across an otherwise-typed seam.

`placeTypeStr` returning `""` is the reason this matters beyond tidiness. A
failed type derivation is indistinguishable from a decision to skip, so a
missing ownership decision looks exactly like a deliberate one. This is the
silent-accept defect class, structurally embedded in the backend.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The backend stops guessing at types (Priority: P1)

A compiler developer changes how a value is typed in the checker. Today the
backend re-derives that type from syntax, so the change either silently fails to
reach codegen or reaches it as `""` and disables an ownership decision. After
this work, the type travels on the node, and a backend path that needs a type it
does not have aborts naming the node kind rather than defaulting.

**Why this priority**: This is the whole point. Every other benefit follows from
the expression layer carrying its own types. It also removes the mechanism
behind the silent-accept class, which is what the endgame verdict reads.

**Independent Test**: Run `bun scripts/hir-ratchet.ts`. Every counter is
monotone-decreasing and the total falls below its baseline of 115. No counter
may rise; a raise requires an explicit flag and a written reason.

**Acceptance Scenarios**:

1. **Given** an expression kind that has been migrated, **When** codegen handles it, **Then** it reads the type from the node rather than calling `hintTy`, `placeTypeStr`, `astTypeStr`, or `resolveAstTy`.
2. **Given** a codegen path that meets a node with no type where it requires one, **When** it runs, **Then** it aborts naming the node kind, and does not substitute a default.
3. **Given** the migration is complete, **When** the ratchet runs, **Then** `mkUnlowered` reads 0 and no `HExpr.Unlowered` arm remains in codegen.

---

### User Story 2 - The self-hosted compiler compiles the whole corpus (Priority: P1)

A compiler developer wants to know whether the self-hosted compiler is at parity
with the TypeScript one. Today the honest answer is "637 of 658, and the 21 are
a grab bag". After this work the gap is either closed or each remaining item has
a named reason.

**Why this priority**: Equal to P1 above because the two interlock. Several of
the 21 fail precisely because the backend re-derives a type and gets it wrong,
so migrating the expression layer is expected to close some of them for free.

**Independent Test**: `bun scripts/selfhost-sweep.ts --check` passes with a
manifest larger than 637, and every fixture still outside the manifest has a
written classification.

**Acceptance Scenarios**:

1. **Given** the full fixture corpus, **When** the sweep runs, **Then** no manifest fixture regresses.
2. **Given** a fixture outside the manifest, **When** the work concludes, **Then** it is either inside the manifest or recorded with the reason it cannot be.
3. **Given** a fixture that produces wrong output rather than failing to build, **When** it is investigated, **Then** the underlying compiler defect is fixed rather than the fixture being excluded.

---

### User Story 3 - The work happens without disturbing the main tree (Priority: P1)

Another session is actively editing `std/seal.milo` and adding fixtures in the
primary working tree. This work must not collide with it, and its own long
verification runs must not be invalidated by someone else's edit mid-run.

**Why this priority**: Same rank because it is a precondition, not a nicety. A
prior session lost work to a concurrent `git add -A`, and a full-suite run was
already invalidated once by an edit landing mid-run. The isolation is what makes
the other two stories' evidence trustworthy.

**Independent Test**: The primary tree's uncommitted changes are byte-identical
before and after the work. The feature's commits touch no file another session
has open.

**Acceptance Scenarios**:

1. **Given** work is underway, **When** the primary tree is inspected, **Then** its uncommitted changes are untouched.
2. **Given** a verification run is in progress, **When** it completes, **Then** no file it compiled was modified during the run.
3. **Given** the work is ready to land, **When** it merges, **Then** it merges as a sequence of individually-green commits rather than one large branch.

---

### User Story 4 - A regression cannot reach the main branch unseen (Priority: P2)

A change to the compiler backend that breaks a class of programs is caught
before it is pushed, not several commits later.

**Why this priority**: Lower only because it guards the work rather than
performing it. It earns its place from evidence: six regressions shipped under
green gates in one session because the fixpoint and soundness ratchets do not
run the fixture corpus, and only the 48-minute sweep sees that class.

**Independent Test**: Introduce a deliberate defect in a migrated expression
kind. The gate that is actually run before pushing must fail.

**Acceptance Scenarios**:

1. **Given** a defect affecting a class of expressions, **When** the pre-push gate runs, **Then** it fails and names an affected fixture.
2. **Given** a gate reports success, **When** its output is read, **Then** it states how many inputs it checked, so a gate that silently checked zero is visible as such.
3. **Given** the full sweep is too slow for the inner loop, **When** a faster subset gate is used instead, **Then** that subset has been shown to catch a defect the developer deliberately introduced.

---

### Edge Cases

- An expression kind appears in no fixture. Migrating it produces no evidence it works. It must be exercised by a new fixture before it counts as migrated, or recorded as unexercised.
- A migrated expression changes emitted output in a way that is correct but not byte-identical. The fixpoint compares stage2 to stage3, not to a stored artifact, so it stays green; the sweep compares program output and is the check that matters.
- The type the checker recorded and the type the backend re-derived disagree, and the backend's wrong answer is what current output depends on. Migration then surfaces a latent defect as a new failure. It is a defect, not a regression, and is fixed rather than papered over.
- An expression kind is reachable only from within another unmigrated kind, so migrating it alone changes nothing observable.
- The two fixtures another session added (`sealShared`, `shardMapWith`) land in the corpus mid-flight, moving the denominator.
- A long verification run is killed by the memory guard. Empty output with exit 137 means killed, not miscompiled, and must not be recorded as a failure.

## Requirements *(mandatory)*

### Functional Requirements

#### The expression seam

- **FR-001**: Expressions MUST reach the backend carrying the type the frontend computed, rather than the backend re-deriving it from syntax.
- **FR-002**: A backend path that requires a type and finds none MUST abort naming the node kind. It MUST NOT substitute a default, an empty string, or a guess.
- **FR-003**: The count of backend sites that reconstruct frontend knowledge MUST decrease monotonically. Any increase MUST fail the gate.
- **FR-004**: Raising any counter MUST require an explicit flag and a recorded written reason.
- **FR-005**: The escape hatch MUST carry no type field, so that no backend path can read a type from a node that has none.
- **FR-006**: Every construction site of the escape hatch MUST be counted by the gate.
- **FR-007**: The migration MUST proceed one expression kind at a time, with the corpus green at each step, rather than as a single cutover.
- **FR-008**: At completion, no backend path may consume an unlowered expression.

#### Corpus parity

- **FR-009**: No fixture the manifest claims may regress.
- **FR-010**: A fixture that builds but produces wrong output MUST be treated as a compiler defect, not as an unsupported fixture.
- **FR-011**: A newly-passing fixture MUST pass repeatedly before the manifest claims it, so that a flaky pass cannot enter the baseline.
- **FR-012**: Each fixture remaining outside the manifest at the end MUST have a recorded classification naming what blocks it.
- **FR-013**: A fixture MUST NOT be removed, weakened, or excluded to make a gate pass.

#### Self-compile integrity

- **FR-014**: The compiler MUST reproduce itself: compiling the compiler with itself twice MUST yield byte-identical output.
- **FR-015**: The fixpoint MUST be verified before any change to the self-hosted compiler is pushed.
- **FR-016**: The set of programs the self-hosted compiler wrongly accepts MUST NOT grow.
- **FR-017**: The set of valid programs the self-hosted compiler wrongly rejects MUST NOT grow.

#### Isolation

- **FR-018**: All work MUST occur in a working tree separate from the primary one.
- **FR-019**: The isolated tree MUST use its own compiler build, not the primary tree's.
- **FR-020**: No operation may stage changes indiscriminately across the tree; every commit MUST name its files.
- **FR-021**: The primary tree's uncommitted changes MUST be unmodified throughout.
- **FR-022**: Work MUST land as a sequence of individually-verified commits.

#### Gate honesty

- **FR-023**: Every gate MUST report how many inputs it checked, so that a gate which checked none is distinguishable from one that passed.
- **FR-024**: A gate MUST be confirmed to fail on a deliberately introduced defect before its passing result is trusted.
- **FR-025**: A gate that detects failure by matching program output MUST also check exit status, since a process killed or aborted may produce no matching text.
- **FR-026**: Before pushing, the gate that covers the class of change being made MUST be run, not merely the fastest available gate.
- **FR-027**: If a faster gate substitutes for the full corpus sweep in the inner loop, it MUST first be shown to catch a defect the full sweep catches.

### Key Entities

- **Typed expression node**: An expression carrying the type the frontend determined, so the backend consumes rather than reconstructs it.
- **Escape hatch node**: The sanctioned bridge for a not-yet-migrated expression. Deliberately carries no type. Counted, monotone-decreasing, target zero.
- **Reconstruction counter**: A count of backend sites that rebuild frontend knowledge. Five counters, total 115 at baseline.
- **Manifest**: The set of fixtures the self-hosted compiler is claimed to compile and run correctly. 637 of 658 at baseline. Grows only after repeated passes.
- **Fixpoint**: The property that the compiler compiling itself twice yields identical output. The strongest evidence that self-compilation is genuine.
- **Isolated tree**: A separate working tree with its own compiler build, so that long verification runs and a concurrent session cannot invalidate each other.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The reconstruction total falls from 115 toward 0, with no counter ever rising.
- **SC-002**: The escape-hatch count reaches 0, and no backend path consumes an unlowered expression.
- **SC-003**: The manifest exceeds 637 of 658, with zero regressions at every step.
- **SC-004**: Every fixture outside the manifest at completion carries a written classification.
- **SC-005**: The compiler reproduces itself byte-identically, verified before each push.
- **SC-006**: Neither the wrongly-accepted nor the wrongly-rejected program set grows.
- **SC-007**: The primary tree's uncommitted changes are byte-identical before and after.
- **SC-008**: Each gate relied on has been observed to fail on a deliberately introduced defect.
- **SC-009**: Every gate reports its input count, and no gate reports success over zero inputs.
- **SC-010**: The number of type derivations that can fail silently, returning a value callers read as "skip", falls from 12 to 0.

## Assumptions

- The existing HIR node set is adequate for the expression language. If a kind has no representation, adding one is in scope; redesigning the HIR is not.
- The fixpoint and the wrongly-accepted/wrongly-rejected ratchets are correct as written and are not themselves under revision here.
- The full corpus sweep takes roughly 48 minutes and is the only gate that sees the "class of programs broken" defect. A faster substitute may be built, but only after it is shown to catch what the sweep catches.
- The concurrent session's work on `std/seal.milo` and its two new fixtures will land independently. Their arrival changes the denominator and is expected.
- Closing every one of the 21 may not be achievable. A recorded reason is an acceptable outcome for an individual fixture; silence is not.
- The TypeScript compiler in `src/` remains the reference for correct behavior throughout. Where the two disagree, `src/` is right unless shown otherwise.
- This work does not gate any change to `src/`. The reverse dependency stands: changes here are gated by the self-host suite.

## Out of Scope

- Redesigning the HIR representation.
- Command-line parity between the two compilers beyond what the fixture corpus exercises.
- Performance of either compiler. Neither speed nor emitted-code size is a goal, though neither may regress past its existing tolerance.
- Retiring the TypeScript compiler. Whether the self-hosted compiler replaces it or stands as proof is decided by a separate precommitted rule, which reads the wrongly-accepted census, not the fixture count.
- The seven examples blocked by package-level name collision. Related, separately scoped.
