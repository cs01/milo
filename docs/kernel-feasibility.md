# Kernel feasibility

"Leaf library, not kernel" was a positioning slogan, not a technical finding. It fused three
unrelated questions into one verdict. Pulled apart, one is already shipped, and the other two are
bounded — reachable on a single core today, with SMP as a later, separate decision.

## The slogan hid three questions

**(A) Freestanding — no OS, no runtime, no GC, precise layout.** Shipped.

**(B) Interrupts are hidden concurrency.** An ISR that preempts a mutation is a *second mutator
the exclusivity checker cannot see* — on a single core, no SMP involved. This is a type-system
problem, co-equal with (C), and it is the actual near-term kernel-killer.

**(C) SMP shared mutable memory across cores.** The far-term tension with value semantics.
Answered by an audited `unsafe` hatch — the same way every kernel in every language lives.

The green-task runtime is *not* load-bearing for any of this; freestanding drops it. Conceding
that was the whole point of splitting (A) out.

## (A) is done

- Bare-metal targets: `cortex-m0/m3/m4/m4f/m7`, `thumbv*-none-eabi`, soft/hard float
  (`src/target.ts`). `os: "none"`, `bareMetal: true`.
- No GC, no mandatory runtime; heap is a bump allocator with `--heap-size` cap, OOM → `ENOMEM`.
  The safety-critical bare-metal story is already complete on Cortex-M.
- Freestanding link + QEMU run with semihosting; startup (vector table, `.data`/`.bss` init,
  exit) via a linked `startup.c` (`src/main.ts`).
- Atomics lower to real LLVM `atomicrmw`/`cmpxchg`: `_atomicLoad/Store/Add/Sub/Cas` (i64),
  `_atomicLoad/Store/Swap` (bool).
- `unsafe`, raw pointers, `extern`, `@cLayout`/struct-by-value FFI.

A no-std Milo binary that talks to hardware already exists. That half is not open.

## (B) Interrupts as hidden concurrency — the real near-term problem

The exclusivity checker proves that while one `&mut` is live, nothing else touches that memory.
An interrupt breaks that on a *single core*: the ISR fires mid-mutation and is a second writer the
checker never modelled. Nothing today stops an ISR from touching an ordinary `static`, and if it
does, every exclusivity guarantee over that state is a lie — no SMP required.

This interacts with the type system as much as (C) does, and it comes *first*, because every
kernel has interrupts and only some have multiple cores.

**Discipline to enforce:** an ISR may touch only `Shared<T>` and atomics — never an ordinary
mutable `static` or a value reached by `&mut`. That is a checkable rule: mark interrupt-handler
functions, and lint that their reachable writes land only in `Shared<T>`/atomic. `Shared<T>` is
the same hatch (C) needs; interrupts are its first and most common customer, and on unicore,
**interrupt masking is the lock** that makes access to it sound.

## (C) SMP shared memory — the far-term tension

Two cores genuinely sharing one mutable structure (runqueue, per-CPU data, page tables, an IPC
ring) is what value semantics bans by default. Kernel mode audits it instead: `Shared<T>` plus
`unsafe` `Send`/`Sync` on the few structs that cross cores, used at the ~dozen sites that need it,
lint-kept rare and greppable. Primitives exist (raw pointers, atomics, `unsafe`); the missing
piece is the blessed type and its rules. This is how Rust kernels live — safe by default,
`UnsafeCell`/`unsafe impl Sync` at the audited core.

`Shared<T>` is shared by (B) and (C); the difference is only what makes access sound — masking on
unicore, atomics/locks on SMP.

## Panic strategy at ring 0

A bounds check, generational-handle miss, or contract assert cannot unwind into an OS at ring 0.
Two parts:

1. **A definable panic handler** — `halt`, `reset`, or log-to-ring-buffer — installed at the
   freestanding entry, the way `panic_handler` works in a no-std Rust binary. Nothing subtle;
   it just has to exist and be pickable.
2. **Proofs delete the checks.** The verified-module claim is precisely this: a module whose
   contracts are discharged has *no panic paths left* — the bounds check and the handle check are
   elided because the prover showed they cannot fire. A proven filesystem driver has no "panic in
   production" path, because the branch that would panic was removed at compile time. That is the
   answer to the standing "panic in a driver" objection, and it should be claimed, not left open.

