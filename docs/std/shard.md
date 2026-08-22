# std/shard

## std/shard

### `Shard.get`

```milo
fn Shard.get(self: &Shard, i: i64): T
```

_Undocumented._

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

_Undocumented._

### `Shard.swap`

```milo
fn Shard.swap(self: &mut Shard, a: i64, b: i64): void
```

_Undocumented._

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
