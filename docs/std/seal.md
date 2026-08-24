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

### `sealedByteAt`

```milo
pub fn sealedByteAt(s: &Sealed, i: i64): u8
```

The byte at `i`, bounds-checked. For a whole range prefer `text` or, to avoid the
allocation, `eq` and `each`.

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

Bytes held in the sealed buffer.

### `sealedSpan`

```milo
pub fn sealedSpan(s: &Sealed): Span
```

A span covering the whole buffer.

### `sealedSpanOf`

```milo
pub fn sealedSpanOf(s: &Sealed, start: i64, len: i64): Span
```

Measure a span against THIS buffer. The only way to get a span that resolves:
a hand-built Span carries `_bufferId` 0, which no buffer ever has.

### `sealedText`

```milo
pub fn sealedText(s: &Sealed, sp: Span): string
```

Materialise the span as an owned string. THIS is the allocation, and it is
the only one: naming it `text` rather than hiding it behind indexing is the
point, so a reader can see where the copies are.

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

### `Shared.each`

```milo
fn Shared.each(self: &Shared, sp: Span, f: (u8) => void): void
```

Read the span's bytes one at a time without materialising it.

### `Shared.eq`

```milo
fn Shared.eq(self: &Shared, sp: Span, other: &string): bool
```

Compare a span against a string without materialising it.

### `Shared.holders`

```milo
fn Shared.holders(self: &Shared): i64
```

How many holders are alive right now. A progress hint: by the time you read
it another thread may have cloned or dropped one. `thaw` is the operation
that acts on the count without a window between reading and using it.

### `Shared.holds`

```milo
fn Shared.holds(self: &Shared, sp: Span): bool
```

Whether `sp` fits here.

### `Shared.len`

```milo
fn Shared.len(self: &Shared): i64
```

Bytes held.

### `Shared.span`

```milo
fn Shared.span(self: &Shared): Span
```

A span over the whole buffer.

### `Shared.spanOf`

```milo
fn Shared.spanOf(self: &Shared, start: i64, len: i64): Span
```

Measure a span against this buffer.

### `Shared.text`

```milo
fn Shared.text(self: &Shared, sp: Span): string
```

Materialise the span as an owned string. The allocation, named.

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
