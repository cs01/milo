# Patterns Without Lifetimes

This page shows what to write when the Rust shape you know would reach for
`<'a>`, `Box`, or `Rc<RefCell>`. Every linked example is a program in the repo
that compiles today.

| Problem | Rust | Milo |
|---|---|---|
| Zero-copy view inside a scope | `&s[6..11]` | `s[6..11]` — a `&string` view, no allocation |
| Zero-copy view returned to a caller | `fn items(&self) -> &[T]` | same — a method may return a view of its receiver's own storage |
| Recursive data (tree, AST) | `Box<Expr>` | `Heap<Expr>`, dereferenced with `*l` |
| Doubly-linked list | `Rc<RefCell<Node>>` or `unsafe` | arena + `Option<Handle<Node>>` — [linkedList.milo](https://github.com/milo-language/milo/blob/main/examples/basics/linkedList.milo) |
| Cyclic graph, cross-references | `petgraph`, arena + indices, or `Rc` | `Arena<Node>` + `Vec<Handle<Node>>` for edges — [depgraph.milo](https://github.com/milo-language/milo/blob/main/examples/basics/depgraph.milo) |
| Tree with parent pointers (DOM) | `Rc<RefCell>` or an arena crate | `Arena<Node>`, parent and children as handles — [domArena.milo](https://github.com/milo-language/milo/blob/main/examples/basics/domArena.milo) |
| Long-lived state across tasks | `Arc<Mutex<T>>` | module-scope `var pool: Arena<T>`, pass handles |
| Shared mutable state between workers | `Arc<Mutex<T>>` | one task owns it; the others `send` to it over a `Channel<T>` |
| Spawn and join | `thread::spawn` + `handle.join()` | `Task.spawn` + `Task.join`, or a `WaitGroup` for a fleet |
| Wait on first of several sources | `tokio::select!` | `std/select` |
| Parallel map over one array | `rayon` `par_iter_mut` | not yet — `&mut [T]` views and `splitMut` are unimplemented |
| Cursor or iterator holding a borrow | `struct Cur<'a> { buf: &'a [u8] }` | own the buffer, carry an integer `pos`, slice on demand |
| **Struct that stores a borrow** | `struct Parser<'a> { src: &'a str }` | **no equivalent** — own the buffer, or index into one you own |

## When a slice has to outlive the call

That last row is the one real gap, and it shows up as "I want a token that points
into the source." This is the shape Rust's `'a` exists for — an acyclic borrow
into stable storage — so it is the one place where you have to make a choice.

Here are three answers. Use the first one you can, and drop to the next only when
the one above it does not fit, because each step down trades away some of the
compile-time guarantee.

**1. Hand back a view instead of an offset.** The view is the bytes themselves,
so there is no separate span that could be paired with the wrong buffer. This is
zero-copy and checked at compile time. A view cannot be stored in a struct or a
collection, so it fits when the caller reads it before moving on.

```milo
impl Source {
    fn key(self: &Self): &[u8] { return self.data[0..self.keyEnd] }
}
```

**2. Own the text.** Calling `substr` copies the bytes out, which is always
correct and needs no checks at all. You pay one allocation per token.

**3. Brand the offset.** When the tokens have to outlive the call — when you are
building a `Vec<Token>`, say — have each span carry the identity of the buffer it
was cut from, the same way a `Handle` carries the identity of its arena. A span
from another buffer then reads as absent rather than silently slicing the wrong
bytes.

```milo
fn slice(self: &Source, s: Span): Option<string> {
    if s.srcId != self.id { return Option.None }
    if s.start + s.len > self.text.len { return Option.None }
    return Option.Some(self.text.substr(s.start, s.start + s.len))
}
```

The third answer is a runtime check in a place where Rust's `'a` would have given
you a compile error, and that is the trade this language makes. See
[Memory Safety vs Rust](/language/vs-rust).

## Handles are not raw indices

A bare `Vec` index is the failure mode people expect from this model: you free a
slot, allocate another, and the old index now reads someone else's value. A
generational `Handle` from `std/arena` carries both the arena's identity and the
slot's generation, so a stale handle reads as `None` and a double free is
refused. Use a `Handle` wherever slots are recycled. A plain index is fine only
for append-only storage that never frees anything.

When a program has several arenas, give each one's key its own type. An `ExprId`
that cannot be passed where a `StmtId` belongs is a compile error, and it costs
nothing at runtime.
