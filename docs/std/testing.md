# std/testing

## std/testing

### `assert`

```milo
pub fn assert(cond: bool): void
```

_Undocumented._

### `assertBool`

```milo
pub fn assertBool(got: bool, expected: bool): void
```

_Undocumented._

### `assertContains`

```milo
pub fn assertContains(haystack: &string, needle: &string): void
```

_Undocumented._

### `assertEq`

```milo
pub fn assertEq<T>(got: &T, expected: &T): void
```

The general equality assertion: works for any type `==` accepts, and prints both sides.
Prefer this over the width-specific helpers below, which predate it.

### `assertEqual`

```milo
pub fn assertEqual(got: i32, expected: i32): void
```

_Undocumented._

### `assertEqual64`

```milo
pub fn assertEqual64(got: i64, expected: i64): void
```

_Undocumented._

### `assertFalse`

```milo
pub fn assertFalse(cond: bool): void
```

_Undocumented._

### `assertMsg`

```milo
pub fn assertMsg(cond: bool, msg: string): void
```

_Undocumented._

### `assertNe`

```milo
pub fn assertNe<T>(got: &T, unexpected: &T): void
```

_Undocumented._

### `assertNear`

```milo
pub fn assertNear(got: f64, expected: f64, tolerance: f64): void
```

Floats: never compare with `==`. `0.1 + 0.2 != 0.3` in binary floating point, so an
exact assertion on computed floats fails for a program that is correct.

### `assertStrEqual`

```milo
pub fn assertStrEqual(got: &string, expected: &string): void
```

_Undocumented._

### `assertTrue`

```milo
pub fn assertTrue(cond: bool): void
```

_Undocumented._

### `assertVecEq`

```milo
pub fn assertVecEq<T>(got: &Vec<T>, expected: &Vec<T>): void
```

_Undocumented._
