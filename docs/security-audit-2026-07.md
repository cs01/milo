<!-- doc-meta
system: security
purpose: action-item tracker for the 2026-07-20 adversarial memory-safety audit; each box is a fix in flight
key-files: src/checker.ts, src/codegen.ts, src/parser.ts, src/main.ts
update-when: an item's fix lands (check the box) or a new finding is triaged
last-verified: 2026-07-20
-->

# Security audit — adversarial memory-safety review (2026-07-20)

Black-hat audit of the compiler and its output. Goal was to break the memory-safety
guarantee, segfault binaries, and crash the compiler. Every finding was reproduced on the
repo-source compiler (`bun run src/main.ts`). This file is the action-item tracker; each box
is worked one at a time, its own commit, with a regression fixture.

Verdict: sound architecture, bugs cluster in the closure subsystem plus one aliasing gap and
one unsigned-length mistake. Index bounds (signed/negative/i64/u64), refined ranges, slice
checks, second-class references, struct/enum layout, generic monomorphization, and the
AArch64 struct-by-value ABI all held up; ~110 pathological compiler inputs were handled
gracefully.

## Action items (priority: memory-safety first)

- [x] **C2 — `Vec.filled(negativeCount, x)` → negative len → OOB.** `Vec.filled`/`withCapacity`
  store `count` verbatim as `len`; the index bounds check is unsigned (`icmp ult`), so a
  negative len becomes a huge bound and every index passes → OOB → SIGSEGV. Reachable at
  `--release` via overflow-wrapped count; a literal `-1` also compiles clean.
  Fix: runtime trap on `count < 0` (and size-overflow) in the Vec/String allocators; static
  reject of a negative constant where a length is expected. Consider `u64` length params at
  the constructor boundary (Rust/C++ use unsigned size + a capacity-overflow guard).

- [x] **C1 — mutable-aliasing use-after-free.** No aliasing check between `&mut` params;
  `bad(v[0], v)` passes an element ref and the container, inner `push` reallocs → dangling.
  Fix: reject a call where two `&mut` args provably overlap (`v[i]` and `v`).

- [x] **C3 — escaping non-`move` closure captures by reference.** CLOSED 2026-08-14 with the
  conservative-reject rule below, which REPLACED the silent promotion that first shipped for
  it. A closure that captures by reference is a pointer into the frame it was written in:
  safe to call, unsafe to keep. Every route by which one could outlive that frame is now an
  error (`checker.ts checkEscapingClosures`), and `move` is the escape hatch each diagnostic
  names — it works even for a `var` capture, at the cost of dropping the write-back.

  Six routes, all verified live before the fix and all silent or fatal in safe code:

  | route | symptom |
  |---|---|
  | `Box { f: g }` | garbage at -O0, hang at -O2 (closed 2026-07-31) |
  | `b.f = g`, `b.f = (x) => x + n` | SIGKILL |
  | `wrap(g)` — callee keeps it | SIGKILL |
  | `wrap((x) => x + n)` with a `var` capture | SIGKILL (the call-site auto-`move` declines) |
  | `let g = f; return g` | printed `-1` |
  | `return f` | see below |

  **Why the promotion had to go rather than be extended.** It flipped the closure to `move`
  at the `return` — after the move checker had already walked the body — so the capture was
  moved into the closure's env back at the *literal* and any read in between sailed past
  unreported. `let s = "hello world"; let f = () => s.len(); print(s); return f` compiled and
  printed an **empty line** for `print(s)`. Rejecting needs no such retroactive edit; with an
  explicit `move` the same program now reports `use of moved variable 's'` at the `print`.
  Blast radius of removing it, measured before the change: **3 sites across 739 files**, all
  three inside the fixture written to test the promotion itself.

  **Whether a callee retains its argument is computed, not annotated.** A fn-typed parameter
  that only ever appears in callee position is consumed during the call — and `g(1)` parses
  as `Call{func:"g"}` with no `Ident` node, so "appears as an `Ident` anywhere in the body"
  is exactly "used as a value rather than called". Forwarding recurses so a one-line wrapper
  is not punished; every unknown (no body, an extern, a variadic slot, a cycle) answers
  *retains*. That is the property the `sortByKey` carve-out still approximates with a name.
  Over-rejection measured at **0 across 258 std and example files**; fixtures 849/849.

- [ ] **H1 — `f()(x)` / `arr[i](x)` callee never invoked.** DEFERRED (needs an AST change,
  not an isolated fix). Root cause: the AST `Call` node keys off `func: string` (a name),
  so a callee that is itself an expression can't be represented; the checker's `closureCalls`
  map only recognizes an `Ident` callee. Supporting it means adding a general callee
  expression (or an `IndirectCall` node) threaded through parser→checker→lower→codegen —
  high regression risk for an uncommon pattern with an easy workaround (`let g = f(); g(x)`).
  Minimum safe interim: reject the un-lowerable callee form with a clean error instead of
  the current silent `<unprintable>` miscompile.

- [x] **M1 — i32 slice bounds emit invalid IR.** `s[a..b]` with `i32` a/b → `icmp slt i64`
  on an i32 value. Checker accepts i32; codegen must widen bounds to i64.

- [x] **M2 — deep nested `match` emits invalid GEP.** `getelementptr i64, ptr, i32 0, i32 0`.

- [x] **M3 (partial) — unchecked non-arithmetic UB.** Integer div/mod by zero and signed
  `INT_MIN / -1` now trap in every mode. STILL OPEN: shift ≥ bit-width and float→int
  out-of-range (`fptosi`) remain UB — those need a design call (mask vs trap vs
  `llvm.fptosi.sat` / `llvm.fshl`), tracked separately.

- [x] **D1 — parser stack overflow.** No recursion-depth guard; ~4000-deep nesting →
  `RangeError: Maximum call stack`. Add a depth limit with a clean diagnostic.

- [x] **D2 — infinite monomorphization.** Recursive generic (`grow<Wrap<T>>`) has no
  instantiation-depth cap → stack overflow in `monomorphizeFn`. Add a recursion limit.

- [x] **D3 — `prove`/`verify`/`wcet` don't catch `ParseError`.** They dump a raw JS stack
  trace on syntax errors while `build` renders a clean diagnostic. Add the error boundary.

- [ ] **L1 — self-referential struct by value** (`struct Node { next: Node }`, infinite size)
  compiles with no error.
- [ ] **L2 — duplicate `fn` definitions** — no redefinition error. ATTEMPTED, REVERTED.
  A same-module different-body check false-positives on diamond imports: the resolver merges
  the same file reached by two import paths, and those re-merged copies compare as distinct
  bodies (milojs fixtures tripped it). Needs file-level import dedup (skip a re-merged absPath)
  before a same-file redefinition check is safe. Cross-module different-body is already caught.
- [ ] **L3 — huge stack array** (`[i32; 10000000]`) silently compiles → runtime SIGSEGV.
  DEFERRED — a footgun Rust shares (large stack arrays overflow); wants a size-threshold
  diagnostic, but the threshold is a policy call. Not a soundness bug.
- [ ] **L4 — UTF-8 mid-codepoint byte-slice** → silent invalid UTF-8 (no char-boundary check).
  DEFERRED — adding a boundary check changes byte-slicing semantics (sometimes intended);
  a design decision, not a clear fix.
- [ ] **L5 — moved struct-field use** accepted statically (runtime-masked; static gap only).
  DEFERRED — runtime slot-zeroing makes it memory-safe today; a checker-soundness cleanup.
- [ ] **L6 — monomorph name collision** (`struct Box_i64` vs `Box<i64>`) → spurious field
  errors (fail-closed).
