# std/Totp.generate

HOTP (RFC 4226) and TOTP (RFC 6238) one-time passwords, pure Milo over [`std/hmac`](hmac)'s HMAC-SHA1. This is the algorithm behind Google Authenticator / Authy 2FA codes; output matches `oathtool` and the RFC test vectors bit-for-bit.

The secret is raw key bytes — decode a base32 `otpauth://` secret with [`std/base32`](base32) first. Time and counter are caller-supplied, so the module has no clock dependency and is deterministic to test.

```milo
from "std/Totp.generate" import { Totp }
```

## Functions

### Totp.hotp

```milo
fn Totp.hotp(secret: &string, counter: i64, digits: i64): string
```

HOTP value for a moving counter (RFC 4226 §5.3), `digits` long (6–8 typical), zero-padded.

### Totp.generate

```milo
fn Totp.generate(secret: &string, unixTime: i64, step: i64, digits: i64): string
```

TOTP value for a Unix timestamp (RFC 6238): HOTP over `floor(unixTime / step)`. Use `step = 30`, `digits = 6` for the common authenticator-app setup.

```milo
from "std/base32" import { Base32 }

// decodeLoose tolerates the spaces and missing padding a pasted secret usually has
let key = Base32.decodeLoose("JBSWY3DPEHPK3PXP")!
let code = Totp.generate(key, 1_700_000_000, 30, 6)
```
