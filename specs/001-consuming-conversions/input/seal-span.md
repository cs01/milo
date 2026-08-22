<!-- doc-meta
system: seal-span-plan
purpose: design + staged plan for stored zero-copy (residue #3) and static stale-handle elision (residue #1 partial) via consuming type conversions
key-files: std/seal.milo (new), std/slotmap or pool module, src/checker.ts (no changes expected), docs/residue-vs-rust.md, docs/plans/ownership-fission.md
update-when: the Sealed/Span surface, the unseal invariants, or the frozen-pool story changes
last-verified: 2026-08-22
-->

# Seal/Span — stored zero-copy without stored references

**Goal.** Delete the common case of residue #3 (`residue-vs-rust.md`): borrowed ASTs,
zero-copy deserializers, structs retaining views into an input buffer. Today the answer
is "offset pairs into an owned buffer," carried by convention — nothing stops the buffer
from mutating or reallocating under the offsets, so the pattern is only as safe as the
programmer's discipline. The fix must not introduce first-class references, lifetimes,
or annotations.

**Thesis — same move as ownership fission.** A stored view is dangerous for exactly one
reason: the buffer can change while the view lives. Rust prevents that by proving the
borrow. Milo can prevent it by **consuming the buffer into a type on which mutation
does not exist.** `buf.seal()` moves a `Vec<T>` into a `Sealed<T>` — immutable by
construction, not by check. Against an immutable buffer, an offset pair can never be
invalidated, so the *invalidation* half of Rust's stored-borrow guarantee holds
statically, by type, with zero runtime checks. What offsets lose against Rust —
branding, "this span belongs to *that* buffer" — degrades to a bounds-checked
deterministic logic bug: the demotion discipline, verbatim.

This is the fission insight generalized: **a consuming move into a restricted type is
Milo's substitute for a borrow.** Fission removed aliasing by making ownership
divisible; sealing removes invalidation by making ownership immutable. Both are std
data structures; both need zero checker changes; move semantics is the proof.

## Considered and rejected

- **Branded spans (GhostCell-style)** — branding needs an invariant lifetime or a
  first-class token to tie span to buffer at compile time. No such carrier exists
  under the axiom; the runtime bounds check plus optional debug tagging is the honest
  substitute.
- **Storable second-class refs with escape analysis** — "second-class but sometimes
  storable" is first-class refs with extra steps; the axiom dies quietly.
- **Convention only (status quo)** — offsets already work; the entire point is that
  nothing *enforces* the buffer's stability. `residue-vs-rust.md` calls this the
  stored-borrow case and concedes it. Enforcement is what's being added.

Prior art built on: Rust's `Bytes`/`Arc<[u8]>` (shared immutable buffers as the
zero-copy substrate), Cap'n Proto / flatbuffers (offset-based views over frozen
regions), and the repo's own arena identity checks (runtime-checked identity,
deterministic failure). Closest relative, found 2026-08-22 and to be cited in
anything public: **Verona's `freeze`** — consuming an isolated region pointer and
returning an immutable pointer to the same graph — which is this mechanism expressed
through region types; Vale's immutable region borrowing is the same insight expressed
through its regions apparatus. The claim here is not the mechanism but the setting:
reaching it with no region types, no lifetimes, and no new checker rules — a moved
value and a type with no mutating methods.

## Phase 1 — `Sealed<T>` + `Span` (std only, no language change)

### Surface

```milo
from "std/seal" import { Sealed, Span }

var buf: Vec<u8> = readFile("input.json")!
let src = buf.seal()              // consumes buf: Sealed<u8>, O(1), zero copies
// `buf` is moved — mutation is not rejected by a check; it does not exist.

struct Token {
    kind: TokenKind,
    span: Span,                   // { start: i64, len: i64 } — plain data, Copy
}

var tokens: Vec<Token> = lex(src)         // spans stored freely: structs, Vecs, maps
let name = src.text(tokens[0].span)       // &string — transient second-class view
let owned = src.copyOut(tokens[0].span)   // string — only when ownership is wanted

let buf2 = src.unseal()!          // Vec<u8> back — only if no other owners live
```

### Semantics

- `seal(self: Vec<T>): Sealed<T>` **consumes** the Vec. `Sealed<T>` exposes `len`,
  read-only indexing, `view(span): &[T]` / `text(span): &string` (transient,
  bounds-checked, second-class — the existing view machinery), `copyOut(span)`, and
  `clone()`. **No mutating API exists on the type.** Nothing to check; nothing to
  invalidate.
- `Sealed<T>` is a refcounted shared owner (atomic count in a small control block, as
  `Channel` already does). Immutable + refcounted ⇒ safely `Send` **and** `Sync` when
  `T` is — many tasks, and OS threads, can hold and read the same sealed buffer.
  This is what makes it a real zero-copy substrate rather than a single-owner trick.
- `Span` is `{ start: i64, len: i64 }` — `Copy`, no pointer, no hidden state.
  Storable anywhere, serializable, hashable. A span is *data about* a buffer, not a
  window *into* one; it touches memory only when resolved against a `Sealed`.
