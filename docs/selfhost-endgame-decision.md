<!-- doc-meta
system: selfhost-endgame-decision
purpose: the precommitted rule that decides whether src-milo replaces src/ or freezes as proof, written before the census that feeds it
key-files: scripts/selfhost-rejects.ts, scripts/selfhost-stamp.ts, docs/self-hosting.md
update-when: the census runs and trips a threshold, or the endgame is decided
last-verified: 2026-08-08 (census run: N=99, 51 buckets, top12=52%, singletons=31% — rules 1 and 2 both miss, rule 3 decides; classification column outstanding)
-->

# Self-host endgame: the decision rule

Written **before** the census ran, on purpose. A histogram read after the fact
gets narrated into whichever endgame you already wanted. This file is the
precommitment; the census either trips a threshold or it does not.

## The question

`src-milo/` is 38k LOC tracking a moving 41k LOC. Two endgames, and the middle
is the tar pit — transcribe forever, never delete `src/`, carry two compilers.

- **Replacement** — close the reject gap, HIR ratchet to 0, delete `src/`.
- **Proof-only** — the fixpoint already shipped the deliverable. Freeze
  `src-milo/` at the fixpoint, bank it, stop paying the sync tax.

## What gets measured

**255** negative tests — `tests/errors/` (236) plus `tests/runtime-errors/` (19).
118 behave correctly under milo-self, so **137** are outstanding. (The number
that circulated before this census was "236 tests, 118 outstanding"; both halves
were wrong, and they were wrong in opposite directions, which is why the ratio
looked plausible.)

That 137 is the pre-split number and **is not the denominator** — it mixes three
different backlogs. Split first:

| lane | meaning | counts toward the decision? |
|---|---|---|
| accepted silently | unsoundness — milo-self compiles a program it must reject | **yes, this is N** |
| wrong-message | the pass fired, the diagnostic is off | no — cheap, separate list |
| build-failed / over-reject | feature gap (`contractRequiresFail`, i32/i64) | no — not a checker gap at all |

**N = silent accepts only.** Every threshold below is a fraction of N, not of 137.

Measured 2026-08-08: **N = 99** (96 `accepted` + 3 `did-not-trap`), 37
`wrong-message`, 1 `build-failed`. Zero `unmeasured`. 96 + 3 + 37 + 1 = 137. ✓

Bucket key is the **`src/checker.ts` emission site** — the function in the
oracle that produces the diagnostic milo-self failed to produce. Not the error
string: the same message can come from different missing passes, and different
messages from one missing pass. That is the
`feedback_silent_success.md` class — a plausible histogram that prices nothing.

## The rule

Evaluated in order. First match wins.

0. **N ≤ 25** → **replacement**. The worry evaporates at that size regardless of
   shape; a quarter of checker work closes it.
1. **≤12 buckets cover ≥80% of N** → **replacement**. Concentrated cause means
   scheduled passes, not an open-ended transcription. Commit, schedule them,
   plan to delete `src/`.
2. **Top bucket <10 AND singletons ≥40% of N** → **proof-only**. A long
   singleton tail is N independent defects wearing a trenchcoat. Freeze at the
   fixpoint.
3. **Neither** → tiebreak on the census's third column, not on gut. If ≥50% of N
   sits in buckets marked `misscoped` or `uncalled` — wiring an existing pass,
   not writing a new one — → **replacement**. Otherwise → **proof-only**.

Rule 3 exists because rules 1 and 2 do not partition the space (13 buckets at
82%, or a top bucket of 15 with 55 singletons, match neither), and an unhandled
case is where the motivated reading gets back in.

**Outcome, 2026-08-08.** Rule 0 misses (N=99). Rule 1 misses — 51 buckets, top 12
cover 51/99 = **52%**, well short of 80%. Rule 2 misses — top bucket is 8 (<10),
but singletons are 31 buckets = **31%** of N, short of 40%. **Rule 3 decides.**
The shape landed in exactly the gap the first two arms left open, which is the
argument for having written a third arm before seeing data rather than after.

## Bucket shape (2026-08-08)

51 buckets over N=99. 83 of the 96 `accepted` emit from `src/checker.ts`; the
other 13 emit from `verifyCDecls` in `codegen.ts`/`main.ts` (8), `parser.ts` (3),
`resolver.ts` (1), `lower.ts` (1).

Bucket key is the emitting **function**, not `function:line` — `checkCValue`
emitting from four lines is one missing pass, not four. The exception is
`checkProgram` and its inline `<anonymous>` closures, where the checker top level
inlines genuinely distinct features, so there the line *is* the feature.

Largest coherent theme is not any single bucket: C-FFI attribute verification
spans `verifyCDecls` (8) + `checkCValue` (4) + `checkCLayout` (3) + `checkCSig`
(3) + two `cOpaque` fixtures = **20 of 99 in one feature area**. If rule 3 lands
on replacement, that cluster is the obvious first pass.

Attribution method, for whoever repeats this: patch the diagnostic emitter to
append a stack trace, then run the oracle on each fixture. Every diagnostic then
carries its own emitting frame. Grepping the message text back to a source line
cannot disambiguate two sites that emit the same string, and guessing from the
message is how this becomes the histogram it was designed not to be.

## Deliverable that the rule consumes

One table. Anything less does not decide anything.

| cause (`src/checker.ts` fn) | count | `src-milo/checker/*` file + fn that needs it | state |
|---|---|---|---|

`state ∈ {absent, uncalled, misscoped}`. Plus the singleton count — the number
rule 2 turns on. `project_srcmilo_varinfo_byvalue_hazard` predicts `misscoped`
dominates; if it does, that is the cheap outcome and rule 3 catches it.

## Not in scope for this decision

`DefaultValue`/`isMove` wiring through the real HIR path is execution — correct
under either endgame. It waits for the census only so it lands as one pass over
every site in `project_milo_self_drop_glue`'s checklist instead of a fourth
one-off patch. The `??` bug being the third instance of one cause is the whole
argument for waiting.