Until a call is proven it runs checked and panics via handler (1); once proven it has no panic
path (2). Graceful degradation, not all-or-nothing.

## Gap list (ranked)

1. **ISR discipline + `Shared<T>` (B).** Mark handlers; lint that ISR-reachable writes hit only
   `Shared<T>`/atomics. Type-system work, and the first thing a correct unicore kernel needs.
2. **Volatile MMIO load/store.** Raw-pointer access is not `volatile` today, so device-register
   reads/writes can be reordered or elided. A volatile load/store intrinsic. Prerequisite for
   anything touching hardware.
3. **Inline assembly.** None today (no `asm` in lexer/parser/codegen). `wfi`, `cpsid i`,
   `msr`/`mrs`, barriers. Interim: `extern` C asm stubs. Real fix: an `asm(...)` form → LLVM
   inline asm.
4. **Panic handler hook** at the freestanding entry (halt/reset/ring-buffer).
5. **Interrupt ABI + Milo vector tables** (naked fns, `@section`/link-section, EABI interrupt
   convention). Today `startup.c` covers entry; a pure-Milo kernel wants these.
6. **SMP-only (C): per-CPU data, `unsafe` `Send`/`Sync` for cross-core `Shared<T>`.** Deferred
   until after a unicore demo.

Items 1–4 are the unicore prerequisite set. 5 is pure-Milo polish. 6 is a later decision.

## Comparative claim (stated carefully)

The earlier draft said "Rust cannot discharge the safe parts into proofs." That is false — Verus,
Kani, Creusot, and RustBelt do exactly this for Rust systems code today. The defensible claim is
*comparative*:

Value semantics collapses the frame problem — the state a function can touch is its parameter
list, with no aliasing to track. Rust's verifiers spend real machinery encoding what borrows may
alias; Milo's closedness makes those frame conditions trivial. So the claim is **cheaper proofs,
not proofs unavailable to Rust** — the same obligations, discharged with a fraction of the
annotation and solver burden, and concentrated on the ~dozen audited `unsafe` sites.

**SPARK is the model** — a restricting profile plus contracts plus a prover, certifying avionics
for decades on first-order SMT because the language forbids the aliasing that would need
separation logic. That is Milo's actual precedent and it is reachable.

**seL4 is the aspiration, not the promise.** seL4 is a machine-checked microkernel that cost
~20 person-years of Isabelle — a full functional-correctness proof, not SMT-discharged contracts.
Citing it sets an expectation the contracts story does not cash. It is where this could point,
not what the profile delivers.

## Headline target: verified unicore RTOS core

Not "microkernel" — that quietly assumes SMP and drags in (C) and items 5–6. The honest,
reachable target today is a **single-core RTOS core / protocol state machine / separation-kernel
component** with discharged contracts:

- needs none of (C) — one core, interrupt masking is the lock;
- `Shared<T>` covers ISR state (B);
- volatile + asm (gaps 2–3) are the whole hardware-access prerequisite;
- and the safe modules discharge to SMT cheaply, leaving a small audited unsafe surface.

That proves the thesis honestly. "Verifiable microkernel" stays the aspiration behind it.

## Scope sketch (sequenced)

1. **Volatile MMIO intrinsic** — smallest, unblocks hardware access.
2. **`Shared<T>` + ISR discipline lint (B)** — the type-system core; also serves (C) later.
3. **Panic handler hook.**
4. **Inline asm** (or lean on C stubs until then).
5. **Unicore demo** — an RTOS scheduler or a network protocol state machine, freestanding on
   Cortex-M, with contracts discharged so the safe modules have no panic paths.
6. **Then decide** whether SMP (C) + items 5–6 are worth it. Do not build them ahead of a
   workload that needs them.

## Honesty

- Not a general-purpose SMP monolith soon, and shouldn't try. The value-semantics purity gets an
  asterisk at the shared-memory core — and that asterisk is `unsafe`, audited, and where possible
  proven, not hidden.
- (B) and (C) are genuine type-system work, not flag flips. (B) is the one that lands first.
- Volatile and asm are missing today and are prerequisites for anything real.
