<!-- doc-meta
system: positioning
purpose: honest account of where Rust genuinely wins over Milo, and the claims Milo may and may not make
key-files: docs/ownership-model.md, docs/memory-safety-vs-rust.md, docs/design.md
update-when: the residue changes — a feature lands that closes one of the three gaps, or the safe-claim boundary moves
last-verified: 2026-07-29
-->

# The residue: where Rust genuinely wins

This document exists so every later design decision stays honest about what Milo is and isn't trying to be. Users will find these gaps themselves. Naming them first is cheaper than being caught denying them.

Milo's axiom is that **values are closed**: nothing aliases in, nothing escapes out. References are second-class (see [ownership-model](ownership-model.md)). That axiom buys a great deal — no lifetimes, structural disjointness, cheap proofs. It also has a residue: three workloads where Rust's ability to *keep* references safely is a real advantage Milo does not match. These are not bugs. They are the price of the axiom.

## 1. Compile-time rejection of stale stored references

Rust proves at compile time that a stored reference never outlives its referent. Milo forbids storing references at all, so the question never arises for references — but the *need* doesn't vanish. Graph-shaped, stored, or long-lived data goes through pool indices and generational handles ([SlotMap](std/) is the blessed collection). A stale handle is caught **at runtime** as a deterministic error, never as silent aliasing or UB.

For most code, runtime-deterministic is fine. For TLS session state, kernel objects, or a DB engine's page table — where a stale-handle panic in production is itself unacceptable — Rust's compile-time rejection is genuinely stronger. Milo's answer to that tier is the contracts profile (see [verification-roadmap](verification-roadmap.md)): prove `pool.contains(h)` statically and the runtime check is elided. Until a given call is proven, it runs checked. That is graceful degradation Rust's all-or-nothing signature can't offer — but the *default* is a runtime check, and honesty requires saying so.

## 2. In-place shared-memory parallelism

`par_iter_mut`, scoped threads carving one array into disjoint mutable slices, work-stealing over shared state — Rust checks these safe. Milo **bans the workload** rather than checking it. There is no `&mut [T]` split into aliasing-free sub-slices across threads (see backlog: mutable slice split). Multicore scaling is Node-style: processes, message passing, `Promise.blocking` workers that move-capture their inputs.

For a parser, CLI, or service this is the right trade and often faster to reason about. For a physics kernel, an ECS inner loop, or a tiled image filter that must share one buffer across cores, Rust does the thing Milo won't. Don't pretend the process model covers it — it covers throughput, not shared-memory data parallelism.

## 3. Stored zero-copy

Borrowed ASTs, zero-copy deserializers, a `struct` holding `&str` slices into an input buffer — Rust stores those borrows and proves them valid. Milo can't store a reference, so its zero-copy story is **offset pairs into an owned buffer**: hold the buffer, carry `(start, len)`, resolve on access. Views (`&[T]`/`&str`, second-class) delete the *transient* clones — passing a sub-slice down a call — but a structure that must *retain* a view over a buffer it doesn't own is the stored-borrow case again, and the answer is offsets.

## The claim discipline

Never say indices eliminate memory bugs. The correct claim, always:

> Pool indices and generational handles **demote memory-unsafety** (UB, corruption, exploitability) **to logic bugs** (wrong value, deterministic panic). SlotMap and newtyped keys then catch most of *those* too.

A wrong index is still a bug. It is a bug that crashes deterministically or returns the wrong value — not one that corrupts the heap or becomes a CVE. That demotion is the whole safety pitch. Overstating it to "no bugs" forfeits the credibility the honest version earns.

## Target and anti-target

**Target:** parsers, CLIs, services, leaf libraries — code where ownership is mostly a tree, references are mostly transient, and the pool/handle/message-passing style is what expert Rust converges on anyway. Milo makes that style primary and deletes the machinery that served the other style.

**Anti-target:** event-loop runtimes with GC-managed FFI, SMP monoliths and other shared-memory data-parallel workloads, systems that must store zero-copy borrows across a buffer's lifetime. Milo can be *used* there, against the grain, but it is not competing to win there.

Note "kernels" is *not* on this list. Freestanding/no-runtime is shipped, and a single-core RTOS core needs no shared-memory parallelism — interrupt masking is the lock. The anti-target is the *SMP* part, not the bare-metal part. See [kernel-feasibility](kernel-feasibility.md).

## The pitch, stated correctly

Not "Rust minus annotations." It is: **the pool / handle / message-passing style that expert Rust code converges on anyway, made primary, with the machinery that mostly served the other style deleted.** The three items above are what that machinery was for. We removed it on purpose, and we say what it cost.

## See also

- [ownership-model](ownership-model.md) — why references are second-class
- [memory-safety-vs-rust.md](memory-safety-vs-rust.md) — the empirical threat matrix
- [verification-roadmap](verification-roadmap.md) — the contracts profile that narrows residue #1
