# Contract: Gates

Every gate below MUST report how many inputs it checked (FR-023) and MUST have been observed
to fail on a deliberately injected defect before its passing result is trusted (FR-024).

## G1 — HIR ratchet (fast, every step)

```
bun scripts/hir-ratchet.ts --check
```

- **Passes** when no counter exceeds its baseline.
- **Fails** when any counter rises.
- **Reports** all five counters and the total.
- **Rebaseline**: `--write` lowers; raising additionally requires `--allow-raise --reason "..."`.

## G2 — Coverage gate (fast, every step) — TO BUILD

```
bun scripts/hir-cover.ts                      # regenerate kind → fixtures index
bun scripts/hir-cover.ts --for <Kind>...      # list fixtures covering these kinds
bun scripts/hir-cover.ts --check --for <Kind>...   # run them; exit 1 on any failure
```

- **Input**: `milo emit-hir --json` over `tests/fixtures/`. Generated, never hand-maintained.
- **Reports**: the number of fixtures run. **A run over zero fixtures MUST exit non-zero**, not
  report success (FR-023, and the recorded silent-success defect class).
- **A kind with zero covering fixtures** is reported as unexercised. Migrating it proves nothing
  until a fixture exists.
- **Trust precondition**: before this gate substitutes for G4 in the inner loop, it MUST be shown
  to catch a defect G4 catches (FR-027).

## G3 — Fixpoint (before every push touching `src-milo/`)

```
sh scripts/selfhost.sh && sh scripts/selfhost-fixpoint.sh
```

Asserts stage2 == stage3 byte-identical. **Does not run the fixture corpus** — it stayed green
through six shipped regressions. It proves self-compilation, not correctness.

## G4 — Corpus sweep (before every push; ~48 min)

```
bun scripts/selfhost-sweep.ts --check
```

The **only** gate that sees "a class of programs is broken". `--check` ratchets the whole
manifest and cannot be combined with `--filter`. Run serially
(`MILO_SWEEP_CONCURRENCY=1`) for ratchet runs: milo-self is nondeterministic under parallel
load and a single parallel verdict is not trustworthy.

## G5 — Soundness ratchets (before every push touching `src-milo/`)

```
bun scripts/selfhost-rejects.ts --check
```

Neither the wrongly-accepted nor the wrongly-rejected set may grow.

## Gate selection rule

| Change | Gates |
|---|---|
| One expression kind migrated | G1 + G2 |
| Ready to push | G1 + G2 + G3 + G4 + G5 |

G4 is not optional before a push. It is the gate that caught the six regressions G3 and G5 missed.

## Interpreting a failure

Empty output with **exit 137** is a memory-guard kill, not a miscompile. It MUST NOT be recorded
as a fixture failure. Re-run under `bun scripts/guard.ts` before concluding anything.
