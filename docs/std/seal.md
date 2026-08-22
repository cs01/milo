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

### `Sealed.eqSpan`

```milo
fn Sealed.eqSpan(self: &Sealed, a: Span, b: Span): bool
```

Compare two spans in this buffer without materialising either.

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

### `Sealed.span`

```milo
fn Sealed.span(self: &Sealed): Span
```

A span over the whole buffer.

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

### `sealedByteAt`

```milo
pub fn sealedByteAt(s: &Sealed, i: i64): u8
```

_Undocumented._

### `sealedEach`

```milo
pub fn sealedEach(s: &Sealed, sp: Span, f: (u8) => void): void
```

Read the span's bytes one at a time without materialising it. The borrowing
form: `f` sees each byte, nothing is allocated.

### `sealedEq`

```milo
pub fn sealedEq(s: &Sealed, sp: Span, other: &string): bool
```

Compare a span against a string WITHOUT materialising it. This is what keeps
a scanner's keyword checks off the allocator: the common operation on a
retained piece is comparing it, not owning it.

### `sealedEqSpan`

```milo
pub fn sealedEqSpan(s: &Sealed, a: Span, b: Span): bool
```

Whether two spans name equal bytes in this buffer, again without copying.

### `sealedHolds`

```milo
pub fn sealedHolds(s: &Sealed, sp: Span): bool
```

Whether `sp` fits inside this buffer. Cheap; use it when a span from an
untrusted source might not belong here.

### `sealedLen`

```milo
pub fn sealedLen(s: &Sealed): i64
```

_Undocumented._

### `sealedSpan`

```milo
pub fn sealedSpan(s: &Sealed): Span
```

A span covering the whole buffer.

### `sealedText`

```milo
pub fn sealedText(s: &Sealed, sp: Span): string
```

Materialise the span as an owned string. THIS is the allocation, and it is
the only one: naming it `text` rather than hiding it behind indexing is the
point, so a reader can see where the copies are.

### `spanEnd`

```milo
pub fn spanEnd(s: Span): i64
```

One past the last byte. The half-open end, which is what substr wants.

### `spanIsEmpty`

```milo
pub fn spanIsEmpty(s: Span): bool
```

_Undocumented._

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
