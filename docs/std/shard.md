# std/shard

## std/shard

### `Shard.get`

```milo
fn Shard.get(self: &Shard, i: i64): T
```

The element at `i` within THIS window. Bounds-checked against the window's own
length, so a stray index cannot reach a sibling window's elements.

### `Shard.index`

```milo
fn Shard.index(self: &Shard): i64
```

Which window of the shatter this is, counting from 0.

### `Shard.len`

```milo
fn Shard.len(self: &Shard): i64
```

Elements in this window.

### `Shard.set`

```milo
fn Shard.set(self: &mut Shard, i: i64, val: T): void
```

Overwrite the element at `i` within this window. Bounds-checked the same way.

### `Shard.start`

```milo
fn Shard.start(self: &Shard): i64
```

Where this window begins in the ORIGINAL buffer. Without it a worker can only
do position-independent work: a filter that needs to know which pixel, row or
sample it is looking at has no way to find out, because a window's own indices
all start at 0. Global position of element `i` is `start() + i`.

### `Shard.swap`

```milo
fn Shard.swap(self: &mut Shard, a: i64, b: i64): void
```

Exchange two elements of this window, for in-place sorts and partitions.

### `Shards.count`

```milo
fn Shards.count(self: &Shards): i64
```

How many windows this shatter divides into.

### `Shards.len`

```milo
fn Shards.len(self: &Shards): i64
```

Elements across all windows.

### `Shards.weld`

```milo
fn Shards.weld(self: Shards, returned: Vec<Shard<T>>): Result<Vec<T>, WeldError>
```

Reassemble: consume the owner and the windows, and hand back the original
Vec with its original allocation.

The checks are what keep a mistake a logic error instead of corruption: every
window must carry this shatter's identity, and the set must cover every index
exactly once. A missing window would mean some worker still holds a pointer
into this buffer, and returning the Vec then would be the use-after-free this
module exists to avoid.

### `Shards.windows`

```milo
fn Shards.windows(self: &mut Shards): Vec<Shard<T>>
```

The windows, once. A second call returns an empty Vec rather than a second
set of pointers to the same storage, which would hand out aliases and defeat
the whole design.

### `shatter`

```milo
pub fn shatter<T>(v: Vec<T>, n: i64): Shards<T>
```

Consume a Vec and return an owner that can hand out `n` disjoint windows over
its storage. O(1): nothing is copied, and the Vec's buffer is untouched.

`n` is clamped to at least 1 and at most the element count, so a caller asking
for more windows than elements gets one window per element rather than a pile
of empty ones aliasing the same address.

### `shatterStr`

```milo
pub fn shatterStr(s: string, n: i64): StrShards
```

Consume a string and return an owner that hands out `n` read-only windows.

### `StrShard.byteAt`

```milo
fn StrShard.byteAt(self: &StrShard, i: i64): u8
```

The byte at `i` within this window, bounds-checked against its length.

### `StrShard.index`

```milo
fn StrShard.index(self: &StrShard): i64
```

Which window of the shatter this is, counting from 0.

### `StrShard.len`

```milo
fn StrShard.len(self: &StrShard): i64
```

Bytes in this window, including any overlap it was given.

### `StrShard.matchesAt`

```milo
fn StrShard.matchesAt(self: &StrShard, i: i64, needle: &string): bool
```

Whether this window's bytes at `i` match `needle`. Bounded by the window, so a
needle running past the end is simply not a match here; give the window an
overlap if you need to catch one that straddles the boundary.

### `StrShard.start`

```milo
fn StrShard.start(self: &StrShard): i64
```

Where this window begins in the original string.

### `StrShards.count`

```milo
fn StrShards.count(self: &StrShards): i64
```

How many windows this shatter divides into.

### `StrShards.len`

```milo
fn StrShards.len(self: &StrShards): i64
```

Bytes in the underlying string, across all windows.

### `StrShards.weld`

```milo
fn StrShards.weld(self: StrShards, returned: Vec<StrShard>): Result<string, WeldError>
```

Give the string back. Windows are reads, so unlike the writing side there is no
coverage obligation; the identity check stays because a foreign window means the
caller has lost track of which shatter it is holding.

### `StrShards.windows`

```milo
fn StrShards.windows(self: &mut StrShards, overlap: i64): Vec<StrShard>
```

The windows, once. `overlap` extends each window that far into the next, so a
scanner looking for an `m`-byte needle passes `m - 1` and never has to stitch
the seams. Pass 0 for exactly disjoint windows.
