<!-- doc-meta
system: selfhost-endgame-decision
purpose: the precommitted rule that decides whether src-milo replaces src/ or freezes as proof, written before the census that feeds it
key-files: scripts/selfhost-rejects.ts, scripts/selfhost-stamp.ts, docs/self-hosting.md
update-when: the census runs and trips a threshold, or the endgame is decided
last-verified: 2026-08-07 (rule written; census not yet run — N unmeasured)
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

236 negative tests. 118 in the soundness manifest. The remaining 118 is the
pre-split number and **is not the denominator** — it mixes three different
backlogs. Split first:

| lane | meaning | counts toward the decision? |
|---|---|---|
| accepted silently | unsoundness — milo-self compiles a program it must reject | **yes, this is N** |
| wrong-message | the pass fired, the diagnostic is off | no — cheap, separate list |
| build-failed / over-reject | feature gap (`contractRequiresFail`, i32/i64) | no — not a checker gap at all |

**N = silent accepts only.** Every threshold below is a fraction of N, not of 118.

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
   singleton tail is 118 independent defects wearing a trenchcoat. Freeze at the
   fixpoint.
3. **Neither** → tiebreak on the census's third column, not on gut. If ≥50% of N
   sits in buckets marked `misscoped` or `uncalled` — wiring an existing pass,
   not writing a new one — → **replacement**. Otherwise → **proof-only**.

Rule 3 exists because rules 1 and 2 do not partition the space (13 buckets at
82%, or a top bucket of 15 with 55 singletons, match neither), and an unhandled
case is where the motivated reading gets back in.

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
