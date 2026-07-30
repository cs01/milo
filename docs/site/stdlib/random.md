# std/random

Random number generation.

```milo
from "std/random" import { Random }
```

## Functions

### Random.u32

```milo
fn Random.u32(): u32
```

Returns a random 32-bit unsigned integer.

### Random.int

```milo
fn Random.int(max: i64): i64
```

Returns a random integer in `[0, max)`.

### Random.range

```milo
fn Random.range(min: i64, max: i64): i64
```

Returns a random integer in `[min, max)`.

### Random.float

```milo
fn Random.float(): f64
```

Returns a random float in `[0.0, 1.0)`.

### Random.floatRange

```milo
fn Random.floatRange(min: f64, max: f64): f64
```

Returns a random float in `[min, max)`.

### Random.bool

```milo
fn Random.bool(): bool
```

Returns `true` or `false` with equal probability.

### Random.shuffleI64

```milo
fn Random.shuffleI64(v: &mut Vec<i64>, len: i64)
```

Shuffles the first `len` elements of a vector in-place.

### Random.bytes

```milo
fn Random.bytes(buf: *u8, len: i64)
```

Fills a buffer with `len` random bytes.
