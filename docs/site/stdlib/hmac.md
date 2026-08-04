# std/hmac

HMAC (RFC 2104 / FIPS 198-1) over the pure-Milo hashes. The key is normalized to the hash's block (hashed if longer, zero-padded otherwise). Used for JWT (HS256/384/512), [HKDF](hkdf), [PBKDF2](pbkdf2), AWS SigV4, webhook signatures, and TOTP.

The block size is a property of the hash, not of HMAC: 64 bytes for SHA-1 and SHA-256, **128** for SHA-384 and SHA-512. Getting it wrong still produces a stable, plausible-looking MAC that no other implementation agrees with.

Compare a received MAC against a computed one with [`std/subtle`](subtle)'s `constantTimeEq`, never `==`.

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

### Hmac.sha512 / Hmac.sha512Bytes / Hmac.sha384Bytes

```milo
fn Hmac.sha512(key: &string, msg: &string): string
fn Hmac.sha512Bytes(key: &string, msg: &string): string
fn Hmac.sha384Bytes(key: &string, msg: &string): string
```

HMAC-SHA512 as 128-char hex, and the raw 64- and 48-byte digests. These use the 128-byte block.

### Hmac.sha1Bytes

```milo
fn Hmac.sha1Bytes(key: &string, msg: &string): string
```

HMAC-SHA1 as 20 raw digest bytes. Needed by HOTP/TOTP ([`std/totp`](totp)) and PBKDF2-HMAC-SHA1, both specified on SHA-1.

Checked against the RFC 4231 test vectors in `tests/fixtures/hmacSha2Vectors.milo`.
