# std/uuid

RFC 9562 UUIDs as a 16-byte value type.

```milo
from "std/uuid" import { Uuid }
```

`Uuid` is a plain 16-byte value — Copy, no heap, no resource — so it is passed
and stored like an integer. `toString()` is the only allocating operation.

```milo
let id = Uuid.v7()               // time-ordered; prefer this for database keys
print(id.toString())             // "019fcb1a-78ff-709f-8475-54c6d59b0057"

let random = Uuid.v4()           // 122 random bits
print(random.version())          // 4

if let Some(parsed) = Uuid.parse("550e8400-e29b-41d4-a716-446655440000") {
    print(parsed == Uuid.nil())  // false
}
```

## Constructors

### Uuid.v4

```milo
fn Uuid.v4(): Uuid
```

Random UUID (version 4): 122 random bits from the OS CSPRNG.

### Uuid.v7

```milo
fn Uuid.v7(): Uuid
```

Time-ordered UUID (version 7): a 48-bit Unix-epoch millisecond prefix, a 12-bit
monotonic counter, then random bits. Ids minted inside the same millisecond still
sort in creation order, so the lexicographic order of the text form matches
creation order. That property is what makes v7 the better default for database
keys. The counter is per process and is not synchronized across threads — a
racing thread can reuse a counter value, which costs ordering but not uniqueness.

### Uuid.nil

```milo
fn Uuid.nil(): Uuid
```

The all-zero UUID, `00000000-0000-0000-0000-000000000000`.

### Uuid.parse

```milo
fn Uuid.parse(s: &string): Option<Uuid>
```

Parses the canonical 8-4-4-4-12 hex form, case-insensitively. Returns `None` for
anything else — no braces, no `urn:uuid:` prefix, no unhyphenated form.

## Methods

### toString

```milo
fn Uuid.toString(self: &Uuid): string
```

Canonical lowercase text form, 36 characters.

### isNil

```milo
fn Uuid.isNil(self: &Uuid): bool
```

True for the all-zero UUID.

### version

```milo
fn Uuid.version(self: &Uuid): i32
```

Version nibble: 4 for v4, 7 for v7, 0 for the nil UUID.

### variant

```milo
fn Uuid.variant(self: &Uuid): i32
```

Variant field: 2 for the RFC 4122/9562 variant (`10xx`), 0 for the nil UUID and
other NCS-reserved values, 6 for the legacy Microsoft variant, 7 reserved.

### timestampMs

```milo
fn Uuid.timestampMs(self: &Uuid): i64
```

Unix-epoch milliseconds encoded in a v7 UUID. Meaningless for other versions, so
check `version() == 7` first.

## Equality and raw bytes

`Uuid` implements `Eq`, so `==` and `!=` compare all 16 bytes. The `bytes` field
is the canonical big-endian representation: read it for binary interop, and build
a `Uuid` from foreign bytes with `Uuid { bytes: raw }`.
