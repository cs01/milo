<!-- doc-meta
system: frozen-pools-plan
purpose: design + plan for static stale-handle elision via freeze(), completing the consuming-conversions set; includes the canonical answer to the indices-are-ersatz-pointers objection
key-files: std/pool.milo, src/checker.ts (no changes expected), docs/residue-vs-rust.md, docs/plans/ownership-fission.md, docs/plans/seal-span.md
update-when: the FrozenPool surface, the pool-tier split, or the objection answer changes
last-verified: 2026-08-22
-->

# Frozen Pools — static stale-handle elision

**Goal.** Close the common case of residue #1 (`residue-vs-rust.md`): Rust rejects at
compile time a stored reference that outlives its referent; Milo routes the workload
through generational handles and catches staleness at runtime. For the dominant pool
shape — build, then read — that runtime check can be eliminated *by type*, with no
annotations, no prover, and no checker changes.

**Thesis — third application of the consuming move.** A handle can only go stale if
the pool can free a slot. `pool.freeze()` consumes the pool into a `FrozenPool<T>` on
which `remove`/`clear` do not exist. Every handle minted before the freeze is
therefore valid forever: `get(h)` returns `T` directly — no `Option`, no generation
check, no liveness check — and use of the old pool binding is a move error the
shipped checker already produces. Shatter deleted aliasing, seal deleted
invalidation, freeze deletes staleness; one idea, three residues.

## Prototype results (2026-08-22, userspace, 1 vCPU)

1M items, 10M lookups, identical sums:

- Generational pool (`get → Option`, slot+gen+liveness checks): **~20ms**
- Frozen pool (`get → T`, bounds check only): **~9ms** (2.2×)
- Stale handle against the mutable pool: caught, `None` — deterministic, demoted.
- `pool.items.push(2)` after `freeze(pool)`: **`error: use of moved variable 'pool'`**
  — the residue's compile-time half, produced by the existing move checker.

Microbenchmark caveats: branch-predictor-friendly access pattern; frozen `get` still
pays the bounds check; the win in real programs is dominated by the *infallibility*
(no `Option` plumbing at every call site), not the nanoseconds.

## Surface

```milo
var pool: Pool<Node> = Pool.new()
let root = pool.alloc(Node { ... })      // Handle<Node> — newtyped per element type
// ... build phase: alloc freely, remove allowed, get returns Option ...

let tree = pool.freeze()                 // consumes pool: FrozenPool<Node>
let n = tree.get(root)                   // T, infallible — staleness unrepresentable
```

## Pool tiers

| Tier | alloc | remove | `get` | staleness |
|---|---|---|---|---|
| `Pool<T>` | yes | yes | `Option<T>` (gen-checked) | runtime, demoted |
| `GrowOnlyPool<T>` | yes | no | `Option<T>` (bounds/identity only) | impossible within pool |
| `FrozenPool<T>` | no | no | `T` (bounds only) | impossible |

`GrowOnlyPool` (via `pool.sealGrowth()` or constructed directly) covers incremental
builders — symbol tables that only ever add — with the same within-pool guarantee;
`freeze` is the terminal state. Cross-pool confusion (pool A's handle in pool B)
remains what it is today: newtyped handles catch the type-level case at compile time,
container identity catches the instance-level case at runtime, deterministically.

## The index objection, answered

The standing critique of reference-free designs: *"array indices become ersatz
pointers, and with them come all the usual pathologies of manual memory
management."* This doc is the right place for the canonical answer, pathology by
pathology:

- **Use-after-free.** Raw pointer: UB, silent corruption, exploitable. Generational
  handle: generation mismatch, `None`, deterministic. The pathology is demoted, not
  denied — the demotion is the difference between a CVE and a bug report, and it is
  the claim discipline of `residue-vs-rust.md` verbatim.
- **Wild reads.** Bounds-checked on every access, all build modes. No survivor.
- **Type/container confusion.** Newtyped handles: compile error. Wrong instance:
  identity check, runtime error. No silent survivor.
- **Leaks / double-free.** No counterpart exists. The pool owns its storage and drops
  it whole; there is no per-item `free()` obligation to forget, and double-`remove`
  is an idempotent generation-checked no-op. Manual memory management's defining
  burden — one free per alloc — simply has no analogue.
- **The bookkeeping burden.** The objection's core is that index discipline is manual.
  After freeze/seal it is not discipline; it is a type transition the compiler
  enforces — misuse is a move error, not a code-review catch.
- **The honest concession.** Pools that genuinely free and reuse slots retain
  runtime-checked staleness: a logic-bug class Rust rejects statically. That is the
  irreducible residue and it stays named. But "*all* the usual pathologies" is the
  claim that fails: no *memory* pathology survives; the survivors are deterministic,
  checked, and non-exploitable, and the freeze/seal/prover tiers shrink them further.
- **The counterpoint.** Expert Rust already routes graph-shaped data through
  slotmap/petgraph/ECS indices — a layer inside which the borrow checker is silent.
  Taken seriously, the objection indicts idiomatic Rust equally. Milo begins where
  that convergence ends and hardens the pattern with types.

## Plan

- **Phase 1:** `FrozenPool<T>` + `freeze()` on the blessed pool/SlotMap module;
  destructors verified on the drop path; negative tests: use-after-freeze (compile),
  foreign handle (runtime error), OOB slot (runtime error).
- **Phase 2:** `GrowOnlyPool<T>`; `derive` support so handle newtypes are one line.
- **Phase 3:** prover integration — `milo prove` discharges `pool.contains(h)` on the
  mutable tier where flow allows, unifying with `verification-roadmap.md`; freeze
  remains the zero-effort path.

## The claim, stated correctly

Freeze does not give Milo Rust's full stale-reference rejection — free-and-reuse
pools keep their runtime checks. It gives the *build-then-read majority* of pool
users a compile-time guarantee for the price of one consuming call, and it completes
the pattern: **where Rust proves properties of references, Milo removes the
operations that could violate them, and the move checker proves the removal.**
