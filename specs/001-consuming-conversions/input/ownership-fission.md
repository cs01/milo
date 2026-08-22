<!-- doc-meta
system: ownership-fission-plan
purpose: design + staged plan for safe, zero-copy shared-memory parallelism without first-class references
key-files: std/shard.milo (new), std/runtime.milo, std/sync.milo, src/checker.ts, docs/residue-vs-rust.md
update-when: the Shard surface, the weld invariants, or the scheduler track changes
last-verified: 2026-08-22
-->

# Ownership Fission — safe multicore parallelism with second-class refs

**Goal.** Delete residue #2 (`residue-vs-rust.md`) without touching the axiom. Today a
parallel in-place transform over 20M doubles pays ~130ms and +156MB in mandatory chunk
copies against a 20ms sequential job — the move-only boundary converts a 15ms parallel
opportunity into a 130ms obligation (measured 2026-08-22, `Promise.blocking` ×4 vs C
pthreads on the same buffer: Milo par 148ms/314MB, C par 26ms/158MB, both vs seq
20ms/158MB). The fix must not introduce first-class references, lifetimes, or
user-visible annotations.

**Thesis.** Rust proves *disjoint borrows into one allocation*. Milo doesn't need to,
because it has a stronger tool available: **move semantics can do the entire aliasing
proof if ownership itself is made divisible.** Fracture a `Vec<T>`'s ownership into
disjoint owned windows, hand the windows to threads as ordinary moved values, and
reassemble the original allocation afterwards. No reference ever crosses a thread. No
alias ever exists at the language level. The checker needs zero new rules for the core
mechanism.

We call the primitive **shatter/weld**.

## Considered and rejected

- **First-class refs + lifetimes** — violates the axiom; becomes Rust with worse tooling.
- **Pony-style reference capabilities (`iso`/`val`/`ref`)** — sound, but is exactly the
  per-type annotation vocabulary design principle #2 forbids, and it colors every API.
- **Fractional permissions / GhostCell-style branding** — both require first-class
  references (or invariant lifetime tokens) to carry the permission. Nothing to attach
  them to here.
- **"Just add `Mutex` back"** — a lock serializes the hot path; it answers shared
  *state*, not data *parallelism*, and the surface was deleted on purpose.

Prior art we are actually building on: Legion/Regent's disjoint region partitions
(shatter is an owned-value rendition of an index-space partition), Rust's
`split_at_mut` (the borrowed rendition of the same disjointness fact), and seastar's
shard-per-core runtime (phase 3). Closest relatives found 2026-08-22 and to be cited
in anything public: Rust's `vecshard` crate (O(1) split of a Vec into refcounted
owned shards, recombinable — shatter/weld minus the completeness check, and it even
uses the word "shard") and `concurrent-slice` (owned chunks to threads, original
recovered via guard). Those exist as crates *beside* a borrow checker; the claim here
is narrower and different — that in a second-class-references language this mechanism
*replaces* one. The generational-handle machinery in `std/arena` already establishes
the house pattern for "runtime-checked identity, deterministic failure."

## Phase 1 — `Shard<T>`: shatter/weld (std only, no language change)

### Surface

```milo
from "std/shard" import { Shard, weld }

var a: Vec<f64> = Vec.filled(n, 1.0)

let shards = a.shatter(4)          // consumes a: Vec<Shard<f64>>, O(1), zero copies
// `a` is moved — the checker already rejects any further use. Nothing aliases.

var ps: Vec<Promise<Shard<f64>>> = Vec.new()
for s in shards {
    ps.push(Promise<Shard<f64>>.blocking(move (): Shard<f64> => {
        var c = s
        var i: i64 = 0
        while i < c.len { c[i] = c[i] * 1.0000001 + 0.5; i = i + 1 }
        return c
    }))
}
let done = Promise.all(ps).await()!
let a2 = weld(done)!               // Vec<f64> — the original allocation, O(workers)
```

### Semantics

- `shatter(self: Vec<T>, n: i64): Vec<Shard<T>>` **consumes** the Vec. This is the
  entire aliasing story: after the move there is no binding through which the buffer
  can be reached except the shards, and the shards are disjoint by construction.
- `Shard<T>` is an owned value: `{ ctrl: *ShardCtrl, base: *T, len: i64 }`. Indexed
  read/write, bounds-checked against its own `len`, `.swap(i,j)`, iteration. **No
  push/pop/realloc** — a shard is a fixed-size window; buffer identity must survive
  for weld. Same per-access cost as `Vec` (base + bounds check).
- `ShardCtrl` is a side control block malloc'd at shatter (buffer ptr, len, cap,
  shatter identity, live-shard count, welded flag). **No `Vec` ABI change.**
- `weld(shards: Vec<Shard<T>>): Result<Vec<T>, ShardError>` runtime-checks: every
  shard carries the same shatter identity, the count matches, no window is missing.
  Success returns the original `Vec` (pointer/len/cap out of the control block) and
  frees the control block. Failure is a deterministic error, never UB — the claim
  discipline from `residue-vs-rust.md` verbatim: memory-unsafety demoted to a logic
  error.
