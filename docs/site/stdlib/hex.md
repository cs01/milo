# std/hex

Hex encoding and decoding.

```milo
from "std/hex" import { Hex }
```

## Functions

### Hex.encode

```milo
fn Hex.encode(input: &string): string
```

Encodes a string as hexadecimal.

### Hex.decode

```milo
fn Hex.decode(input: &string): Result<string>
```

Decodes a hex string back to bytes. Case-insensitive, but strict about everything else: an odd length or any byte that is not an ASCII hex digit is an `Err`. No whitespace, no `0x` prefix, no separators.

```milo
let encoded = Hex.encode("hello")
print(encoded)  // 68656c6c6f
let decoded = Hex.decode(encoded)!
print(decoded)  // hello

print(Hex.decode("66 6f").isErr())  // true
```
