---
title: Second-class references — the open questions, answered
description: Fernando Borretti listed what nobody had worked out about second-class references. Milo shipped the design. Here is each objection against a compiler you can run, including the one that found a use-after-free in ours.
date: 2026-07-30
author: Chad Smith
tags: [design]
---

In [Second-Class References](https://borretti.me/article/second-class-references), Fernando
Borretti works through the idea of degrading references to a parameter-passing mode: no
returning them, no storing them, no creating them anywhere but a call site. He gets far enough
to see it would work, and then declines to put it in Austral. The reason he gives is not that
the idea is wrong. It's that nobody had shown how the ordinary patterns survive:

> Second-class references are appealing, but before giving up on first-class references in
> Austral, I'd like to have a better grasp of how patterns like iterators and core language
> features like closures can be carried over without loss of generality.

That was the right call for Austral, whose borrow checker already fits on a page. Milo made the
other bet — second-class references are the only reference model, and there are no lifetimes
anywhere in the language. So we owe an answer to each item on his list, from a compiler that
runs rather than a design document. Every snippet below is a program we ran; the outputs are
copied from the terminal.

## The list

| Borretti's objection | Milo today |
|---|---|
| Exclusivity is trivial to check | Yes — `store(x, x)` is a compile error |
| Iterators need stored references | No — views into the receiver's storage, plus external iteration |
| Indices reintroduce dangling references | Demoted — generational handles, a deterministic `None` |
| Indices reintroduce type confusion | Yes for the type, partly for the pool — `Handle<T>`, plus a runtime arena-identity check |
| Part-whole: you must pass the pool everywhere | Partly — a module-scope pool works, but not yet an `Arena<T>` one |
| Closures capturing references are unclear | Resolved by rule — a closure cannot capture a reference at all |
| Reference transforms would help | Shipped, in restricted form |

## Exclusivity

His first example is the one that must not compile:

```milo
fn store(place: &mut i64, value: &i64): void { place = value }

var x = 1
store(x, x)
```

```
error: 'x' is borrowed mutably and shared in the same call
hint: a mutation through the '&var'/'&mut' argument could invalidate the '&' argument
      into 'x' — clone the shared argument inline, or split the call into two statements
```

No `&` appears at the call site — Milo auto-borrows, so you pass the value bare — but the
exclusivity rule is the same one. This part of his analysis is exactly right: with references
confined to call sites, checking exclusivity is a pass over one argument list.

## Iteration

This is the objection he weights heaviest, and it's the one where the shape of the answer
matters most. Rust's iterators are structs holding `&'a [T]`. Without stored references, his
candidate answers were coroutines, typed indices, or unsafe pointers.

Milo's answer is a fourth one: **a method may return a view of its own receiver's storage.**

```milo
struct Grid { cells: Vec<i64>, w: i64 }

impl Grid {
    fn row(self: &Grid, r: i64): &[i64] {
        return self.cells[r * self.w .. (r + 1) * self.w]
    }
}

fn sum(xs: &[i64]): i64 {
    var t = 0
    for x in xs { t = t + x }
    return t
}

var g = Grid { cells: [1, 2, 3, 4, 5, 6], w: 3 }
print($"row0 = {sum(g.row(0))}")   // row0 = 6
print($"row1 = {sum(g.row(1))}")   // row1 = 15
```

Nothing is copied. A `&[T]` is a fat pointer into the container's own buffer — at runtime it is
a non-owning vector header with the capacity zeroed, so drop glue skips it. The view can be
re-sliced and passed on:

```milo
let half = g.row(1)[1..3]    // a view of a view
```

Two rules make it sound, both enforced by the compiler. The returned view may only be derived
from `self`, never from a local or another `&` parameter. And the call **freezes the receiver**
for as long as the binding lives: while the view is alive, the container cannot be pushed to,
reassigned, moved, or dropped. Attempting any of those names the borrow.

For an iterator that carries state rather than a window, Milo uses external iteration — `for-in`
accepts any type with a `next(&mut Self): Option<T>` method, and no reference is stored:

```milo
struct Countdown { n: i64 }

impl Countdown {
    fn next(self: &mut Countdown): Option<i64> {
        if self.n <= 0 { return Option.None }
        self.n = self.n - 1
        return Option.Some(self.n)
    }
}

var c = Countdown { n: 3 }
for v in c { print($"tick {v}") }   // tick 2 / tick 1 / tick 0
```

Graydon Hoare's suggested route was interior iteration over coroutines. Milo has stackful
coroutines — that's what green threads are built from — and does not use them for this. Views
cover the window case and the `next` protocol covers the stateful case, both without a
yield transform.

What is genuinely missing: there is no formal `Iterator` trait (the protocol is duck-typed on
the method name, which leaves nothing to write contracts against), and no `yield`-style
generators, so a complex traversal is a hand-written state machine.

## Dangling indices and type confusion

His objection to index-based data structures is that indices reintroduce two bugs references
prevent: an index outliving what it pointed at, and an index used against the wrong collection.

Milo's pool type is `Arena<T>` with a generational `Handle<T>`. Here is his string-interner
example with both failures exercised:

```milo
var a = Interner { pool: arenaNew<string>() }
var b = Interner { pool: arenaNew<string>() }
let ha = intern(a, "hello")
let hb = intern(b, "world")

arenaFree(a.pool, ha)
match arenaGet(a.pool, ha) { ... }         // stale handle -> None (generation bumped)

print($"hb valid in b: {arenaValid(b.pool, hb)}")   // true
print($"hb valid in a: {arenaValid(a.pool, hb)}")   // false
```

Type confusion across *different* element types is a compile error, because `Handle<T>` is
parameterized: a `Handle<Node>` will not typecheck against an `Arena<Token>`. Confusion between
two pools of the *same* type is caught at runtime — each arena carries an identity and rejects a
handle minted elsewhere, which is the `false` on the last line.

The staleness answer is weaker than Rust's and we state it that way. Rust rejects a stale
reference at compile time; Milo turns a stale handle into a deterministic `None` at runtime. The
correct claim is that pool indices **demote memory-unsafety to logic bugs** — a wrong handle
gives you a wrong value or a clean panic, never a corrupted heap. It does not eliminate the bug
class he's pointing at. Milo's route to closing the rest is the contracts profile: prove
`pool.contains(h)` statically and the check is elided, with the checked path as the default until
then.

## The part-whole conflict

His sharpest objection, and the one where our answer is only partial:

> If you're twenty stack frames deep and want to print the contents of a pool index, you need to
> pass the pool in.

The intended Milo answer is that a pool which outlives every frame lives at module scope, so no
frame has to carry it:

```milo
var gNodes: Vec<Node> = []

fn deep3(id: i64): void { print($"deep3 sees {gNodes[id].name}") }
fn deep2(id: i64): void { deep3(id) }
fn deep1(id: i64): void { deep2(id) }
```

That works, and it's what our JavaScript engine does for its object heap. But writing this post
turned up a limit: **an `Arena<T>` cannot be a module-scope variable today**, because module-level
initializers must be compile-time constants and `arenaNew<T>()` is a call. A `Vec` global works
(`[]` is a constant); an arena global does not, so the version of this pattern with generational
handles has to thread the arena as a parameter after all — exactly the tax he describes. Our own
ownership documentation had `var gNodes: Arena<Node>` at module scope as the sanctioned shape,
and it does not compile. The doc is corrected; the language gap is open.

## Closures

He notes the restrictions are unclear in Hylo. Milo's rule is short: **a closure cannot capture a
reference.** A closure environment is storage, references are second-class, and storage is
exactly what they may not enter.

```
error: cannot capture 's' in a closure
hint: 's' is a reference — a closure stores its captures, and a closure can outlive the
      storage this points into; capture an owned value (.clone() it) instead
```

Borrows still reach closure bodies — as parameters, which is the one place references are legal:

```milo
arenaModifyMut(a, h, (c: &mut Counter): void => { c.n = c.n + 41 })
let got = arenaWith(a, h, (c: &Counter): i64 => c.n)   // 42, no copy of the slot
```

That is the whole design: the reference is created by the call and dies with it, whether the
callee is a function or a closure body.

## Reference transforms

At the end of the article he proposes a relaxation — functions that turn a reference into a more
interior reference, chainable as `f(t(u(v(&x))))`, so that subscripting into a structure doesn't
require the whole thing.

Milo ships a restricted form of exactly this. A method may return a `&[T]` view of its receiver's
storage; the view can be re-sliced and passed down. The restrictions that keep it sound are the
provenance rule (the view must come from `self`) and the freeze (the receiver is immobile while
the view lives). Two further cases are rejected outright:

```
error: cannot take a view of a temporary
hint: the '&[T]' would outlive the value it points into — bind the receiver first

error: cannot return a view of 'other'
hint: a returned '&[T]' may only view the receiver's own storage ('self...')
```

## What this exercise cost us

Running his objections as a checklist found a real use-after-free in safe Milo code. A container
and a view into that container could be arguments to the same call:

```milo
fn grow(v: &mut Vec<i64>, s: &[i64]): void {
    var i = 0
    while i < 4096 { v.push(999); i = i + 1 }   // reallocates
    print($"{s[0]} {s[1]}")                      // s points at freed memory
}

var v: Vec<i64> = [11, 22, 33]
grow(v, v[0..2])        // accepted; printed "264327645419004074 1024"
```

`grow(v, v)` was rejected. `grow(v, v[0..2])` was not, because the call-site exclusivity check
only inspected arguments that were *auto-borrowed*, and a slice expression is already a `&[T]` —
it never entered that map. The `&mut [T]` version had the same hole in the other direction: the
write through the stale view landed in freed memory and was silently lost.

The fix is small — an argument counts as a borrow of its access path if its checked type is a
reference, whatever produced it, and a method returning a view roots at its receiver — and both
arms now have regression fixtures. Worth stating plainly: the model isn't what failed here. The
rule "a reference cannot outlive the call" was never violated. What failed was an implementation
that missed one way a reference gets made. A design being simple to check is not the same as
having checked it.

## Where he's still right

Three things the article implies that we haven't answered, listed because we would rather name
them than be caught denying them:

**Stored zero-copy.** A struct holding a borrow into a buffer it doesn't own — a borrowed AST, a
zero-copy deserializer — has no Milo equivalent. The answer is offset pairs into an owned buffer,
which costs the compile-time tie between the view and its buffer.

**Shared-memory data parallelism.** There is no `splitMut` handing N workers N disjoint windows
into one array. Milo bans the workload rather than checking it; multicore work goes through
message passing. The disjointness proof is linear arithmetic our prover can already discharge, so
this is a missing feature rather than a wall — but it is missing.

**Exclusivity between sibling views.** Two overlapping mutable slices of one `Vec` —
`f(v[0..2], v[1..3])` — are accepted. No `noalias` is emitted for reference parameters, so this
is defined behavior with bounds checks intact, and identical-address pairs are caught by a
runtime guard. It is still aliasing `&mut`, which Rust rejects, and partial overlap of constant
ranges is decidable statically. It's on the list.

## The scorecard

Of the objections in the article, exclusivity, closures, and reference transforms are settled.
Iteration is settled for the shapes that matter, with a formal iterator trait and generators
outstanding. Dangling and cross-pool confusion are demoted from memory-unsafety to deterministic
runtime errors rather than eliminated. The part-whole conflict is real, and one of our two
documented answers to it doesn't currently compile.

Borretti's conclusion was that Austral shouldn't take this trade, and given Austral's borrow
checker that follows. His larger point — that the trade is only worth making once someone shows
the patterns survive — is one we agree with, which is why the answers above are programs rather
than assertions. Two are still IOUs.
