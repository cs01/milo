# std/hmac

## std/hmac

### `blockKey`

```milo
fn blockKey(key: &string): string
```

Normalize the key to exactly BLOCK bytes (RFC 2104 §2).

### `Hmac.sha1Bytes`

```milo
fn Hmac.sha1Bytes(key: &string, msg: &string): string
```

_Undocumented._

### `Hmac.sha256`

```milo
fn Hmac.sha256(key: &string, msg: &string): string
```

_Undocumented._

### `Hmac.sha256Bytes`

```milo
fn Hmac.sha256Bytes(key: &string, msg: &string): string
```

_Undocumented._

### `hmacSha1Bytes`

```milo
fn hmacSha1Bytes(key: &string, msg: &string): string
```

HMAC-SHA1 (RFC 2104), returning 20 raw digest bytes. SHA-1's block size is also
64 bytes, so the same key-normalization applies. Needed by HOTP/TOTP (std/totp),
which are specified on HMAC-SHA1.

### `hmacSha256`

```milo
fn hmacSha256(key: &string, msg: &string): string
```

HMAC-SHA256 as a 64-char lowercase hex string.

### `hmacSha256Bytes`

```milo
fn hmacSha256Bytes(key: &string, msg: &string): string
```

HMAC-SHA256, returning the 32 raw digest bytes.
