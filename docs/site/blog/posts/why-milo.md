---
title: A systems language with Rust's guarantees and none of its lifetimes
description: Milo drops lifetime annotations by making references second-class. Here is exactly what that buys, what it costs, and the one shape it rules out.
date: 2026-07-30
author: Chad Smith
tags: [design]
---

Rust settled the question of whether a systems language can be memory-safe without a garbage
collector. It can. The bill came due somewhere else: to get a non-trivial Rust program past the
compiler you have to carry a model of the borrow checker in your head, and once a borrow needs
to outlive the call that produced it, you start naming lifetimes.

Milo is a bet that most of the guarantee survives if you give up one thing: storing references.

## References only exist in parameters

A `&T` or `&mut T` in Milo can appear in a function parameter and nowhere else. Not in a struct
field, not in a `Vec`, not as a return type — with one exception covered below. There is no `&x`
expression, either. You pass the value bare and the compiler borrows it:

```milo
fn scale(v: &mut Vec<f64>, k: f64) {
    for i in 0..v.len { v[i] = v[i] * k }
}

fn main() {
    var data = [1.0, 2.0, 3.0]
    scale(data, 2.0)      // no &, no annotation, no lifetime
    print($"{data[0]}")   // 2
}
```

That restriction is the whole trick. If a reference can never outlive the call it was passed
to, the compiler doesn't need a lifetime system to prove it stays valid — the call stack does
it. A borrow is bounded by a frame that is still on the stack by construction.

So the annotations don't get inferred, or hidden, or made optional. They stop existing, because
the thing they describe can't be built.

## What you give up

One shape, and it's worth naming precisely rather than hiding: **a struct that stores a borrow.**

```rust
struct Parser<'a> { src: &'a str }   // Rust
```

There is no Milo equivalent. That's the entire cost, and every other pattern people reach for
`'a` to express has an answer that compiles today:

| Rust | Milo |
|---|---|
| `&s[6..11]` | `s[6..11]` — a view, no allocation |
| `fn items(&self) -> &[T]` | the same; a method may return a view of its receiver's storage |
| `Box<Expr>` | `Heap<Expr>` |
| `Rc<RefCell<Node>>` | an arena plus generational `Handle<T>` |
| `Arc<Mutex<T>>` across threads | one task owns it, others `send` over a channel |
| `struct Cur<'a> { buf: &'a [u8] }` | own the buffer, carry an integer position, slice on demand |

The exception to "references only in parameters" is in that second row: a method may return a
view into storage its own receiver owns. The caller can read the view where it stands but can't
put it in a struct or a collection, which is the same boundary as everywhere else.

When you genuinely need a token pointing into a source buffer, there are three answers ranked by
how much compile-time guarantee they keep, written up in
[Patterns Without Lifetimes](/language/patterns). We would rather document the cliff than
pretend the ground is flat.

## Correctness is the default, not a flag

The second thing Milo bets on: safety that costs ceremony gets turned off.

Integer overflow traps in every build mode, including release. Not "in debug." A program that
overflows is wrong, and shipping the wrong answer faster is not a tradeoff we're interested in.
A function that genuinely wants modular arithmetic says so, once, at the declaration:

```milo
@wrapping fn hash(h: u64, b: u8): u64 {
    return h * 1099511628211 + (b as u64)
}
```

Contracts are ordinary syntax rather than a separate specification language:

```milo
fn clamp(x: i64, lo: i64, hi: i64): i64
    requires lo <= hi
    ensures result >= lo && result <= hi
{
    if x < lo { return lo }
    if x > hi { return hi }
    return x
}
```

`milo prove` discharges those to a solver. It proves the postcondition for every input meeting
the precondition, and it checks at each call site that the precondition holds. This is the part
of SPARK worth stealing, without SPARK's ceremony — the contracts are in the same file, in the
same language, and code with no contracts compiles exactly as before.

The prover is honest about its frontier. Linear integer arithmetic works. Bitvector operations,
index expressions, and loop-carried invariants over struct fields do not yet, and an obligation
it can't discharge reports as *unknown* rather than as proven.

## We find the gaps by writing programs

Language design arguments are cheap. The way we decide whether Milo is expressive enough is by
writing things in it that are too big to fake:

- Three console emulators — NES, SNES, Genesis — that run real commercial games, and
  [play in the browser](/demos) through the JavaScript backend.
- A JavaScript engine and runtime, written in Milo, that serves a real Express + tRPC
  application with live external HTTPS calls.
- 56 example programs: HTTP servers, CLI tools, a raytracer, terminal UIs, bare-metal Cortex-M
  firmware.

Every one of those found something. Mutable slice views are missing, which is why parallel map
over one array isn't in the table above. Several move-checker holes turned up only under a
workload that big. That's the point of writing them.

## Where it actually is

Young, and not pretending otherwise. 469 compiler fixtures, 143 tests that assert on error
message text, 88 standard library modules, an LSP server, a formatter, a package manager.
macOS and Linux are fully supported on arm64 and x64; Windows has the core language and
`std/io` but not async I/O. Breaking changes still happen.

```sh
curl -fsSL https://milo-language.github.io/milo/install.sh | sh
```

The [tour](/tour) runs the real compiler in your browser, so you can disagree with all of this
without installing anything.
