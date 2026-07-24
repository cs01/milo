# Memory Safety vs Rust

Rust is the industry standard for safe systems code. The table below compares how Rust and Milo handle selected memory-safety issues.

Each result is obtained by building the same probe [in each language](https://github.com/milo-language/milo/tree/main/rust-comparison) or as a Milo regression fixture. This is evidence for the tested cases.

`unsafe` and FFI remain explicit trust boundaries in both languages.

## What gets caught

`compile` = rejected before codegen
`runtime` = defined trap
`n/a` = the pattern can't be written

| Threat | Rust observed result | Milo observed result | How Milo does it |
|---|---|---|---|
| Use-after-move / double-free | compile · `E0382: borrow of moved value` | **compile** · `use of moved variable` | move checker |
| Use-after-free (owned, `Box`/`Heap`) | compile · moved-value error | **compile** · `use of moved variable` | `Heap<T>` is single-owner; second use is a moved-value error |
| Dangling return (`return &local`) | compile · `E0515: cannot return reference to local variable` | **compile** · `cannot return a reference` | references are param-only, never returned |
| Stored borrow in a struct | compile with `<'a>` lifetime checked | **compile** · `references cannot be stored in structs` | rejected: references can't be struct fields |
| Iterator invalidation | compile · borrow-checker error | **compile** · `cannot call 'push' … because it is borrowed` | borrow tracker rejects mutation while borrowed |
| Aliasing `&mut` + `&` | compile · borrow-checker error | **compile** · `borrowed mutably and shared in the same call` | exclusivity check at the call site |
| Null deref | compile · no null reference | **compile** · no null type | `Option<T>` must be matched |
| Out-of-bounds (array / `Vec`) | runtime · `index out of bounds` | **runtime** · `array index out of bounds: 7/1` | bounds check, all build modes |
| Use-after-free (cyclic / graph) | depends on representation | **runtime** · stale `Handle` returns `None` | generational handle check |
| Divide-by-zero, `INT_MIN / -1` | runtime · `attempt to divide …` | **runtime** · `division by zero` | always-on guard |
| Integer overflow | debug · `attempt to add with overflow`; release wraps (`-C overflow-checks=on` to keep them) | debug · `integer overflow`; release wraps (`--overflow-checks` to keep them) | at parity by default today — see note |

Across these probes, neither safe-language implementation silently reaches undefined behavior.

## Where the two differ

| Pattern | Rust | Milo | Verdict |
|---|---|---|---|
| Mutable cyclic data (graph, doubly-linked list, parent pointers) | `Rc<RefCell>`, raw indices, or a generational arena crate such as `slotmap` | `std/arena` with arena-bound generational `Handle` | **parity with generational Rust arenas**; Milo includes one in stdlib |
| Stored borrow (`struct Parser<'a> { input: &'a [u8] }`) | expressible, compile-time view↔buffer tie | can't store a borrow — own the buffer + integer offset (`std/json` does this) | **Rust ahead** for borrow-carrying APIs |

The stored-borrow row is the central trade in Milo's reference model: Milo forbids the pattern (still memory-safe via bounds checks) and loses the compile-time tie Rust's `'a` gives. That can admit a wrong-buffer logic bug even though bounds checks prevent memory corruption. See [Ownership](/language/ownership).

## Beyond memory safety: contracts

Memory safety stops corruption; contracts stop *logic* errors — a function fed inputs it forbids, or breaking a promise about its result. In Milo they are in the language, and the prover discharges them at compile time.

| Capability | Rust | Milo |
|---|---|---|
| Contracts in the language (`requires` / `ensures` / `invariant`) | `core::contracts`, **unstable** | **yes** — shipped, no feature gate |
| Checked at **compile time** | no — needs external Kani / Creusot / Prusti | **yes** — `milo prove`, SMT solver |
| Constant-arg precondition violation in an ordinary call | no built-in contract check; const assertions or typestate require restructuring | **compile error** |
| Checked at **runtime** | `-Z contract-checks` (unstable) | `--debug`, or `--contract-checks` at any `-O`, asserts entry/return/loop |
| Compiled out in release | yes | yes |

Milo's prover is bounded. The built-in `std/smt` decides linear integer arithmetic and reports `unknown` beyond it; `--solver=z3` decides the nonlinear cases too. Bitwise operations, collection lengths, and recursive calls are `unknown` under either, and fall back to runtime asserts. Loops do not need unrolling — an `invariant` is discharged by induction (holds on entry, preserved by the body) and is what the code after the loop gets to assume. Rust can encode some invariants with newtypes/typestate and can force selected expressions through const evaluation; general static verification uses external tools such as Kani, Creusot, or Prusti. Milo's advantage is the built-in path for the linear contracts it covers, not exclusive access to compile-time reasoning. See [Contracts & Safety](/language/safety).

::: tip Note on integer overflow
Milo's decided default is to trap overflow in every build mode. As shipped today the trap is gated to `--debug`; `run`, default `build`, and `--release` wrap silently — Rust-parity, not yet the target. Wrapping is defined (memory-safe, no UB); closing the gap is ungating the check to all modes. Div-by-zero and `INT_MIN / -1` already trap everywhere.
:::
