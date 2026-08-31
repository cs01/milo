# std/foreign

## std/foreign

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
