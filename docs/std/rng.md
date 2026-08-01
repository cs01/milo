# std/rng

## std/rng

### `Rng.bool`

```milo
fn Rng.bool(self: &mut Rng): bool
```

_Undocumented._

### `Rng.float`

```milo
fn Rng.float(self: &mut Rng): f64
```

Uniform in [0, 1). 53 bits of mantissa, which is every f64 value the
interval can hold.

### `Rng.floatRange`

```milo
fn Rng.floatRange(self: &mut Rng, min: f64, max: f64): f64
```

_Undocumented._

### `Rng.int`

```milo
fn Rng.int(self: &mut Rng, max: i64): i64
```

Uniform in [0, max). Returns 0 when max <= 0 rather than trapping, so a
caller looping over an empty range degrades instead of aborting.

Modulo, not rejection sampling: the bias is 2^-64 per unit of max, which is
unmeasurable for any max a program actually passes, and rejection would
make the stream length input-dependent — which breaks replay.

### `Rng.new`

```milo
fn Rng.new(seed: i64): Rng
```

A generator seeded by value. Same seed, same stream — that is the whole
point of this module.

### `Rng.next`

```milo
fn Rng.next(self: &mut Rng): u64
```

Raw 64 bits, uniform.

### `Rng.range`

```milo
fn Rng.range(self: &mut Rng, min: i64, max: i64): i64
```

Uniform in [min, max], inclusive of both ends — matching `Random.range`.

### `Rng.shuffleI64`

```milo
fn Rng.shuffleI64(self: &mut Rng, v: &mut Vec<i64>, n: i64)
```

Fisher-Yates over the first `n` entries.
