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
| [read part of it, right here](#read-part-of-a-string-without-copying-it) | a **view** — `line[0..4]` | compile time |
| [return it to your caller](#return-a-piece-of-a-string-to-your-caller) | **own it** — `substr` copies | nothing to check |
| [keep thousands of them, cheaply](#store-many-string-slices-without-an-allocation-each) | **seal + spans** — `std/seal` | runtime |

Then four more, for the structures those tokens live in:

- [a parser or cursor over text](#write-a-parser-or-cursor-over-text-you-do-not-own) — the `Parser<'a>` shape
- [a tree or AST that contains itself](#represent-a-tree-or-ast-that-contains-itself) — the `Box<Expr>` shape
- [a graph whose nodes point at each other](#build-a-tree-or-graph-whose-nodes-refer-to-each-other) — the `Rc<RefCell>` shape
- [keeping two kinds of index apart](#stop-two-kinds-of-index-from-being-mixed-up)

Failures below are labelled by *who catches them*: **✗ the compiler stops you** is the
protection working and costs nothing at runtime; **⚠ caught when it runs** is safe but
later; **✗ nothing catches it** is the one to actually avoid.

Looking for a specific Rust construct instead? The full shape-by-shape table lives in
[Memory Safety vs Rust](/language/vs-rust#the-rust-shape-and-what-to-write-instead).

## Read part of a string without copying it

Slice it. That is the whole thing:

```milo
pub fn main(): i32 {
    let line = "host=localhost"
    let key = line[0..4]       // a view into line, nothing copied
    print(key)
    return 0
}
```

```
host
```

::: code-group

```rust [Rust]
let key = &line[0..4];      // &str — needs a lifetime once it leaves this scope
```

```cpp [C++]
std::string_view key{line.data(), 4};   // dangles if line changes
```

```ts [TypeScript]
const key = line.slice(0, 4);           // copies
```

:::

**✗ The compiler stops you.** While `key` is alive, `line` is frozen. This is the C++
case above, caught:

```milo error
pub fn main(): i32 {
    var line = "host=localhost"
    let key = line[0..4]
    line = "port=8080"
    print(key)
    return 0
}
```

```
error: cannot assign to 'line' because it is borrowed
  hint: a reference or slice into this variable is still live — the assignment would
        invalidate it
```

**✗ The compiler stops you.** Views cannot be stored — no `Vec` of them, no struct field:

```milo error
pub fn main(): i32 {
    let line = "host=localhost"
    var keys: Vec<&string> = Vec.new()
    keys.push(line[0..4])
    return 0
}
```

```
error: 'keys': references cannot be stored in a collection
  hint: references are second-class — store owned values instead
```

### Returning one from a method

A method may hand back a view of its *own* storage. The receiver is frozen while the view
lives, so the two rules above still hold:

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
    print(cfg.key())
    return 0
}
```

```
host
```

Only of `self` — never of a local or another `&` parameter. That is the one place a
reference may be returned at all.

## Return a piece of a string to your caller

`substr` copies the bytes out. Always correct, nothing to check, one allocation per token
— fine until you are doing it thousands of times.

## Store many string slices without an allocation each

The parser case: a token per identifier in a large file, each outliving the function that
found it, without an allocation each. [`std/seal`](/stdlib/seal) is the answer. `seal` consumes the buffer and returns a `Sealed`, which has no
mutating method, so stored offsets cannot be invalidated. A `Span` is two integers
plus the identity of the buffer it was measured from, so it can live in a struct,
a `Vec`, or a map key.

**✓ Do this.** The span outlives the call; comparing through it allocates nothing:

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

**⚠ Caught, but only when it runs.** The trade: where Rust's `'a` gives a compile error,
Milo gives a named abort — safe, but later:

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

## Write a parser or cursor over text you do not own

::: code-group

```rust [Rust]
struct Lexer<'a> {
    src: &'a str,               // the lifetime is here
    pos: usize,
}
```

```cpp [C++]
struct Lexer {
    std::string_view src;       // dangles if the owner dies
    size_t pos;
};
```

```milo skip [Milo]
pub struct Lexer {
    src: string,                // owns its text — nothing to outlive
    pos: i64,
}
```

:::

A struct may not store a borrow, so the cursor **owns the buffer** and carries an integer
position, slicing on demand.

**✓ Do this.** No lifetime, no borrow stored, and `nextWord` can be called as often as
you like:

```milo
pub struct Lexer {
    src: string,
    pos: i64,
}

impl Lexer {
    fn atEnd(self: &Self): bool {
        return self.pos >= self.src.len
    }

    fn nextWord(self: &mut Self): string {
        while self.pos < self.src.len && self.src[self.pos] == ' ' {
            self.pos = self.pos + 1
        }
        let start = self.pos
        while self.pos < self.src.len && self.src[self.pos] != ' ' {
            self.pos = self.pos + 1
        }
        return self.src.substr(start, self.pos)
    }
}

pub fn main(): i32 {
    var lx = Lexer { src: "host = localhost", pos: 0 }
    while !lx.atEnd() {
        print(lx.nextWord())
    }
    return 0
}
```

```
host
=
localhost
```

`nextWord` returns an owned `string` — one allocation per token. If that matters, keep
the cursor exactly as it is and hand back
[spans instead](#store-many-string-slices-without-an-allocation-each): seal `src` once,
and return `Span` values that cost two integers each.

## Represent a tree or AST that contains itself

::: code-group

```rust [Rust]
enum Expr {
    Num(i64),
    Add(Box<Expr>, Box<Expr>),
}
```

```cpp [C++]
struct Expr {
    std::unique_ptr<Expr> l, r;
};
```

```milo skip [Milo]
enum Expr {
    Num(i64),
    Add(Heap<Expr>, Heap<Expr>),
}
```

:::

`Heap<T>` is the single-owner heap pointer, dereferenced with `*`. No lifetime, because
there is exactly one owner.

**✓ Do this:**

```milo
enum Expr {
    Num(i64),
    Add(Heap<Expr>, Heap<Expr>),
}

fn eval(e: &Expr): i64 {
    match e {
        Expr.Num(n) => { return n }
        Expr.Add(l, r) => { return eval(*l) + eval(*r) }
    }
}

pub fn main(): i32 {
    let tree = Expr.Add(
        Heap(Expr.Num(2)),
        Heap(Expr.Add(Heap(Expr.Num(3)), Heap(Expr.Num(4))))
    )
    print(eval(tree))
    return 0
}
```

```
9
```

This covers any tree that owns its children. When a node needs to point *back* at its
parent, or two nodes need to point at each other, ownership is no longer a tree — that is
the next section.

## Build a tree or graph whose nodes refer to each other

::: code-group

```rust [Rust]
type Link = Rc<RefCell<Node>>;   // runtime borrow check, can leak cycles
// or: slotmap / arena + generational index
```

```cpp [C++]
struct Node { Node* parent; };   // raw pointers, no checking at all
```

```milo skip [Milo]
var arena: Arena<Node> = Arena<Node>.new()
let h = arena.alloc(node)        // Handle: index + generation
```

:::

Put the values in one pool and refer to them by key. The obvious key is a `Vec` position,
and that is the trap: positions get reused.

**✗ Nothing catches this.** The index outlived the element it named — compiles, runs,
returns the wrong record:

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

**✓ Do this instead.** A `Handle` carries the position *plus* which arena issued it and
which occupant of the slot it was for. A stale one reads back as `None`:

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

## Stop two kinds of index from being mixed up

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
