# std/hkdf

HKDF, the HMAC-based extract-and-expand key derivation function (RFC 5869).

```milo
from "std/hkdf" import { Hkdf }
```

Turns one high-entropy-but-not-uniform secret — an ECDH shared secret, a master key, a token — into any number of independent, uniformly distributed subkeys. Two steps, and the split matters:

```
extract(salt, ikm) -> prk        concentrate whatever entropy the input has
expand(prk, info, len) -> okm    spread it over len bytes, bound to info
```

`info` is the domain separator. Derive your encryption key with info `"enc"` and your MAC key with info `"mac"` from the same PRK and the two are computationally unrelated, so leaking one says nothing about the other. Using the same bytes for both is the mistake this module exists to prevent.

**HKDF is not a password KDF.** Its cost is one HMAC per output block, which is exactly what you do not want against a password guesser — use [`std/pbkdf2`](pbkdf2) there.

## Functions

### Hkdf.sha256

```milo
fn Hkdf.sha256(salt: &string, ikm: &string, info: &string, length: i64): Result<string>
```

Extract then expand — the usual entry point. `length` is in bytes and may not exceed 255×32.

```milo
let encKey = Hkdf.sha256(salt, sharedSecret, "encryption", 32)?
let macKey = Hkdf.sha256(salt, sharedSecret, "authentication", 32)?
```

### Hkdf.extractSha256 / Hkdf.expandSha256

```milo
fn Hkdf.extractSha256(salt: &string, ikm: &string): string
fn Hkdf.expandSha256(prk: &string, info: &string, length: i64): Result<string>
```

The two halves, for when one PRK feeds several subkeys. An empty `salt` is the RFC's default of HashLen zero bytes. A salt need not be secret, and a random one is what makes the extract step provably a randomness extractor rather than just a hash.

### SHA-512 and SHA-1 variants

```milo
fn Hkdf.sha512(salt: &string, ikm: &string, info: &string, length: i64): Result<string>
fn Hkdf.extractSha512(salt: &string, ikm: &string): string
fn Hkdf.expandSha512(prk: &string, info: &string, length: i64): Result<string>
fn Hkdf.sha1(salt: &string, ikm: &string, info: &string, length: i64): Result<string>
fn Hkdf.extractSha1(salt: &string, ikm: &string): string
fn Hkdf.expandSha1(prk: &string, info: &string, length: i64): Result<string>
```

The SHA-1 pair is present because RFC 5869's own test vectors cover it and older protocols specify it; prefer the SHA-256 pair.

Checked against the RFC 5869 test vectors in `tests/fixtures/hkdfVectors.milo`.
