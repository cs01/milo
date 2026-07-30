# std/hmac

HMAC (RFC 2104 / FIPS 198-1) over the pure-Milo SHA-256 and SHA-1. The key is normalized to the 64-byte block (hashed if longer, zero-padded otherwise). Used for JWT (HS256), AWS SigV4, webhook signatures, and TOTP.

```milo
from "std/hmac" import { Hmac }
```

## Functions

### Hmac.sha256

```milo
fn Hmac.sha256(key: &string, msg: &string): string
```

HMAC-SHA256 as a 64-char lowercase hex string.

### Hmac.sha256Bytes

```milo
fn Hmac.sha256Bytes(key: &string, msg: &string): string
```

HMAC-SHA256 as 32 raw digest bytes (no hex round-trip when feeding further bytes).

### Hmac.sha1Bytes

```milo
fn Hmac.sha1Bytes(key: &string, msg: &string): string
```

HMAC-SHA1 as 20 raw digest bytes. Needed by HOTP/TOTP ([`std/totp`](totp)), which are specified on HMAC-SHA1.
