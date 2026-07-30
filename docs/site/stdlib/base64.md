# std/base64

Base64 encoding and decoding.

```milo
from "std/base64" import { Base64 }
```

## Functions

### Base64.encode

```milo
fn Base64.encode(input: &string): string
```

Encodes a string to Base64.

### Base64.decode

```milo
fn Base64.decode(input: &string): string
```

Decodes a Base64 string back to its original form.

```milo
let encoded = Base64.encode(&"hello world")
let decoded = Base64.decode(&encoded)
print(decoded)  // hello world
```
