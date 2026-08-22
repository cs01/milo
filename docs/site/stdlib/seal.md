# std/seal

`seal` turns a buffer you own into a buffer nobody can change, so you can keep offsets into it and store them anywhere without the offsets going bad.

This is the zero-copy tool. A lexer, parser, or deserializer wants to hold on to thousands of small pieces of a large input. Copying each piece into its own string means one allocation per piece. Milo will not let you store a `&string` instead, because references are second-class. So keep `(start, len)` pairs and resolve them against the buffer when you actually need the bytes.

The catch with offsets has always been that nothing stops the buffer changing underneath them. `seal` removes that possibility rather than checking for it: a `Sealed` has no method that mutates.

```milo
from "std/seal" import { Sealed, Span, seal }
```

## Quick start

```milo
from "std/seal" import { Sealed, Span, seal }

pub fn main(): i32 {
    var buf: string = "{\"name\":\"milo\"}"
    let src = seal(buf)              // buf is moved; it cannot be changed again

    let name: Span = Span { start: 9, len: 4 }

    print(src.text(name))            // "milo" — this is the allocation
    print(src.eq(name, "milo").toString())   // "true" — this one allocates nothing
    return 0
}
```

## Why the offsets stay valid

Two things are true at once, and together they are the whole guarantee:

- `seal` **consumes** the buffer. The old binding is moved, so the compiler rejects any later use of it. `buf.push('x')` after the seal does not compile.
- `Sealed` **has no mutating method**. There is no `push`, no `set`, no `resize`. Mutation is not rejected by a check that could have a hole in it; it is absent from the type.

So there is no path, safe or otherwise, that changes the bytes a span points at while the `Sealed` is alive.

## Span is plain data

```milo
from "std/seal" import { Span }

struct Token {
    kind: i64,
    at: Span,
}
```

A `Span` is two integers. No pointer, no hidden state, `Copy`. Put it in a struct field, a `Vec`, a map key, or a serialised record. It costs nothing to keep and it touches memory only when you resolve it against a `Sealed`.

## Compare without copying

The operation a scanner performs most on a retained piece is comparing it, not owning it. Doing that through `text` would allocate once per comparison, which defeats the point:

```milo
from "std/seal" import { Sealed, Span, seal }

pub fn main(): i32 {
    var buf: string = "let x = 1"
    let src = seal(buf)
    let word: Span = Span { start: 0, len: 3 }

    print(src.eq(word, "let").toString())    // true, no allocation
    print(src.text(word))                    // "let", one allocation
    return 0
}
```

Use `eq` and `eqSpan` in the hot path. Reach for `text` only when you genuinely need to own the bytes.

## Getting the buffer back

`unseal` consumes the `Sealed` and returns the buffer, mutable again:

```milo
from "std/seal" import { seal }

pub fn main(): i32 {
    var buf: string = "hello"
    let src = seal(buf)
    var back = src.unseal()
    back.push('!')
    print(back)                              // "hello!"
    return 0
}
```

This is the staged pipeline: build, seal, parse and share, unseal, mutate, seal again. Spans you measured before the unseal are still just integers, and the buffer is free to change again, so that is exactly where the guarantee ends.

## What this does not protect against

A span carries no record of which buffer it was measured from. Resolve one against a different `Sealed` and you get the wrong bytes, or an abort if the range does not fit. That is a logic error, deterministic and never memory-unsafety, but it is a real gap: tying a span to one specific buffer at compile time needs a lifetime or a brand to carry the tie, and neither exists in this language. Use `holds` to check a span you did not measure yourself.

See [how Milo compares to Rust](/language/vs-rust) for the honest accounting of what this closes and what it does not.
