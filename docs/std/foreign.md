# std/foreign

## std/foreign

### `adopt`

```milo
pub fn adopt<T>(p: *T): Option<Heap<T>>
```

Take ownership of a Milo allocation back through a raw pointer: the inverse of
`forget`.

`forget(x)` ends a value's ownership without running its drop, for the seam where
ownership leaves through a pointer the checker cannot see. Nothing took it back, so a
library that allocated a struct in Milo, handed C the pointer and later got it returned
had no way to free it, which is the shape of every C-ABI close/destroy entry point.
`adopt` is that return trip. The `Heap<T>` it hands back is owned in full: it drops at
the end of its scope, that drop frees the allocation, and the move checker treats it
exactly as it treats a `Heap<T>` from `Heap(value)`.

Returns `Option.None` iff `p` is null, the same answer and for the same reason as
`withRaw`: the null path is in the return type so it cannot be forgotten.

What the caller asserts by writing `unsafe`, and it is the whole content of the word
here: `p` came from a Milo allocation of a `T` with this exact layout, nothing else
aliases it, and it has NOT BEEN ADOPTED BEFORE. The last one is the sharp edge:
adopting the same pointer twice hands out two owners of one allocation and the second
drop is a double free. There is no runtime tag to catch that; a pointer that never
passed through Milo's own bookkeeping cannot carry one.

The allocator is plain libc `malloc`/`free` (src/codegen.ts emits `call ptr @malloc`
for `Heap(v)` and `call void @free` in the drop glue), so the round trip is symmetric
in both directions: a pointer Milo allocated can be handed to C's `free`, and a pointer
C `malloc`'d can be adopted, provided the size and layout really match a `T`.

What `adopt` does NOT do: an `extern struct` whose fields are raw pointers owns none of
them. A raw pointer has no drop glue, so dropping the adopted `Heap<T>` frees the
struct itself and nothing it points at. That matches C and is what makes the layout an
ABI match in the first place, but it means a C-shaped object graph still needs an
explicit teardown that walks the raw fields and frees them BEFORE the adopted box drops.
See docs/foreign-memory.md.

### `adoptSlice`

```milo
pub fn adoptSlice<T>(p: *T, len: i64): Option<Vec<T>>
```

`adopt` for a contiguous run of `len` elements: hands back an owned `Vec<T>`.

Same contract, plus the extent. A negative `len` answers `Option.None` rather than
building a Vec whose length field is nonsense, the same decision `withRaw` makes; the
difference here is that the nonsense would also be freed. `len == 0` with a non-null
`p` is an owned, empty Vec that still frees `p` when it drops, which is what a
zero-length Milo allocation is.

The Vec's capacity is set to `len`, so a `push` reallocates rather than writing past
the run the caller vouched for. If the original allocation was larger, that slack is
lost, not leaked: `free` takes the same base pointer either way.

### `withRaw`

```milo
pub fn withRaw<T, R>(p: *T, len: i64, f: (&[T]) => R): Option<R>
```

Call `f` with a read-only view of `len` elements at `p`, and return what it returns.

Returns `Option.None` WITHOUT calling `f` when `p` is null, or when `len` is negative.
The null path is in the return type so it cannot be forgotten; a variant returning a
bare `R` would push the test back to convention, which is the thing being fixed. A
negative length is folded into the same answer deliberately: the alternative is a view
whose length field is nonsense, and every later bounds check would read as satisfied.

`len == 0` with a non-null `p` is not an error: `f` runs with an empty slice.

### `withRawMut`

```milo
pub fn withRawMut<T, R>(p: *T, len: i64, f: (&mut [T]) => R): Option<R>
```

`withRaw` with a mutable view: writes through the slice land in the original memory.

Same contract, same null and negative-length answers. Note what this does NOT cover: a
C `(ptr, count)` pair whose owner reallocates or frees on append is not a view of
anything stable, and no view primitive in any language makes that safe. Keep those on
`realloc`/`free` inside `unsafe`.
