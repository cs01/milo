# std/binary

## std/binary

### `Bytes.f32FromBits`

```milo
fn Bytes.f32FromBits(b: u32): f32
```

The f32 whose host bit pattern is `b`. Inverse of `f32ToBits`.

### `Bytes.f32ToBits`

```milo
fn Bytes.f32ToBits(v: f32): u32
```

The IEEE-754 bit pattern of `v`, in host representation.

### `Bytes.f64FromBits`

```milo
fn Bytes.f64FromBits(b: u64): f64
```

The f64 whose host bit pattern is `b`. Inverse of `f64ToBits`.

### `Bytes.f64ToBits`

```milo
fn Bytes.f64ToBits(v: f64): u64
```

The IEEE-754 bit pattern of `v`, in host representation.

`as` between a float and an integer converts the *value*; serializing
IEEE-754 needs the *bits*. Milo has no bitcast operator, so this reads the
value's own storage through a repointed pointer. That is in bounds by
construction (f64 and u64 are both 8 bytes, f32 and u32 both 4), and the
caller writes the result out in whichever byte order it asked for, so the
encoding is right on a big-endian host too.

### `Bytes.has`

```milo
fn Bytes.has(src: &string, off: i64, n: i64): bool
```

Whether `n` bytes are readable at `off`. False for a negative `off`.

Written as `src.len - off` rather than `off + n <= src.len` because
arithmetic is checked: an offset near i64 max would trap on the addition
before the bounds test could reject it.

### `Bytes.readF32Be`

```milo
fn Bytes.readF32Be(src: &string, off: i64): Option<f32>
```

The big-endian IEEE-754 f32 at `off`, or None if 4 bytes do not remain.

### `Bytes.readF32Le`

```milo
fn Bytes.readF32Le(src: &string, off: i64): Option<f32>
```

The little-endian IEEE-754 f32 at `off`, or None if 4 bytes do not remain.

### `Bytes.readF64Be`

```milo
fn Bytes.readF64Be(src: &string, off: i64): Option<f64>
```

The big-endian IEEE-754 f64 at `off`, or None if 8 bytes do not remain.

### `Bytes.readF64Le`

```milo
fn Bytes.readF64Le(src: &string, off: i64): Option<f64>
```

The little-endian IEEE-754 f64 at `off`, or None if 8 bytes do not remain.

### `Bytes.readI16Be`

```milo
fn Bytes.readI16Be(src: &string, off: i64): Option<i16>
```

The big-endian i16 at `off`, or None if 2 bytes do not remain there.

### `Bytes.readI16Le`

```milo
fn Bytes.readI16Le(src: &string, off: i64): Option<i16>
```

The little-endian i16 at `off`, or None if 2 bytes do not remain there.

### `Bytes.readI32Be`

```milo
fn Bytes.readI32Be(src: &string, off: i64): Option<i32>
```

The big-endian i32 at `off`, or None if 4 bytes do not remain there.

### `Bytes.readI32Le`

```milo
fn Bytes.readI32Le(src: &string, off: i64): Option<i32>
```

The little-endian i32 at `off`, or None if 4 bytes do not remain there.

### `Bytes.readI64Be`

```milo
fn Bytes.readI64Be(src: &string, off: i64): Option<i64>
```

The big-endian i64 at `off`, or None if 8 bytes do not remain there.

### `Bytes.readI64Le`

```milo
fn Bytes.readI64Le(src: &string, off: i64): Option<i64>
```

The little-endian i64 at `off`, or None if 8 bytes do not remain there.

### `Bytes.readI8`

```milo
fn Bytes.readI8(src: &string, off: i64): Option<i8>
```

The byte at `off` as a signed value, or None if `off` is not in `src`.

### `Bytes.readU16Be`

```milo
fn Bytes.readU16Be(src: &string, off: i64): Option<u16>
```

The big-endian u16 at `off`, or None if 2 bytes do not remain there.

### `Bytes.readU16Le`

```milo
fn Bytes.readU16Le(src: &string, off: i64): Option<u16>
```

The little-endian u16 at `off`, or None if 2 bytes do not remain there.

