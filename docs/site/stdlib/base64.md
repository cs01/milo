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

### Base64.urlEncode

```milo
fn Base64.urlEncode(input: &string): string
```

Encodes a string as URL-safe Base64 (RFC 4648 §5): `+` becomes `-`, `/` becomes `_`, and padding is dropped.

### Base64.decode

```milo
fn Base64.decode(input: &string): Result<string>
```

Decodes standard Base64. Strict: any byte outside `A-Za-z0-9+/=`, a length that is not a multiple of 4, or misplaced/oversized padding is an `Err` naming the byte offset. Whitespace and newlines are **not** accepted — unwrap MIME line-wrapping first.

### Base64.urlDecode

```milo
fn Base64.urlDecode(input: &string): Result<string>
```

Decodes URL-safe Base64 (`A-Za-z0-9-_`). Padding is optional, since `urlEncode` and JOSE both omit it, but must be correct if present.

```milo
let encoded = Base64.encode("hello world")
let decoded = Base64.decode(encoded)!
print(decoded)  // hello world

match Base64.decode("not base64!") {
    Result.Ok(bytes) => { print(bytes) }
    Result.Err(e) => { print(e) }  // base64: length 11 is not a multiple of 4
}
```
