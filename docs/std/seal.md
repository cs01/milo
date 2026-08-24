# std/seal

## std/seal

### `seal`

```milo
pub fn seal(s: string): Sealed
```

Consume a buffer and return it sealed. O(1): the bytes are moved, not copied.

### `Sealed.byteAt`

```milo
fn Sealed.byteAt(self: &Sealed, i: i64): u8
```

The byte at `i`, bounds-checked.

### `Sealed.each`

```milo
fn Sealed.each(self: &Sealed, sp: Span, f: (u8) => void): void
```

Visit each byte of `sp` without materialising it.

### `Sealed.eq`

```milo
fn Sealed.eq(self: &Sealed, sp: Span, other: &string): bool
```

Compare `sp` to a string without materialising it.

### `Sealed.holds`

```milo
fn Sealed.holds(self: &Sealed, sp: Span): bool
```

Whether `sp` fits here. Branch on this for a span you did not measure
yourself; `text` aborts instead.

### `Sealed.len`

```milo
fn Sealed.len(self: &Sealed): i64
```

Bytes held.

### `Sealed.share`

```milo
fn Sealed.share(self: Sealed): Shared
```

Consume this buffer and return a shareable holder of the same bytes.

### `Sealed.span`

```milo
fn Sealed.span(self: &Sealed): Span
```

A span over the whole buffer.

### `Sealed.spanOf`

```milo
fn Sealed.spanOf(self: &Sealed, start: i64, len: i64): Span
```

Measure a span against this buffer. Use this rather than building a Span by
hand: a hand-built one carries _bufferId 0 and will not resolve anywhere.

### `Sealed.text`

```milo
fn Sealed.text(self: &Sealed, sp: Span): string
```

Materialise `sp` as an owned string. The allocation lives here.

### `Sealed.unseal`

```milo
fn Sealed.unseal(self: Sealed): string
```

Give the buffer back, mutable. Consumes this Sealed.

### `share`

```milo
pub fn share(s: Sealed): Shared
```

Consume a `Sealed` and return a shareable holder of the same bytes. O(1): the
buffer is moved into the box, never copied.

### `Shared.byteAt`

```milo
fn Shared.byteAt(self: &Shared, i: i64): u8
```

The byte at `i`, bounds-checked.

### `Shared.clone`

```milo
fn Shared.clone(self: &Shared): Shared
```

Another holder of the same bytes. No copy; the buffer is released when the
last holder drops.

### `Shared.holders`

```milo
fn Shared.holders(self: &Shared): i64
```

How many holders are alive right now. A progress hint: by the time you read
it another thread may have cloned or dropped one. `thaw` is the operation
that acts on the count without a window between reading and using it.

### `Shared.len`

```milo
fn Shared.len(self: &Shared): i64
```

Bytes held.

### `sharedWith`

```milo
pub fn sharedWith<R>(sh: &Shared, f: (&Sealed) => R): R
```

Read the shared buffer through a borrow: `f` gets the `Sealed` itself, so the whole
reader API is available on it and nothing is copied.

    let name = sharedWith(sh, (s: &Sealed): string => s.text(sp))
    let ok   = sharedWith(sh, (s: &Sealed): bool => s.eq(sp, "name"))

This is the accessor because Milo cannot return a `&Sealed`, so `Shared` cannot
delegate through a deref the way `Arc<T>` does. The alternative was re-exposing every
reader by hand on `Shared`, two lists that drift apart the moment one gains a method.
One borrow point replaces the list.

Free function, not a method: `R` is a parameter of the operation rather than of
`Shared`, and a method's own type parameter is never inferred at the call site. Same
reason `std/arena` spells its read as `arenaWith`.

`len` and `byteAt` stay on `Shared` directly: a worker calls those per byte in a loop,
where a closure per read is the wrong shape.

### `thaw`

```milo
pub fn thaw(sh: Shared): Result<Sealed, ThawRejected>
```

Recover the `Sealed` when this is the only holder alive.

Refused while another holder exists, because handing the buffer back would let
it be unsealed and mutated under readers that are still reading it. The refusal
returns the `Shared` unharmed.

### `unseal`

```milo
pub fn unseal(s: Sealed): string
```

Hand the buffer back, mutable again. Consumes the Sealed, so no span holder
can still be relying on it through THIS binding.

Spans measured against it are of course still just integers, and will read a
buffer that is now free to change. That is the same offsets-by-convention
situation this module exists to replace, so unseal is the point at which the
guarantee ends, deliberately and visibly.