### `Bytes.readU32Be`

```milo
fn Bytes.readU32Be(src: &string, off: i64): Option<u32>
```

The big-endian u32 at `off`, or None if 4 bytes do not remain there.

### `Bytes.readU32Le`

```milo
fn Bytes.readU32Le(src: &string, off: i64): Option<u32>
```

The little-endian u32 at `off`, or None if 4 bytes do not remain there.

### `Bytes.readU64Be`

```milo
fn Bytes.readU64Be(src: &string, off: i64): Option<u64>
```

The big-endian u64 at `off`, or None if 8 bytes do not remain there.

### `Bytes.readU64Le`

```milo
fn Bytes.readU64Le(src: &string, off: i64): Option<u64>
```

The little-endian u64 at `off`, or None if 8 bytes do not remain there.

### `Bytes.readU8`

```milo
fn Bytes.readU8(src: &string, off: i64): Option<u8>
```

The byte at `off`, or None if `off` is not in `src`.

### `Bytes.writeF32Be`

```milo
fn Bytes.writeF32Be(out: &mut string, v: f32): void
```

Append `v` as 4 big-endian IEEE-754 bytes.

### `Bytes.writeF32Le`

```milo
fn Bytes.writeF32Le(out: &mut string, v: f32): void
```

Append `v` as 4 little-endian IEEE-754 bytes.

### `Bytes.writeF64Be`

```milo
fn Bytes.writeF64Be(out: &mut string, v: f64): void
```

Append `v` as 8 big-endian IEEE-754 bytes.

### `Bytes.writeF64Le`

```milo
fn Bytes.writeF64Le(out: &mut string, v: f64): void
```

Append `v` as 8 little-endian IEEE-754 bytes.

### `Bytes.writeI16Be`

```milo
fn Bytes.writeI16Be(out: &mut string, v: i16): void
```

Append `v` as 2 big-endian bytes, two's complement.

### `Bytes.writeI16Le`

```milo
fn Bytes.writeI16Le(out: &mut string, v: i16): void
```

Append `v` as 2 little-endian bytes, two's complement.

### `Bytes.writeI32Be`

```milo
fn Bytes.writeI32Be(out: &mut string, v: i32): void
```

Append `v` as 4 big-endian bytes, two's complement.

### `Bytes.writeI32Le`

```milo
fn Bytes.writeI32Le(out: &mut string, v: i32): void
```

Append `v` as 4 little-endian bytes, two's complement.

### `Bytes.writeI64Be`

```milo
fn Bytes.writeI64Be(out: &mut string, v: i64): void
```

Append `v` as 8 big-endian bytes, two's complement.

### `Bytes.writeI64Le`

```milo
fn Bytes.writeI64Le(out: &mut string, v: i64): void
```

Append `v` as 8 little-endian bytes, two's complement.

### `Bytes.writeI8`

```milo
fn Bytes.writeI8(out: &mut string, v: i8): void
```

Append `v` as one byte, two's complement.

### `Bytes.writeU16Be`

```milo
fn Bytes.writeU16Be(out: &mut string, v: u16): void
```

Append `v` as 2 big-endian bytes.

### `Bytes.writeU16Le`

```milo
fn Bytes.writeU16Le(out: &mut string, v: u16): void
```

Append `v` as 2 little-endian bytes.

### `Bytes.writeU32Be`

```milo
fn Bytes.writeU32Be(out: &mut string, v: u32): void
```

Append `v` as 4 big-endian bytes.

### `Bytes.writeU32Le`

```milo
fn Bytes.writeU32Le(out: &mut string, v: u32): void
```

Append `v` as 4 little-endian bytes.

### `Bytes.writeU64Be`

```milo
fn Bytes.writeU64Be(out: &mut string, v: u64): void
```

Append `v` as 8 big-endian bytes.

### `Bytes.writeU64Le`

```milo
fn Bytes.writeU64Le(out: &mut string, v: u64): void
```

Append `v` as 8 little-endian bytes.

### `Bytes.writeU8`

```milo
fn Bytes.writeU8(out: &mut string, v: u8): void
```

Append `v` as one byte.
