# Patterns Without Lifetimes

What to write when the Rust shape you know reaches for `<'a>`, `Box`, or
`Rc<RefCell>`. Every linked example compiles today.

| Problem | Rust | Milo |
|---|---|---|
| Zero-copy view inside a scope | `&s[6..11]` | `s[6..11]`, a `&string` view, no allocation |
| Zero-copy view returned to a caller | `fn items(&self) -> &[T]` | same: a method may return a view of its receiver's own storage, and the receiver is frozen while the view lives |
| Recursive data (tree, AST) | `Box<Expr>` | `Heap<Expr>`, dereferenced with `*l` |
| Doubly-linked list | `Rc<RefCell<Node>>` or `unsafe` | arena + `Option<Handle<Node>>`, [linkedList.milo](https://github.com/milo-language/milo/blob/main/examples/basics/linkedList.milo) |
| Cyclic graph, cross-references | `petgraph`, arena + indices, or `Rc` | `Arena<Node>` + `Vec<Handle<Node>>` for edges, [depgraph.milo](https://github.com/milo-language/milo/blob/main/examples/basics/depgraph.milo) |
| Tree with parent pointers (DOM) | `Rc<RefCell>` or an arena crate | `Arena<Node>`, parent and children as handles, [domArena.milo](https://github.com/milo-language/milo/blob/main/examples/basics/domArena.milo) |
| Long-lived state across tasks | `Arc<Mutex<T>>` | one owner holds the `Arena<T>` and passes handles; a module-scope `var pool: Arena<Node> = Arena<Node>.new()` works |
| Shared mutable state between workers | `Arc<Mutex<T>>` | one task owns it, the others `send` to it over a `Channel<T>` |
| Shared **immutable** data between workers | `Arc<[u8]>` | [`std/seal`](/stdlib/seal): `seal` then `share`, cloned per reader, no copy |
| Parallel map over one array | `rayon` `par_iter_mut` | [`std/shard`](/stdlib/shard): `parallelMap(v, n, f)`, or `parallelMapWith` for a worker pool and per-worker state |
| Spawn and join | `thread::spawn` + `handle.join()` | `Task.spawn` + `Task.join`, or a `WaitGroup` for a fleet |
| Wait on first of several sources | `tokio::select!` | `std/select` |
| Cursor or iterator holding a borrow | `struct Cur<'a> { buf: &'a [u8] }` | own the buffer, carry an integer `pos`, slice on demand |
| **Struct that stores a borrow** | `struct Parser<'a> { src: &'a str }` | **no equivalent.** [Three answers below](#when-a-slice-has-to-outlive-the-call) |

## When a slice has to outlive the call

The last row is the one real gap, and it shows up as "I want a token that points
into the source". Rust's `'a` exists for exactly this. Three answers; use the
first that fits, since each step down trades away compile-time guarantee.

### 1. Hand back a view

Zero-copy, checked at compile time. A method may return a view of storage reachable
through `self` — never of a local or another `&` parameter — and the call **freezes the
receiver** while the binding lives.

**Works.** `key()` hands back the `host` part of the line without copying it:

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

**Does not compile.** A view cannot be stored, so there is no way to keep one past the
expression that made it — no `Vec` of them, no struct field, no return to a caller
that outlives `cfg`:

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

**Does not compile.** While `k` is alive, `cfg` is frozen — replacing the line would
leave `k` pointing at text that is no longer there:

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

### 2. Own the text

`substr` copies the bytes out. Always correct, no checks, one allocation per
token.

### 3. Seal the buffer and store spans

When tokens must outlive the call, [`std/seal`](/stdlib/seal) is this pattern
built and tested. `seal` consumes the buffer and returns a `Sealed`, which has no
mutating method, so stored offsets cannot be invalidated. A `Span` is two integers
plus the identity of the buffer it was measured from, so it can live in a struct,
a `Vec`, or a map key.

**Works.** The span outlives the call, and comparing through it allocates nothing:

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

**Aborts at runtime.** This is the trade: where Rust's `'a` gives a compile error,
resolving a span against the wrong buffer is a named failure rather than
wrong-but-plausible bytes:

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

## Use a handle, not an array index

When data points at itself, put the values in one pool and refer to them by key.
The obvious key is a `Vec` position, and that is the trap: positions get reused.

**Wrong answer, no complaint.** The index outlived the element it named:

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

**Works.** `std/arena` gives a `Handle` — the position, plus which arena issued it and
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

### Give each pool its own key type

With several arenas, a key from one must not resolve in another. Both types are one
integer wide, so the check costs nothing at runtime.

**Does not compile:**

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

**Works:**

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
