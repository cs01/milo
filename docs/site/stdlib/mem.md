# std/mem

Memory mapping and bump allocation primitives.

> This is the raw bump allocator. For a generational arena with typed `Handle<T>`, see `std/arena` — that module owns the name `Arena`.

```milo
from "std/mem" import { MappedMemory, Bump, mmapAnon, mmapFile }
```

## Types

### MappedMemory

```milo
struct MappedMemory {
    ptr: i64,
    len: i64,
}
```

A region of memory-mapped address space.

### Bump

```milo
struct Bump {
    base: i64,
    cap: i64,
    used: i64,
}
```

A bump allocator backed by a contiguous heap region. All allocations are 8-byte
aligned and the whole region is freed on drop.

## Functions

### mmapAnon

```milo
fn mmapAnon(len: i64): Result<MappedMemory>
```

Maps `len` bytes of anonymous (zero-filled) memory.

### mmapFile

```milo
fn mmapFile(fd: i32, len: i64): Result<MappedMemory>
```

Memory-maps `len` bytes from file descriptor `fd`.

### Bump.new

```milo
fn Bump.new(capacity: i64): Result<Bump>
```

Creates a bump allocator with the given byte capacity.

### Bump.alloc

```milo
fn Bump.alloc(self: &mut Bump, size: i64): Result<i64>
```

Bump-allocates `size` bytes, returning a pointer. Fails if the allocator is full.

### Bump.reset

```milo
fn Bump.reset(self: &mut Bump): void
```

Resets the used counter to zero, reclaiming every allocation at once.

### Bump.remaining

```milo
fn Bump.remaining(self: &Bump): i64
```

Bytes still available.
