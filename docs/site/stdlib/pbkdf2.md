# std/pbkdf2

PBKDF2, the iterated password-based key derivation function (RFC 8018 §5.2).

```milo
from "std/pbkdf2" import { Pbkdf2 }
```

This is the module for when the input is a *password* — something a human chose, with maybe 30 bits of entropy behind it. A plain hash of a password is a rounding error to a GPU. PBKDF2 makes each guess cost `iterations` HMACs, so the defender picks the attacker's price.

Two rules the type system cannot enforce:

- every password gets its own random salt (`std/random`), stored alongside the hash — a shared or absent salt lets one rainbow table break every account;
- compare stored and recomputed digests with [`std/subtle`](subtle)'s `constantTimeEq`, never `==`.

PBKDF2 is the weakest of the accepted password KDFs: it is compute-hard but not *memory*-hard, so custom hardware gets a large constant-factor advantage that scrypt and Argon2 deny it. It is still FIPS-approved and NIST-recommended (SP 800-63B), and it is what the standard library ships because a correct PBKDF2 beats a subtly wrong Argon2. Use a high iteration count: OWASP's 2023 floor is 600 000 for HMAC-SHA256 and 210 000 for HMAC-SHA512.

## Functions

### Pbkdf2.sha256

```milo
fn Pbkdf2.sha256(password: &string, salt: &string, iterations: i64, dkLen: i64): Result<string>
```

PBKDF2-HMAC-SHA256, returning `dkLen` raw derived bytes. The default choice for new password storage.

```milo
let stored = Pbkdf2.sha256(password, salt, 600000, 32)?
// later, on login:
let candidate = Pbkdf2.sha256(attempt, salt, 600000, 32)?
if constantTimeEq(stored, candidate) { ... }
```

### Pbkdf2.sha512 / Pbkdf2.sha1

```milo
fn Pbkdf2.sha512(password: &string, salt: &string, iterations: i64, dkLen: i64): Result<string>
fn Pbkdf2.sha1(password: &string, salt: &string, iterations: i64, dkLen: i64): Result<string>
```

The SHA-1 variant is for interoperating with existing stores (WPA2, older Django/OpenSSL formats) and because RFC 6070's test vectors are specified on it. Do not choose it for new password storage.

`Err` on a non-positive iteration count or derived-key length, and on a derived key longer than (2^32−1)×hLen.

Checked against the RFC 6070 and RFC 7914 §11 test vectors in `tests/fixtures/pbkdf2Vectors.milo`.
