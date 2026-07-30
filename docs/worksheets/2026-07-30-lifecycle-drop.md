# Worksheet: Task.join footgun + move-on-last-use drop pass

- **Slug / tag:** `ws/lifecycle-drop`
- **Started:** 2026-07-30
- **Status:** in-progress
- **Related:** docs/plans/tier2-3-plan.md §Drop, §Tier-3 (Task.join footgun, move-on-last-use)
- **Worktree:** `.claude/worktrees/lifecycle-drop` (branch `lifecycle-drop`)

## Goal
Two lifecycle-safety features, in order:
1. **Task.join footgun** — task freed on completion → late/double join = UAF or silent hang. Make it safe (register-at-spawn or hard compile error on late/double join).
2. **move-on-last-use / block-scope drop** — one last-use dataflow pass, two consumers: (a) drops fire at end of innermost owning block, (b) `body = s` moves at last use. Static per-branch move tracking.

## Plan
### F1 Task.join (DONE, verifying) — pure `std/runtime.milo`
Refcounted done-cell owned by the Task handle (not the reaped struct):
- `struct Task { _ptr, _cell }`; `taskCellNew` = malloc(16) [0]=done [8]=rc(init 2).
- spawn: alloc cell, store in tJoinCell + handle.
- join: read `self._cell`; done→return (late/double safe); else register tJoiner+park (green) / spin (main). Never reads freed struct on late path.
- reapTask: set done=1 then `taskCellDecref`. `impl Drop for Task` decrefs. Cell freed at rc 0.
- Non-atomic rc OK (Task not Send). Removed per-join malloc(8).

### F2 block-scope / last-use drop dataflow pass (NEXT)
One last-use liveness pass, two consumers: block-scope drop placement + move-on-last-use. Risky (decides where frees go) → conservative, heavily tested. Design in progress.

## F2 progress (2026-07-30, branch block-scope-drop)
F1 merged to main + CI green (CI/Release/Deploy all pass). New branch for F2.
- Added `emitScopeDrops(lines, start)` in codegen (mirrors match-arm drop, generalized).
- Wired: genWhile (iteration-end), genIf then/else, genForRange, genForEach (×4 variants), genForIterator. Match arms already did it. SKIPPED UnsafeBlock (unclear if it scopes locals — low value, avoids risk) and IfExpr/MatchExpr (result moved out; keep fn-epilogue drop = current safe behavior).
- Additive + guarded: counts preserved, only drop *program point* moves earlier. blockScopeDrop.milo fixture pins `-bd--|end` (t drops at if-block end). ASAN-clean across drop-heavy fixtures + battle-test. drop/move/loop/for/match subset 82/82. Full suite running.
- Also spotted (user): `unsafe\n\nimpl` split form in std (sync×10, runtime×2) — cosmetic; fmt preserves it instead of normalizing. Plan: normalize source to compact `unsafe impl`.

## Current state
**F1 code complete + verifying full suite.** Making Task non-Copy (via impl Drop) surfaced one fixture relying on Task being Copy (asyncCallOrdering `taskPtr(t: Task)` → moved `child`); fixed to borrow `&Task` — this is correct: a Copy Task would break the refcount. Regen'd docs/std/runtime.md. Added battleConcurrency.milo (8 OS threads, atomic+CAS+channel, 3 conservation invariants agree, ASAN-clean). F2 not started.

## Decisions (append)
- **Task must be non-Copy.** A Copy handle wouldn't incref the shared cell → double-decref/UAF. `impl Drop` enforces non-Copy. Fallout: by-value `Task` params now move; borrow instead (fixed asyncCallOrdering).
- **F2 = block-scope drop, additive guarded (match-arm pattern), NOT a full liveness pass.** Key finding: locals are lexically scoped for *access*, so dropping at innermost-block exit is sound by construction (a value can't be named after its block; moves zero the source). No flow-sensitive liveness needed for the drop-timing consumer. Current model is already leak-free + memory-safe (redecl-overwrite-drop + alive flag), so F2 is a *timing refinement*, not a safety fix.
- **move-on-last-use DEFERRED** with rationale: it needs true flow-sensitive last-use (mid-block move promotion), is separable from block-scope drop (which needs only scope-containment), and delivers less clear value. Documented as the tail; not shipping half a liveness pass.

## Log
- 2026-07-30 — worktree + worksheet created; two Explore agents mapped Task.join lifecycle + Drop/move dataflow.
- 2026-07-30 — F1 implemented in std/runtime.milo (refcounted handle-owned done-cell). taskJoinLate.milo fixture added. Targeted concurrency+drop+move subset 65/65 pass; late/double/green join + promise/waitgroup ASAN-clean.
- 2026-07-30 — full suite surfaced 2 fails: stale runtime.md (regen'd) + asyncCallOrdering (Task now non-Copy → borrow fix). Both resolved. battleConcurrency.milo added (multicore stress, ASAN-clean, deterministic). Re-running full suite before committing F1.

## Decisions
- Do Task.join first (independent, no design risk per plan); block-scope drop pass second (the real dataflow work).

## Blockers / open questions
-

## Verification
- [ ] targeted tests:
- [ ] ran the app / fixture:
- [ ] full `bun test`:
- [ ] agent review:
- [ ] docs updated (last-verified bumped):
