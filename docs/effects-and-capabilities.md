<!-- doc-meta
system: effects-and-capabilities
purpose: what a Milo signature does and does not promise, and the staged plan to widen it
key-files: src/checker.ts (checkPurity), std/math.milo, docs/design.md
update-when: @pure's rules change, a capability or effect stage ships, or std gains a gated module
last-verified: 2026-07-30
-->

# Effects and capabilities

Second-class references answer *where mutation can happen*. They say nothing about
what else a function can do. This document is about the second half.

## What a Milo signature promises today

Given `fn f(a: &Data, b: &mut Buf): i64`, the type system already guarantees a
surprising amount:

- `a` is not mutated by `f`.
- `b` may be mutated, and that is visible in the signature.
- Neither reference is stored, returned, or captured — no aliasing survives the call.
- Nothing else reachable from the caller changes, because nothing else is aliased.

That is the *frame* problem solved for free. What the signature does **not** tell
you is whether `f` printed to stdout, read a file, opened a socket, mutated a
module-level `var`, called into C, or read the clock. Every one of those is
available to every function, unconditionally, by importing it. That is *ambient
authority*, and it is the gap.

The consequence is concrete: you cannot look at a call site and know whether it is
safe to skip, reorder, cache, retry, or run in parallel. Nor can a reviewer — human
or model — bound what a function did without reading its whole call graph.

## Stage 1 — `@pure` (shipped)

`@pure` narrows a function's effects to the ones its signature already shows.

```milo
@pure
fn sumSquares(v: &Vec<i64>): i64 {
    var total = 0
    for x in v { total = total + x * x }
    return total
}
```

The rule, as the checker enforces it (`checkPurity` in `src/checker.ts`): a `@pure`
function may read and write its parameters and its own locals, and nothing else. In
particular it may not

- call a function that is not itself `@pure`,
- call an `extern` (unless that extern is *declared* `@pure` — see below),
- call through a function value, a fn-typed field, or an interface method,
- read or write a mutable module-level `var`,
- contain an `unsafe` block.

It **may** take `&mut` parameters and mutate through them. That is a declared
effect, not an ambient one: the caller handed over the exact memory in question.
It may also allocate, and it may trap.

### What `@pure` is not

It is not totality. A `@pure` function can still overflow, index out of bounds,
fail a contract, or loop forever. Trapping is not an effect under this definition,
for the same reason a bounds check is not: it is a refusal to continue, not an
observable interaction with the world. Koka would spell this `<exn, div>`; Milo does
not track those separately today.

So the strong reading — *referentially transparent, safe to cache and reorder* —
holds for a `@pure` function whose parameters are all by-value or `&T`. Add a
`&mut` parameter and you keep locality but lose idempotence.

### The extern hole

`@pure extern fn sqrt(x: f64): f64` is an assertion, not a check. There is no body
here to inspect. This is the same trust boundary every effect system has at the FFI
edge (Haskell's `unsafePerformIO`, Koka's `extern`, Rust's `unsafe`), and it is
deliberately spelled out at the declaration rather than hidden.

`std/math` is annotated end to end on this basis — every libm binding and every
`Math.*` method — which makes numeric code the first thing that can be written pure:

```milo
@pure
fn hypot(a: f64, b: f64): f64 {
    return Math.sqrt(a * a + b * b)
}
```

### Why it composes with the prover

A `@pure` function is exactly the shape `milo prove` can treat as a mathematical
function: no frame conditions to encode, no hidden state to havoc between calls.
Purity and contracts were designed to meet — `requires`/`ensures` on a `@pure`
function is a total specification of what it does.

## Stage 2 — capabilities (proposed, not built)

The natural next step is not more effect labels but removing the ambient authority
that makes them necessary. Under a capability discipline, a function can do I/O only
if it was *handed* something that does I/O:

```milo
// sketch — not implemented
pub fn main(io: Io) {
    let cfg = loadConfig(io.fs)        // can read files
    let port = choosePort(cfg)         // provably cannot
    serve(io.net, port)
}
```

This composes unusually well with second-class references. Make the capability
values themselves second-class — passable as parameters, never stored in a struct,
never captured by a closure, never parked in a global — and the compiler already
guarantees authority cannot leak. Rust needs an effect-polymorphism story to get the
same property; Milo would get it from a rule it already enforces for other reasons.

The cost is honest and large:

- Every `std` module that touches the outside world changes shape, and every program
  that calls one changes with it. This is the biggest breaking change on the table.
- `main` grows a parameter, and the "hello world" gets longer.
- Effect polymorphism reappears in a new form: a generic `map` over a callback that
  might do I/O needs to say so, or lose the capability.

That last point is the one to solve before committing. Prior art: Scala's
[caprese](https://github.com/lampepfl/dotty/issues/13657), the E language lineage,
and WASI's handle-passing model, which is a capability system in production without
calling itself one.

## Stage 3 — effect rows (probably not)

Full algebraic effects — Koka's `<console, exn, div>` on every signature, with
handlers as a control construct — buy expressiveness Milo has not needed and cost
readability it cannot afford. `Result<T, E>` already covers recoverable failure, and
green tasks already cover the resumption cases handlers are usually sold for. This
is recorded as a considered non-goal, not an unexplored option.

## Why this matters more for generated code than for people

The traditional objection to effect tracking is ergonomic: it is boilerplate, and
humans resent boilerplate. That calculus changes when much of the code is written by
a model and read by a person auditing it. Verbosity is nearly free to produce and
directly useful to check.

Concretely, a `@pure` signature is a claim the compiler enforces, so a reviewer can
stop reading. Code that does I/O where the type says it cannot is a compile error
rather than a silent behavioral difference — the same trade Milo already makes for
memory safety, applied to the rest of what a function can do.

That said, the honest caveat from the aliasing story applies here too: models are
trained on languages with ambient authority and near-zero code in languages without
it. A design being easier to *verify* does not make it easier to *generate* until
there is enough of it to learn from.

## Status

| Stage | State |
|---|---|
| `@pure` on fns, methods, externs | shipped; `std/math` annotated |
| Purity in fn types (so a `@pure` fn can take a `@pure` callback) | not started — today any call through a function value is rejected |
| Purity on interface methods | not started — dynamic dispatch is rejected |
| Capability parameters, non-ambient `std` | proposed, stage 2 above |
| Effect rows / handlers | considered non-goal |
