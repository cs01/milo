# Overflow & arithmetic-safety semantics

> **Decision procedure for this doc (and the language):**
> *"A memory-safe systems language that guides you to correct, readable programs."*
> Every call below was resolved by asking which option **guides** (defaults encode the
> usual intent; deviations must be spoken aloud), stays **correct** (even the opt-out is
> defined behavior, never UB), reads **readable** (one concept → one greppable construct),
> and never trades **memory safety** (arithmetic is a correctness dial; bounds is a
> memory-safety dial — they never share a switch). When these four keep picking the
> winner, cite them instead of re-deriving.

## The model: two named modes

**Checked by default, wrapping by declaration.** Not "a default and an exception" — two
modes you name. The default assumes your arithmetic should not overflow and interrupts the
program (traps) when reality disagrees. A routine that genuinely wants modular arithmetic
declares it.

## Default (checked) — traps in EVERY build mode

Uniform across `--debug` / `-O2` / `--release` (Swift/Ada model, not Rust's debug-trap/
release-wrap split). A trap calls `abort()` (SIGABRT): supervisor-visible abnormal exit,
OS core dump, debugger break at the fault.

| operation | checked (default) | `@wrapping` |
|-----------|-------------------|-------------|
| `+ - *` overflow | **trap** | two's-complement wrap |
| unary `-` (negation of INT_MIN) | **trap** | wrap → INT_MIN |
| `/` `%` overflow (INT_MIN / -1) | **trap** | wrap → INT_MIN (rem 0), via select (LLVM sdiv of that pair is poison) |
| `/` `%` by **zero** | **trap** | **trap** — no modular value exists; @wrapping does not make x/0 defined |
| `<<` `>>` amount ≥ bit width | **trap** | mask amount `& (width-1)` (Rust `wrapping_shl` / C / LLVM-expected) |
| array / slice bounds | **trap** | **trap** — memory safety, never opts out here |
| ranged-type bounds | **trap** | **trap** — memory safety |
| `as` cast (int→int trunc, float→int saturate) | unchanged | **unchanged** — conversion is a different dial from arithmetic |

Wrapping is always **defined** two's-complement (no `nsw`/`nuw`), never UB.

## The opt-out, scaled by scope — all say one word: `wrapping`

1. **`@wrapping fn foo(...)`** *(ship first)* — whole routine is modular. Fits the existing
   `@`-directive style, zero new grammar. Concentrates the decision at one greppable,
   auditable site; the contracts prover flips to modular-arithmetic theory for the whole
   routine on one annotation.
2. **`wrapping { ... }` block** *(defer until a real hot-loop case)* — **lexical only**: it
   changes the semantics of `+ - *` *written* in the block, NOT of calls made from inside
   it. Dynamic scoping of arithmetic semantics would be spooky-action; lexical-only is the
   whole rule.
3. **`.wrappingAdd` / `.saturatingAdd` / `.checkedAdd`** — surgical, single-op, rich return
   (`checked → Option`). For one wrapped op inside an otherwise-checked function.
4. **`--no-overflow-checks` / `--fast`** — whole-program perf build.

## Rejected (and why, by the four words)

- **`unchecked` as the keyword** — fails *correct*: advertises UB, when this is the opposite.
- **Zig `@setRuntimeSafety(false)`-style toggle** — fails *memory-safe*: bundles bounds
  checks into the arithmetic switch. Never import that conflation.
- **Terse operators `&+` / `+%`** — fail *readable*: scatter the decision across every
  expression and turn each line into a semantics puzzle; also make the prover reason
  per-expression instead of per-routine. `@wrapping fn` + `.wrappingAdd` already cover it.

## Non-goals (state so nobody "helpfully" adds them)

- **No `--no-bounds-checks` flag, ever.** Release builds keep bounds checks. The moment that
  flag exists, "memory-safe in release" becomes conditional and the central claim dies.
  Bounds opt-out lives only behind `unsafe`, per-site, forever.
- **No UB path through any of this.** Every opt-out yields a *different, named* arithmetic,
  never an undefined one.

## Backlog / composes-later

- **`Wrapping<T>`** register-modeling type — deferred. Becomes nearly free once the newtype
  idiom lands: `struct Wrapping { v: u16 }` + operator impls, **stdlib not compiler**. The
  two roadmap items compose.

## Status

- Checked-by-default (trap all modes) + shift/negation traps + `abort()` panics: **DONE**
  (commit on branch `worktree-float-cast-saturate`).
- `@wrapping fn` attribute: **in progress** (parser → ast → checker → codegen → formatter →
  lsp → fixtures → docs; perf-verify the emulator recovers its ~2×).
- `wrapping { }` block, `Wrapping<T>`: deferred.
