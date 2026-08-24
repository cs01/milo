# Patterns Without Lifetimes

Milo makes one big bet: **a reference can never be stored.** Not in a struct, not in a
collection, and not returned from a function, save one narrow case shown below. `&T`
exists only as a parameter, for the duration of one call. That is what buys the language
its total absence of lifetime annotations. There is no `'a` anywhere, because nothing can
outlive anything.

Whether that bet is worth taking comes down to a single question: how much real code can
you still write? So we counted. Across five Rust codebases of deliberately different
shape (a web framework, a CLI library, a C++ interop toolchain, a data indexer, and an
agentic CLI app) there were 2,553 lifetime annotations. **87% of them sit on a function
signature**, a borrow that lives for one call, and second-class references cover every
one. The remaining 13% sit on a *type* that stores a borrow, `Parser<'a>` and friends,
and those cannot be written here at all.

That 13% is what this page is about: the patterns we landed on to keep the language
usable, concise, and pleasant without first-class references, and what each one costs
you. Re-run the count yourself with `scripts/lifetime-census.py`.

Seven patterns. Find the shape you were reaching for, and read across.

| The shape you know | Write this instead | Checked |
|---|---|---|
| `&line[0..4]`, a slice you use right here | [a view](#read-part-of-a-string-without-copying-it) | compile time |
| a `&str` returned to your caller | [own it, `substr` copies](#return-a-piece-of-a-string-to-your-caller) | nothing to check |
| many `&str` kept at once | [seal the buffer, store spans](#store-many-string-slices-without-an-allocation-each) | runtime |
| `struct Parser<'a> { src: &'a str }` | [own the buffer, carry a position](#write-a-parser-or-cursor-over-text-you-do-not-own) | compile time |
| `Box<Expr>` for a self-containing type | [`Heap<Expr>`](#represent-a-tree-or-ast-that-contains-itself) | compile time |
| `Rc<RefCell<Node>>` for a graph | [an arena and a `Handle`](#build-a-tree-or-graph-whose-nodes-refer-to-each-other) | runtime |
| two integer index spaces, easily swapped | [a newtype for each](#stop-two-kinds-of-index-from-being-mixed-up) | compile time |

The **Checked** column is the price. Four keep the compile-time guarantee, one needs no
check at all because it copies, and two move the check to runtime. Failing cases
below are labelled the same way: **✗ the compiler stops you** costs nothing at runtime,
**⚠ caught when it runs** is safe but later, and **✗ nothing catches it** is the one to
actually avoid.

For a Rust construct not listed here, the full shape-by-shape table is in
[Memory Safety vs Rust](/language/vs-rust#the-rust-shape-and-what-to-write-instead).

## Read part of a string without copying it

Slice it. That is the whole thing:

```milo
fn shout(s: &string) {
    print(s.toUpper())
}

pub fn main(): i32 {
    let line = "host=localhost"
    let key = line[0..4]  // a view into line, nothing copied
    print(key)
    shout(key)            // goes anywhere a &string goes
    print(key.len)
    return 0
}
```

```
host
HOST
4
```

The view behaves like any other `&string`: pass it to a function, read its length, compare
it. No allocation happened, and no annotation was needed to make that safe.

::: code-group

```rust [Rust]
let key = &line[0..4];  // &str, needs a lifetime once it leaves this scope
```

```cpp [C++]
std::string_view key{line.data(), 4};  // dangles if line changes
```

```ts [TypeScript]
const key = line.slice(0, 4);  // copies
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

A view cannot leave the call. `substr` copies the bytes out, and the copy is an ordinary
owned `string` with no restrictions at all.

::: code-group

```rust [Rust]
fn key(line: &str) -> String {
    line[0..4].to_string()      // .to_string() is the copy
}
```

```ts [TypeScript]
function key(line: string): string {
    return line.slice(0, 4);    // already a copy
}
```

```milo skip [Milo]
fn key(line: &string): string {
    return line.substr(0, 4)    // substr copies
}
```

:::

**✓ Do this.** Everything section one forbade is now allowed: a *free* function returns
it, a struct stores it, and a `Vec` holds a pile of them:

```milo
pub struct Setting {
    key: string,
    value: string,
}

fn parseLine(line: &string): Setting {
    let sep = 4
    return Setting {
        key: line.substr(0, sep),
        value: line.substr(sep + 1, line.len),
    }
}

pub fn main(): i32 {
    var all: Vec<Setting> = Vec.new()
    all.push(parseLine("host=localhost"))
    all.push(parseLine("port=8080"))
    print(all[0].key)
    print(all[1].value)
    print(all.len)
    return 0
}
```

```
host
8080
2
```

Nothing is borrowed, so nothing is frozen and nothing can dangle. There is no rule to
learn here, which is the point: when a value has to outlive the call, owning it is always
correct.

The cost is one allocation per piece. For a config file that is invisible. For a tokeniser
over a large source file it is thousands of small allocations, and that is what the next
pattern is for.

## Store many string slices without an allocation each

The tokeniser case: one token per word in a large file, each surviving the function that
found it, and no allocation per token. A view cannot leave the call, and owning each token
means thousands of small copies. [`std/seal`](/stdlib/seal) is the third answer.

`seal` consumes the buffer and hands back a `Sealed`, which has no mutating method, so
stored offsets can never be invalidated. A `Span` is then just two integers plus the
identity of the buffer it came from, which makes it an ordinary value: it goes in a `Vec`,
a struct field, or a map key.

**✓ Do this.** `words` returns a `Vec<Span>` that outlives it, and no token was copied:

```milo
from "std/seal" import { seal, Sealed, Span }

// One span per word. Spans are plain values, so they survive the return.
fn words(src: &Sealed): Vec<Span> {
    var out: Vec<Span> = Vec.new()
    var i: i64 = 0
    while i < src.len() {
        while i < src.len() && src.byteAt(i) == ' ' {
            i = i + 1
        }
        let start = i
        while i < src.len() && src.byteAt(i) != ' ' {
            i = i + 1
        }
        if i > start {
            out.push(src.spanOf(start, i - start))
        }
    }
    return out
}

pub fn main(): i32 {
    let src = seal("host=localhost port=8080".clone())
    let toks = words(src)
    print(toks.len)
    for t in toks {
        print(src.text(t))
    }
    return 0
}
```

```
2
host=localhost
port=8080
```

Compare that to the first pattern: `Vec<&string>` is a compile error, and a `Vec<Span>` is
not, because a span borrows nothing. `src.text(t)` is what costs an allocation, and you pay
it only for the tokens you actually read. `src.eq(t, "host")` compares without one at all.

**⚠ Caught, but only when it runs.** A span carries which buffer it was measured against,
so resolving it elsewhere is a named abort rather than plausible-looking bytes from the
wrong string. This is the trade for storability: Rust's `'a` makes it a compile error:

```milo
from "std/seal" import { seal }

pub fn main(): i32 {
    let a = seal("host=localhost".clone())
    let b = seal("port=8080".clone())
    let key = a.spanOf(0, 4)
    print(b.text(key))     // measured against `a`, resolved against `b`
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
    src: &'a str,  // the lifetime is here
    pos: usize,
}
```

```cpp [C++]
struct Lexer {
    std::string_view src;  // dangles if the owner dies
    size_t pos;
};
```

```milo skip [Milo]
pub struct Lexer {
    src: string,  // owns its text, so nothing can outlive anything
    pos: i64,
}
```

:::

A struct may not store a borrow, so the cursor **owns the buffer** and carries an integer
position, slicing on demand.

**✓ Do this.** Because the cursor owns its text, `lexerFor` can build the string *and* a
cursor over it and return both as one value. That is the case Rust cannot write at all: a
`Lexer<'a>` borrowing a local would be returning a reference to something about to die.

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

// Builds the text AND the cursor over it, then hands both back as one value.
fn lexerFor(name: &string): Lexer {
    let text = name.clone() + " = localhost"
    return Lexer { src: text, pos: 0 }
}

pub fn main(): i32 {
    var lx = lexerFor("host")
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

The cursor is an ordinary owned value, so it can also live in a struct field, a `Vec`, or
a `HashMap`. None of that is available to a type carrying a lifetime.

`nextWord` returns an owned `string`, one allocation per token. If that matters, keep
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

// The tree is built here and handed back. One owner, moved to the caller.
fn build(): Expr {
    return Expr.Add(
        Heap(Expr.Num(2)),
        Heap(Expr.Add(Heap(Expr.Num(3)), Heap(Expr.Num(4))))
    )
}

pub fn main(): i32 {
    var trees: Vec<Expr> = Vec.new()
    trees.push(build())
    trees.push(Expr.Num(10))
    for t in trees {
        print(eval(t))
    }
    return 0
}
```

```
9
10
```

Because ownership is a tree, the whole thing moves as one value: built in a function,
returned, pushed into a `Vec`, and freed exactly once when the `Vec` goes. Nothing is
counted at runtime and nothing can be shared by accident.

This covers any tree that owns its children. When a node needs to point *back* at its
parent, or two nodes need to point at each other, ownership is no longer a tree — that is
the next section.

## Build a tree or graph whose nodes refer to each other

::: code-group

```rust [Rust]
type Link = Rc<RefCell<Node>>;  // runtime borrow check, can leak cycles
// or: slotmap / arena + generational index
```

```cpp [C++]
struct Node { Node* parent; };  // raw pointers, no checking at all
```

```milo skip [Milo]
var arena: Arena<Node> = Arena<Node>.new()
let h = arena.alloc(node)  // Handle: index + generation
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
    print(slots[idx])  // idx meant alice
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
    let _carol = arena.alloc(Session { user: "carol" })  // reuses the slot
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
