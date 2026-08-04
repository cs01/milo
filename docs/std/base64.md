# std/base64

## std/base64

### `Base64.decode`

```milo
fn Base64.decode(input: &string): Result<string>
```

Decode standard base64. Errs on any byte outside A–Za–z0–9+/=, a length that
is not a multiple of 4, or misplaced/oversized padding; whitespace and
newlines are rejected, so unwrap MIME line-wrapping before calling this.

### `Base64.encode`

```milo
fn Base64.encode(input: &string): string
```

Encode bytes as standard base64 with '=' padding (RFC 4648 §4).

### `Base64.urlDecode`

```milo
fn Base64.urlDecode(input: &string): Result<string>
```

Decode URL-safe base64 (A–Za–z0–9-_). Padding is optional but must be
correct if present. Same strictness as `decode` otherwise.

### `Base64.urlEncode`

```milo
fn Base64.urlEncode(input: &string): string
```

Encode bytes as URL-safe base64 with no padding (RFC 4648 §5).
