# std/totp

## std/totp

### `hotp`

```milo
fn hotp(secret: &string, counter: i64, digits: i64): string
```

HOTP value for a moving counter (RFC 4226 §5.3), `digits` long (6–8 typical).

### `pow10`

```milo
fn pow10(n: i64): i64
```

_Undocumented._

### `totp`

```milo
fn totp(secret: &string, unixTime: i64, step: i64, digits: i64): string
```

TOTP value for a Unix timestamp (RFC 6238): HOTP over floor(time / step).

### `Totp.generate`

```milo
fn Totp.generate(secret: &string, unixTime: i64, step: i64, digits: i64): string
```

_Undocumented._

### `Totp.hotp`

```milo
fn Totp.hotp(secret: &string, counter: i64, digits: i64): string
```

_Undocumented._
