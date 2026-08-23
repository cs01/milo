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

Zero-copy and checked at compile time. The caller must read the view where it
stands, because a view cannot be stored.

```milo
pub struct Source {
    data: Vec<u8>,
    keyEnd: i64,
}

impl Source {
    fn key(self: &Self): &[u8] {
        return self.data[0..self.keyEnd]
    }
}

pub fn main(): i32 {
    var cfg = Source { data: [100 as u8, 98 as u8, 58 as u8], keyEnd: 2 }
    let k = cfg.key()                  // borrowed from cfg, not copied
    print(k.len.toString())

    // var saved: Vec<&[u8]> = Vec.new()   // references cannot be stored in a collection
    // cfg.data.push(65 as u8)             // cfg is borrowed while k is alive
    return 0
}
```

Two rules make this sound and the compiler enforces both. A method may return a
view only of storage reachable through `self`, never of a local or another `&`
parameter. And a call returning a view **freezes the receiver** while the binding
lives: `cfg` cannot be grown, reassigned, moved, or dropped.

### 2. Own the text

`substr` copies the bytes out. Always correct, no checks, one allocation per
token.

### 3. Seal the buffer and store spans

When tokens must outlive the call, [`std/seal`](/stdlib/seal) is this pattern
built and tested. `seal` consumes the buffer and returns a `Sealed`, which has no
mutating method, so stored offsets cannot be invalidated. A `Span` is two integers
plus the identity of the buffer it was measured from, so it can live in a struct,
a `Vec`, or a map key, and resolving it against the wrong buffer is a named
failure rather than wrong-but-plausible bytes.

```milo
from "std/seal" import { seal, unseal }

pub fn main(): i32 {
    let src = seal("database_url: postgres".clone())
    let key = src.spanOf(0, 12)
    print(src.text(key))               // database_url
    print(src.eq(key, "database_url").toString())   // true, no allocation
    return 0
}
```

This is a runtime check where Rust's `'a` gives a compile error, and that is the
trade. See [Memory Safety vs Rust](/language/vs-rust).

## Use a handle, not an array index

When data points at itself, put the values in one pool and refer to them by key.
The obvious key is a `Vec` position, and that is the trap: positions get reused.
`std/arena` gives a `Handle`, which is the position plus which arena issued it and
which occupant of the slot it was for.

```milo
from "std/arena" import { Arena }

pub struct Session {
    user: string,
}

pub fn main(): i32 {
    // a raw index into a Vec
    var slots: Vec<string> = Vec.new()
    slots.push("alice")
    let idx = slots.len - 1
    slots.remove(idx)
    slots.push("carol")
    print("raw index: " + slots[idx])              // raw index: carol

    // the same thing with a generational handle
    var arena: Arena<Session> = Arena<Session>.new()
    let h = arena.alloc(Session { user: "alice" })
    arena.free(h)
    let _carol = arena.alloc(Session { user: "carol" })
    match arena.get(h) {
        Option.Some(s) => { print("handle: " + s.user) }
        Option.None => { print("handle: None") }   // handle: None
    }
    return 0
}
```

The raw index reads `carol` with no complaint, a wrong answer rather than a crash.
Use a `Handle` wherever slots are recycled; a plain index is fine only for
append-only storage.

With several arenas, give each key its own type so mixing them up is a compile
error. Both types are one integer wide, so the check is free.

```milo
pub struct ExprId { index: i64 }
pub struct StmtId { index: i64 }

fn exprAt(id: ExprId): i64 {
    return id.index
}

pub fn main(): i32 {
    let s = StmtId { index: 3 }
    // exprAt(s)   // error: argument 1 of 'exprAt': expected ExprId, got StmtId
    print(exprAt(ExprId { index: 3 }).toString())
    return 0
}
```

One sharp edge: a static method on a generic struct needs its type arguments
spelled out. `Arena<Node>.new()` works, bare `Arena.new()` is parsed as an enum
variant and fails.
