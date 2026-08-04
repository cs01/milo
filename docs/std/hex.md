# std/hex

## std/hex

### `Hex.decode`

```milo
fn Hex.decode(input: &string): Result<string>
```

Decode a hex string. Case-insensitive, but errs on an odd length or any byte
that is not an ASCII hex digit — no whitespace, "0x" prefix, or separators.

### `Hex.encode`

```milo
fn Hex.encode(input: &string): string
```

Encode each byte as two lowercase hex digits.

### `hexChar`

```milo
pub fn hexChar(val: u8): u8
```

_Undocumented._