- **Wrong-buffer resolution** is the honest gap: a span resolved against the wrong
  sealed buffer reads wrong-but-in-bounds data or fails the bounds check — a
  deterministic logic bug, never UB. Debug builds can add an optional tag (seal
  identity stamped into a `TaggedSpan`) behind `--sanitize`; release spans stay two
  plain integers.
- `unseal(self: Sealed<T>): Result<Vec<T>, SealError>` — succeeds only when the
  refcount is 1, returning the original allocation untouched. Staged pipelines fall
  out: build → seal → parse/share → unseal → mutate → seal again. Failure (live
  clones) is an error, not a copy — an explicit `unsealOrCopy()` names the copy for
  callers that want it.
- Drop: last owner frees, running `T` destructors. For `Sealed<u8>` (the dominant
  case) that is just `free`.
- The unsafe seam: one control block, one atomic refcount, one
  `unsafe impl Send/Sync` with its safety comment. Same shape and size as the shard
  control block — one file, auditable in a sitting.

### Checker deltas: none required

Use-after-seal is use-after-move: already rejected. Mutation of sealed data: no such
method resolves. Spans outliving the buffer: a span without a `Sealed` in hand is
inert integers — the failure mode is a wrong answer from the wrong buffer, already
demoted. The transient `view`/`text` returns ride the existing second-class borrow
rules (source frozen while the view lives — and freezing an immutable type is vacuous,
so even that check never fires).

### Acceptance

- **Flagship benchmark — RUN 2026-08-22 (userspace prototype, 1 vCPU):** JSON scan
  over a 52MB in-memory doc, 3M string literals, identical scanner both sides, only
  "what we keep" differing. Owned path: ~190ms median (548ms cold first run —
  allocator warmup), 222MB RSS, ~3M allocations. Seal/span path: ~135ms, 170MB RSS,
  ~25 allocations (Vec doublings). Checksums identical. Scorecard vs the predictions
  above: allocation collapse **confirmed**; RSS **confirmed** (the 52MB delta is the
  copied payload, almost exactly); wall time **1.4×, short of the ≥2× predicted** —
  these literals average ~17 bytes, so per-copy cost is small and the allocator
  absorbs the churn; the gap should widen with longer values, allocator pressure, or
  destructor-bearing elements. Re-run on the real `std/seal` with refcounting to
  confirm the control block doesn't eat the margin.
- Negative tests: use of the Vec after `seal` (compile error), span OOB (runtime
  error, not UB), `unseal` with a live clone (error), `text` on a non-UTF-8 span
  (error path), destructor-bearing `T` sealed and dropped (ASan-clean).
- `derive-json` gains a spans mode as the proof-of-integration: deserialize string
  fields as `Span` against the sealed input instead of owned `string`.

## Phase 2 — frozen pools (residue #1, the static half)

The same consuming conversion, applied to handle staleness. Handles go stale because
pools free and reuse slots. So: `pool.freeze()` consumes the pool into a
`FrozenPool<T>` — no `remove`, no `clear`, no reuse, ever. Every handle minted before
the freeze is now valid *forever*, so the generation check on access is **elided by
type, not proven by SMT** — `get(h)` on a same-pool handle cannot fail.

- Build-then-read structures — symbol tables, ASTs, config trees, the actual majority
  of pool users — get Rust-grade static confidence for the price of one method call.
- Cross-pool confusion (a handle from pool A resolved in frozen pool B) remains the
  identity check it is today: deterministic, runtime, demoted. Say so.
- Pools that genuinely must free and reuse keep the generation check and the
  contracts/prover elision path (`verification-roadmap.md`) — the honest split
  between what a type can promise and what a prover must.
- A `GrowOnlyPool` middle tier (alloc allowed, free absent) covers incremental
  builders with the same within-pool guarantee; freeze remains the terminal state.

## Honest residue that remains — the permanent list

After fission + seal/span + frozen pools, `residue-vs-rust.md` should shrink to the
genuinely hard core, and the doc must keep claiming it plainly:

- **Contended long-lived shared mutable state** across threads. Fission divides data;
  seal shares immutable data; neither is a concurrent hash map. Channels, atomics,
  and shard-per-core ownership remain the answer; Rust's `Mutex<T>`-shaped workloads
  stay an anti-target.
- **Views over buffers that cannot be sealed** — a structure retaining offsets into a
  buffer that must keep mutating (an editor's rope, an incremental parser's live
  text). Staged seal/unseal covers batch pipelines; truly interleaved mutate-and-view
  stays convention-plus-generation-checks.
- **Unbranded spans** — wrong-buffer resolution is a logic bug Milo detects at bounds
  or not at all, where Rust rejects it at compile time. Demoted, documented, kept.
- **Pools that free.** Freeze is for build-then-read; the free-and-reuse case remains
  runtime-checked until the prover reaches it.

## The claim, stated correctly

Not "the residues are gone." It is: **each residue loses its most common workload to a
consuming type conversion — shatter for aliasing, seal for invalidation, freeze for
staleness — and what remains is the irreducible core the axiom actually costs.** Every
mechanism is a std type; every proof is the move checker that already shipped; every
remaining gap fails deterministically and is named in the docs before a user finds it.