- **Drop path:** shards dropped instead of welded decrement the live count; the last
  drop frees the buffer (running `T` destructors for its window first; each shard
  drops exactly its own range). No leak, no double-free, welded-then-dropped shards
  impossible (weld consumes the Vec of shards).
- **Send:** `Shard<T>` is `Send` iff `T: Send` — one `unsafe impl` in `std/shard.milo`
  with the safety comment: windows are pairwise disjoint, the source binding is dead
  by move, the control block is touched only under atomics. This is the entire
  unsafe seam: ~200 lines, one file, auditable in a sitting.

### Checker deltas: none required

Single ownership of each shard: existing move checker. Can't touch `a` after
shatter: existing move checker. Can't capture a shard in two closures: existing move
checker. That is the point of the design — the novel work is a *data structure*, and
the type system it needs is the one already shipped.

Optional hardening (cheap, later): teach 2b's invalidation tracking that `weld`
consumes its argument vector's elements so a stale `Vec<Shard<T>>` binding reads as
moved-from; today the runtime identity check already catches misuse deterministically.

### Acceptance

- The 2026-08-22 benchmark rewritten on shards: **par time within 1.3× of C pthreads,
  peak RSS within 5% of sequential** (copy tax gone by construction — measure, don't
  assume).
- Negative tests: weld with a missing shard, weld mixing two shatters, index past
  shard len, use of source Vec after shatter (compile error), shard captured twice
  (compile error).
- ASan-clean under `--sanitize` for: weld path, all-dropped path, mixed
  welded/foreign error path, `T` with destructors.

## Phase 2 — ergonomics + the thread pool

- `parallelMap(v, workers, fn)` / `parallelFor` in std: shatter → pool → weld, so the
  90% case is one call. Reductions fall out for free: workers return owned partials,
  `Promise.all` collects, fold on the caller — no shared accumulator ever needed.
- **Bag-of-shards load balancing:** shatter into ~8× cores windows, push into a
  `Channel<Shard<T>>`, workers loop recv→transform→send to a results channel, weld at
  the end. This is work-stealing's effect (dynamic balance under skew) with pure
  moves — no shared deque, no stealing protocol, no new safety obligations.
- **Thread pool for `Promise.blocking`** (prereq, independently owed): the 659ms
  first-run outlier in the benchmark is thread-spawn + cold pages in the wild. Pool
  cap ~ core count, overflow spawns. This was already deferred in
  `concurrency-simplification.md`; shards make it load-bearing.

## Phase 3 — shard-per-core runtime (the I/O half of multicore)

Fission fixes data parallelism; the single-threaded scheduler still caps I/O at one
core. Do not make the green scheduler multi-threaded — that would force Send checks
onto every `Task.spawn` closure and import the work-stealing runtime complexity the
language exists to avoid. Instead, seastar's answer, which is also Milo's shape:

- N schedulers, one pinned per core. A task lives its whole life on the scheduler
  that spawned it — green closures stay un-Send-checked, exactly as today.
- Cross-shard communication is `Channel` send, which is already cross-thread-safe and
  already Send-checked. No new rules; the existing boundary is simply reused N ways.
- Servers scale via per-shard accept (`SO_REUSEPORT`) — the process model's
  throughput without the process model's ops burden, and in-memory state that must
  span shards is either sharded by key (the natural design) or owned by one shard and
  reached by message.

## Phase 4 — research track: scoped borrows across the join (zero runtime checks)

Shatter/weld pays O(workers) runtime checks and a control-block allocation. There is
a strictly static version worth prototyping: a structured `parallel`-scope primitive
whose worker closures receive `&var [T]` **as parameters**. Second-class refs are
*already* confined to a call scope — and a fork-join scope is a call scope. The one
new rule: a reference parameter may cross a thread boundary only into a closure whose
thread provably joins before the primitive returns. Disjointness comes from the same
trusted partitioner; extent comes from the join; escape is impossible because
second-class refs can't be stored — the existing restriction *is* the lifetime
system. This is the "second-class values give you scoped capabilities for free"
observation (Osvald et al.) applied to parallelism. Prototype only after Phase 1
ships and real programs show the control-block overhead mattering; the honest bet is
that they won't.

## Honest residue that remains

- **True 2D tiles** need strided shards (`base, rowLen, rows, stride`) — disjointness
  is still by construction, planned as `Grid<T>.shatterTiles`; row-block shatter
  covers image filters on day one.
- **Stencils with halos**: overlapping a neighbor's write window is a race no
  ownership scheme fixes; the answer is double-buffering (read shatterShared of the
  front buffer + write shatter of the back), which the model expresses cleanly.
  `shatterShared` (read-only, clonable shards, refcounted weld) is the small
  follow-on that enables it.
- **Long-lived shared mutable structure** across threads (the old Mutex hole) is
  still answered by channels/atomics, unchanged. Fission is for divisible data, not
  shared state — say so in the docs before users discover it.

## The claim, stated correctly

Not "Milo now checks what Rust checks." It is: **where Rust proves disjoint borrows,
Milo makes ownership itself disjoint** — the same workloads run zero-copy and
in-place, the aliasing proof is the move checker that already exists, and the two
runtime checks that remain (weld completeness, shard identity) fail deterministically
instead of unsafely. The axiom survives: nothing aliases in, nothing escapes out —
ownership just learned to split and recombine.
