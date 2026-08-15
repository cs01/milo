# std/mem

## std/mem

### `Bump.alloc`

```milo
fn Bump.alloc(self: &mut Bump, size: i64): Result<i64>
```

_Undocumented._

### `Bump.new`

```milo
fn Bump.new(capacity: i64): Result<Bump>
```

Restate each callee's preconditions on the wrapper (Bump has no struct
invariant the solver models): without them the wrapper can't discharge the
free fn's `requires` — same restating pattern as Pool's free/live/available.

### `Bump.remaining`

```milo
fn Bump.remaining(self: &Bump): i64
```

_Undocumented._

### `Bump.reset`

```milo
fn Bump.reset(self: &mut Bump): void
```

_Undocumented._

### `mmapAnon`

```milo
pub fn mmapAnon(size: i64): Result<MappedMemory>
```

Allocate an anonymous (non-file-backed) memory-mapped region.

### `mmapFile`

```milo
pub fn mmapFile(fFd: i32, size: i64): Result<MappedMemory>
```

Memory-map a file descriptor for reading.
