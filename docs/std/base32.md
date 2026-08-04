# std/base32

## std/base32

### `Base32.decode`

```milo
fn Base32.decode(input: &string): Result<string>
```

Strict RFC 4648 decode. Requires a multiple-of-8 padded length and A–Z2–7
symbols (lowercase accepted); whitespace, '-' and any other byte are errors.

### `Base32.decodeLoose`

```milo
fn Base32.decodeLoose(input: &string): Result<string>
```

Decode a human-transcribed secret: ASCII whitespace, '-' and '=' are skipped
and padding is optional. Non-alphabet bytes are still an error.

### `Base32.encode`

```milo
fn Base32.encode(input: &string): string
```

Encode bytes as Base32 with '=' padding to a multiple of 8 characters.
