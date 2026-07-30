# Kernel feasibility

"Leaf library, not kernel" was a positioning slogan, not a technical finding. It collapsed two
unrelated questions into one verdict. Pulled apart, most of "kernel" is already shipped and the
rest is a bounded gap list — not an architectural wall.

## The slogan hid two different questions

**(A) Freestanding — no OS, no runtime, no GC, precise layout.** Already shipped.

**(B) SMP shared mutable memory across cores.** One real tension with the value-semantics
default. Narrow, and answered by an audited `unsafe` hatch — the same way every kernel in every
language handles it.

Everything painful about "kernel" that isn't (B) is ergonomics, not model conflict.

## (A) is done

- Bare-metal targets: `cortex-m0/m3/m4/m4f/m7`, `thumbv*-none-eabi`, soft/hard float
  (`src/target.ts`). `os: "none"`, `bareMetal: true`.
- No GC, no mandatory runtime; heap is a bump allocator with `--heap-size` cap, OOM → `ENOMEM`.
  The safety-critical bare-metal story is already complete on Cortex-M.
- Freestanding link + QEMU run with semihosting I/O; startup (vector table, `.data`/`.bss`
  init, exit) via a linked `startup.c` (`src/main.ts`).
- Atomics lower to real LLVM `atomicrmw`/`cmpxchg`: `_atomicLoad/Store/Add/Sub/Cas` (i64) and
  `_atomicLoad/Store/Swap` (bool) — the primitives a lock or a lock-free queue is built from.
- `unsafe`, raw pointers, `extern`, `@cLayout`/struct-by-value FFI: precise control where needed.

A freestanding no-std Milo binary that talks to hardware already exists. That half of "kernel"
is not open.

## (B) is the only real tension — and it has a bounded answer

The value-semantics default says no shared mutable aliasing: a `&mut` names memory nobody else
can touch. A preemptive multi-core kernel violates that at a handful of sites on purpose — the
runqueue, per-CPU data, page tables, an IPC ring — where two cores genuinely share one mutable
structure.

Today the design *bans* that workload. Kernel mode *audits* it instead: a disciplined `unsafe`
shared-memory hatch (a `Shared<T>` / `UnsafeCell`-equivalent plus `unsafe` `Send`/`Sync` for the
few structs that cross cores), used at the ~dozen sites that need it and nowhere else. The
primitives already exist (raw pointers, atomics, `unsafe`); what's missing is the blessed type
and the lint that keeps its use rare and greppable.

This is exactly how Rust kernels live: safe by default, `UnsafeCell`/`unsafe impl Sync` at the
audited core. The default stays message-passing and value-semantic; the kernel pays `unsafe`
where a kernel must.

## Concrete gap list (ranked)

1. **Inline assembly.** None today (no `asm` in lexer/parser/codegen). A kernel cannot set up
   without `wfi`, `cpsid i`, `msr`/`mrs`, barriers. Biggest gap. Interim: call out to C asm
   stubs via `extern`. Real fix: an `asm(...)` form lowering to LLVM inline asm.
2. **Volatile MMIO load/store.** Raw-pointer loads/stores are not `volatile`, so device-register
   access can be reordered or elided. Needs a volatile load/store intrinsic (or `@volatile` on a
   pointer access).
3. **SMP shared-memory hatch (B).** The `Shared<T>`/unsafe-`Sync` type + lint above. Model-level,
   but small surface.
4. **Interrupt-handler ABI + Milo-defined vector tables.** Entry currently comes from `startup.c`.
   A pure-Milo kernel wants naked functions, `@section`/link-section attributes, and the EABI
   interrupt calling convention.
5. **Per-CPU data / TLS-equivalent** for the scheduler.

None of these is a subsystem. 1–2 are the load-bearing ones; a Cortex-M kernel that leans on a
thin C startup + asm stubs is reachable with (2) and the (3) hatch alone.

## The headline this unlocks: a *verifiable* microkernel

The reason to do this is not to chase Linux. It is that Milo's verification story, which is weak
for a leaf library, is strongest exactly here.

Value semantics collapses the frame problem — the set of state a function can touch is its
parameter list, no aliasing to track. That is the property separation logic spends its whole
machinery re-deriving, and it is why SPARK certifies avionics and why **seL4** is a
machine-checked verified microkernel. A kernel written in the value-semantics fragment can
discharge its safe modules to an SMT solver with a fraction of the usual pain, and concentrate the
proof burden on the ~dozen audited `unsafe` shared-memory sites.

"The safe parts are proven; the unsafe shared-memory core is small and audited" is a stronger
kernel pitch than Rust's — Rust cannot discharge the safe parts into proofs the way closedness
lets Milo. The target is not "drop-in OS." It is the seL4 / SPARK niche — verified microkernel,
RTOS core, separation-kernel, seatbelt-grade state machine — served today by almost nobody
ergonomic.

## Honesty

- Milo will not be a general-purpose SMP monolith soon, and shouldn't try. The value-semantics
  purity gets an asterisk at the shared-memory core; that asterisk is `unsafe`, audited, and
  proven — not hidden.
- (B) is genuine design work, not a flag flip: getting `Shared<T>` + `Send`/`Sync` sound is the
  one place this touches the type system.
- Inline asm and volatile are prerequisites for anything real and are missing today.

## Scope sketch

- **Reachable now, small:** volatile MMIO intrinsic; the `Shared<T>`/unsafe-`Sync` hatch + lint.
  With a C startup + asm stubs, a verified-leaf kernel *module* (a scheduler, an allocator, a
  protocol state machine) with discharged contracts is within reach.
- **Real work:** inline asm; naked functions + Milo vector tables + interrupt ABI; per-CPU data.
- **Research, later:** concurrent-separation-logic specs for the shared-memory core (the
  ownership-transfer-through-synchronization story the channel model already mirrors).
