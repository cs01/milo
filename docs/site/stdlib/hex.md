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
fn Hex.decode(input: &string): string
```

Decodes a hex string back to its original form.

```milo
let encoded = Hex.encode(&"hello")
print(encoded)  // 68656c6c6f
let decoded = Hex.decode(&encoded)
print(decoded)  // hello
```
