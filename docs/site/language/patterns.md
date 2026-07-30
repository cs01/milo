# Patterns Without Lifetimes

What to write when the Rust shape you know reaches for `<'a>`, `Box`, or
`Rc<RefCell>`. Every example links to a program in the repo that compiles today.

| Problem | Rust | Milo |
|---|---|---|
| Zero-copy view inside a scope | `&s[6..11]` | `s[6..11]` — a `&string` view, no allocation |
| Zero-copy view returned to a caller | `fn items(&self) -> &[T]` | same — a method may return a view of its receiver's own storage |
| Recursive data (tree, AST) | `Box<Expr>` | `Heap<Expr>`, dereferenced with `*l` |
| Doubly-linked list | `Rc<RefCell<Node>>` or `unsafe` | arena + `Option<Handle<Node>>` — [linkedList.milo](https://github.com/milo-language/milo/blob/main/examples/basics/linkedList.milo) |
| Cyclic graph, cross-references | `petgraph`, arena + indices, or `Rc` | `Arena<Node>` + `Vec<Handle<Node>>` for edges — [depgraph.milo](https://github.com/milo-language/milo/blob/main/examples/basics/depgraph.milo) |
| Tree with parent pointers (DOM) | `Rc<RefCell>` or an arena crate | `Arena<Node>`, parent and children as handles — [domArena.milo](https://github.com/milo-language/milo/blob/main/examples/basics/domArena.milo) |
| Long-lived state across tasks | `Arc<Mutex<T>>` | module-scope `var pool: Arena<T>`, pass handles |
| Cursor or iterator holding a borrow | `struct Cur<'a> { buf: &'a [u8] }` | own the buffer, carry an integer `pos`, slice on demand |
| **Struct that stores a borrow** | `struct Parser<'a> { src: &'a str }` | **no equivalent** — own the buffer, or index into one you own |

## Long-lived slices: pick a rung

That last row is the one real gap, and it shows up as "I want a token that
points into the source." Three answers, cheapest guarantee last:

**1. Hand back a view, not an offset.** The view *is* the bytes, so there is no
span that can be paired with the wrong buffer. Compile-time safe and zero-copy —
but a view cannot be stored in a struct or a collection, so this works when the
caller consumes it before moving on.

```milo
impl Source {
    fn key(self: &Self): &[u8] { return self.data[0..self.keyEnd] }
}
```

**2. Own the text.** `substr` copies. Boring, always correct, costs an
allocation per token.

**3. Brand the offset.** When tokens must outlive the call — a `Vec<Token>` —
carry the identity of the buffer they were cut from, the same way `Handle`
carries the identity of its arena. A span from another buffer then reads as
absent instead of silently slicing the wrong bytes:

```milo
fn slice(self: &Source, s: Span): Option<string> {
    if s.srcId != self.id { return Option.None }
    if s.start + s.len > self.text.len { return Option.None }
    return Option.Some(self.text.substr(s.start, s.start + s.len))
}
```

Rung 3 is a runtime check where Rust's `'a` would be a compile error. That is
the trade, stated plainly — see [Memory Safety vs Rust](/language/vs-rust).

## Handles are not raw indices

A bare `Vec` index is the failure mode people expect from this model: free a
slot, allocate another, and the old index now reads someone else's value. A
generational `Handle` from `std/arena` carries the arena's identity and the
slot's generation, so a stale one reads `None` and a double free is refused.
Use `Handle` wherever slots are recycled; a plain index is fine only for
append-only storage that never frees.

Give each arena's key its own type when a program has several — an `ExprId` that
cannot be passed where a `StmtId` belongs is a compile error, and costs nothing
at runtime.
