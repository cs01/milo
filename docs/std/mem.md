# std/mem

## std/mem

### `Arena.alloc`

```milo
fn Arena.alloc(self: &mut Arena, size: i64): Result<i64>
```

_Undocumented._

### `Arena.new`

```milo
fn Arena.new(capacity: i64): Result<Arena>
```

_Undocumented._

### `Arena.remaining`

```milo
fn Arena.remaining(self: &Arena): i64
```

_Undocumented._

### `Arena.reset`

```milo
fn Arena.reset(self: &mut Arena): void
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
