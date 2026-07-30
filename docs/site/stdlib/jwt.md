# std/jwt

JSON Web Tokens, HS256 (RFC 7519 / 7515), pure Milo over [`std/hmac`](hmac) and `std/base64`. HS256 is deterministic, so a token produced here is byte-identical to PyJWT / jsonwebtoken for the same header, payload, and secret. The payload is passed and returned as its raw JSON string — this module owns the JOSE framing, not the claim schema.

```milo
from "std/jwt" import { Jwt }
```

## Functions

### Jwt.signHS256

```milo
fn Jwt.signHS256(payload: &string, secret: &string): string
```

Signs a JSON payload string with HS256, returning a compact JWS: `base64url(header).base64url(payload).base64url(HMAC-SHA256)`.

### Jwt.verifyHS256

```milo
fn Jwt.verifyHS256(token: &string, secret: &string): bool
```

Verifies a compact HS256 JWS against the secret. Returns `true` iff the token has the exact `header.payload.signature` shape and the recomputed signature matches. The comparison is constant-time and `alg` is pinned to HS256 — no `"alg":"none"` downgrade.

```milo
let token = Jwt.signHS256(&"{\"sub\":\"42\"}", &secret)
let ok = Jwt.verifyHS256(&token, &secret)   // true
```
