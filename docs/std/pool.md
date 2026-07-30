# std/pool

## std/pool

### `Pool.alloc`

```milo
fn Pool.alloc(self: &mut Pool): Result<i64>
```

_Undocumented._

### `Pool.available`

```milo
fn Pool.available(self: &Pool): i64
```

_Undocumented._

### `Pool.empty`

```milo
fn Pool.empty(self: &Pool): bool
```

_Undocumented._

### `Pool.free`

```milo
fn Pool.free(self: &mut Pool, block: i64): void
```

_Undocumented._

### `Pool.full`

```milo
fn Pool.full(self: &Pool): bool
```

_Undocumented._

### `Pool.live`

```milo
fn Pool.live(self: &Pool): i64
```

Restate poolLive's preconditions (Pool has no struct invariant): without them the
wrapper can't discharge the callee's `requires`, so its own `ensures result >= 0`
is unbacked — same restating pattern as `free` above.

### `Pool.new`

```milo
fn Pool.new(size: i64, count: i64): Result<Pool>
```

_Undocumented._

### `Pool.reset`

```milo
fn Pool.reset(self: &mut Pool): void
```

_Undocumented._
