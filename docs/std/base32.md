# std/base32

## std/base32

### `b32Char`

```milo
fn b32Char(v: i64): u8
```

_Undocumented._

### `b32Val`

```milo
fn b32Val(c: u8): i64
```

Decode a Base32 char to its 5-bit value, or -1 if it isn't a symbol.

### `Base32.decode`

```milo
fn Base32.decode(input: &string): string
```

_Undocumented._

### `Base32.encode`

```milo
fn Base32.encode(input: &string): string
```

_Undocumented._

### `base32Decode`

```milo
fn base32Decode(input: &string): string
```

Decode a Base32 string to bytes. Padding, whitespace, and case are tolerated;
any other character is skipped so lightly-formatted secrets still decode.

### `base32Encode`

```milo
fn base32Encode(input: &string): string
```

Encode bytes to a padded Base32 string.
