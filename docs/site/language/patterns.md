# Patterns Without Lifetimes

Say you are parsing a config file and you hit this line:

```
host=localhost
```

You want to talk about the `host` part. Copying it out works, but if you are doing that
for every key in a large file you are allocating for text you already have in memory.
In Rust you would reach for `&str` and a lifetime. Milo has no lifetimes, so what do you
write?

Three answers, cheapest first. Use the first one that fits — each step down trades away
a compile-time guarantee for more freedom about where the value can live.

| You need to… | Use | Checked |
|---|---|---|
| read part of it, right here | a **view** — `line[0..4]` | compile time |
| keep it after the function returns | **own it** — `substr` copies | nothing to check |
| keep thousands of them, cheaply | **seal + spans** — `std/seal` | runtime |

Failures below are labelled by *who catches them*: **✗ the compiler stops you** is the
protection working and costs nothing at runtime; **⚠ caught when it runs** is safe but
later; **✗ nothing catches it** is the one to actually avoid.

Looking for a specific Rust construct instead? The full shape-by-shape table lives in
[Memory Safety vs Rust](/language/vs-rust#the-rust-shape-and-what-to-write-instead).

## Read part of a value you already own

The cheapest answer, and the one to try first. No allocation, and the compiler proves it
is safe. A method may return a view of storage reachable
through `self` — never of a local or another `&` parameter — and the call **freezes the
receiver** while the binding lives.

**✓ Do this.** `key()` hands back the `host` part of the line without copying it:

```milo
pub struct Config {
    line: string,
    sep: i64,
}

impl Config {
    fn key(self: &Self): &string {
        return self.line[0..self.sep]
    }
}

pub fn main(): i32 {
    var cfg = Config { line: "host=localhost", sep: 4 }
    let k = cfg.key()          // a view into cfg.line, nothing copied
    print(k)
    return 0
}
```

```
host
```

**✗ The compiler stops you — this is the protection working.** A view cannot be stored,
so there is no way to keep one past the expression that made it. In C++ this compiles and
dangles; here it is rejected before it runs:

```milo error
pub struct Config {
    line: string,
    sep: i64,
}

impl Config {
    fn key(self: &Self): &string {
        return self.line[0..self.sep]
    }
}

pub fn main(): i32 {
    var cfg = Config { line: "host=localhost", sep: 4 }
    var keys: Vec<&string> = Vec.new()
    keys.push(cfg.key())
    return 0
}
```

```
error: 'keys': references cannot be stored in a collection
  ──> patterns.milo:14:5
   │
14 │     var keys: Vec<&string> = Vec.new()
   │     ^
  hint: references are second-class — store owned values instead
```

**✗ The compiler stops you — this is the protection working.** While `k` is alive, `cfg`
is frozen. Replacing the line would leave `k` pointing at text that is no longer there,
which is precisely the use-after-free Rust spends a lifetime annotation to prevent:

```milo error
pub struct Config {
    line: string,
    sep: i64,
}

impl Config {
    fn key(self: &Self): &string {
        return self.line[0..self.sep]
    }
}

pub fn main(): i32 {
    var cfg = Config { line: "host=localhost", sep: 4 }
    let k = cfg.key()          // k views "host" inside cfg.line
    cfg.line = "port=8080"     // …and this would pull it out from under k
    print(k)
    return 0
}
```

```
error: cannot assign to 'cfg.line' because 'cfg' is borrowed
  ──> patterns.milo:16:5
   │
16 │     cfg.line = "port=8080"
   │     ^
  hint: a reference or slice into this variable is still live — the assignment would
        invalidate it
```

## Keep it after the function returns

A view cannot outlive the call, so if the value has to travel, own it. `substr` copies the
bytes out. Always correct, nothing to check, one allocation per token — which is fine
until you are doing it thousands of times.

## Keep thousands of them without thousands of copies

This is the parser case: you want a token per identifier in a large file, each one
outliving the function that found it, and you do not want an allocation per token.

[`std/seal`](/stdlib/seal) is the answer. `seal` consumes the buffer and returns a `Sealed`, which has no
mutating method, so stored offsets cannot be invalidated. A `Span` is two integers
plus the identity of the buffer it was measured from, so it can live in a struct,
a `Vec`, or a map key.

**✓ Do this.** The span outlives the call, and comparing through it allocates nothing:

```milo
from "std/seal" import { seal }

pub fn main(): i32 {
    let src = seal("host=localhost".clone())
    let key = src.spanOf(0, 4)         // the same "host" as above, but storable
    print(src.text(key))
    print(src.eq(key, "host").toString())
    return 0
}
```

```
host
true
```

**⚠ Caught, but only when it runs.** This is the trade for step 3: where Rust's `'a`
gives a compile error, Milo gives a named runtime abort. Still safe — you get a message
naming the cause, not wrong-but-plausible bytes — but later than the two cases above:

```milo
from "std/seal" import { seal }

pub fn main(): i32 {
    let a = seal("host=localhost".clone())
    let b = seal("port=8080".clone())
    let key = a.spanOf(0, 4)
    print(b.text(key))                 // measured against `a`, resolved against `b`
    return 0
}
```

```
assertion failed at std/seal.milo:156:5: sealed: span was measured against a different buffer
```

See [Memory Safety vs Rust](/language/vs-rust).

## When your data points at itself

Trees, graphs, doubly-linked lists — anything where one node refers to another. Put the
values in one pool and refer to them by key. The obvious key is a `Vec` position, and
that is the trap: positions get reused.

**✗ Avoid this — nothing catches it.** The index outlived the element it named. This
compiles, runs, and hands back the wrong record:

```milo
pub fn main(): i32 {
    var slots: Vec<string> = Vec.new()
    slots.push("alice")
    let idx = slots.len - 1
    slots.remove(idx)
    slots.push("carol")
    print(slots[idx])                  // idx meant alice
    return 0
}
```

```
carol
```

**✓ Do this instead.** `std/arena` gives a `Handle` — the position, plus which arena
issued it and which occupant of the slot it was for. A stale one reads back as `None`,
so the mistake becomes a value you must handle rather than a wrong answer:

```milo
from "std/arena" import { Arena }

pub struct Session {
    user: string,
}

pub fn main(): i32 {
    var arena: Arena<Session> = Arena<Session>.new()
    let h = arena.alloc(Session { user: "alice" })
    arena.free(h)
    let _carol = arena.alloc(Session { user: "carol" })   // reuses the slot
    match arena.get(h) {
        Option.Some(s) => { print(s.user) }
        Option.None => { print("None") }
    }
    return 0
}
```

```
None
```

Use a `Handle` wherever slots are recycled; a plain index is fine only for
append-only storage.

## When two pools could be confused

With several arenas, a key from one must not resolve in another. Both types are one
integer wide, so the check costs nothing at runtime.

**✗ The compiler stops you:**

```milo error
pub struct ExprId { index: i64 }
pub struct StmtId { index: i64 }

fn exprAt(id: ExprId): i64 {
    return id.index
}

pub fn main(): i32 {
    let s = StmtId { index: 3 }
    print(exprAt(s).toString())
    return 0
}
```

```
error: argument 1 of 'exprAt': expected ExprId, got StmtId
  ──> patterns.milo:10:18
   │
10 │     print(exprAt(s).toString())
   │                  ^
```

**✓ Do this:**

```milo
pub struct ExprId { index: i64 }
pub struct StmtId { index: i64 }

fn exprAt(id: ExprId): i64 {
    return id.index
}

pub fn main(): i32 {
    print(exprAt(ExprId { index: 3 }).toString())
    return 0
}
```

```
3
```

One sharp edge: a static method on a generic struct needs its type arguments
spelled out. `Arena<Node>.new()` works, bare `Arena.new()` is parsed as an enum
variant and fails.
