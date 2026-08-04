# std/jwt

JSON Web Tokens (RFC 7519 / 7515) over HMAC-SHA2, pure Milo on [`std/hmac`](hmac), `std/base64`, `std/json` and [`std/subtle`](subtle). HS256/384/512 are deterministic, so a token produced here is byte-identical to PyJWT / jsonwebtoken for the same header, payload, and secret.

```milo
from "std/jwt" import { Jwt, JwtAlg, JwtVerifier, JwtError, jwtErrorMessage }
```

Verification returns the **claims**, not a bool. A yes/no verifier invites `if verify(token, secret) { ... }`, which happily accepts a token that expired three years ago or was minted for a different audience — the signature is only half the check. `Result<JwtClaims, JwtError>` makes "the signature is good" and "this token is valid right now" the same line of code.

Three attacks are handled explicitly:

- **`alg: none`** — the header algorithm must equal the one the caller asked for, so an unsigned token is `UnsupportedAlg("none")`.
- **Algorithm confusion** — the algorithm comes from the verifier, never from the token.
- **Signature timing** — the MAC comparison is `constantTimeEq` over raw bytes, and a non-canonical base64url signature is rejected rather than silently accepted.

HMAC algorithms only. RS\*/ES\*/PS\* need public-key crypto the standard library does not have; such a token is rejected as unsupported rather than downgraded.

## Signing

### Jwt.signHS256 / signHS384 / signHS512

```milo
fn Jwt.signHS256(payload: &string, secret: &string): string
fn Jwt.signHS384(payload: &string, secret: &string): string
fn Jwt.signHS512(payload: &string, secret: &string): string
fn Jwt.sign(alg: JwtAlg, payload: &string, secret: &string): string
```

Signs a JSON payload string, returning a compact JWS: `base64url(header).base64url(payload).base64url(HMAC)`.

## Verifying

### Jwt.verifyHS256 / verifyHS384 / verifyHS512

```milo
fn Jwt.verifyHS256(token: &string, secret: &string): Result<JwtClaims, JwtError>
```

Checks the algorithm, the signature, and `exp`/`nbf`/`iat` against the system clock with `JWT_DEFAULT_LEEWAY` (60 s) of tolerance, then returns the payload.

```milo
match Jwt.verifyHS256(token, secret) {
    Result.Ok(claims) => {
        match claims.subject() {
            Option.Some(sub) => { print("hello " + sub) }
            Option.None => { print("anonymous token") }
        }
    }
    Result.Err(e) => { print(jwtErrorMessage(e)) }
}
```

### JwtVerifier

```milo
fn JwtVerifier.new(alg: JwtAlg, secret: &string): JwtVerifier
fn JwtVerifier.leeway(self: JwtVerifier, secs: i64): JwtVerifier
fn JwtVerifier.at(self: JwtVerifier, unixSecs: i64): JwtVerifier
fn JwtVerifier.audience(self: JwtVerifier, want: string): JwtVerifier
fn JwtVerifier.issuer(self: JwtVerifier, want: string): JwtVerifier
fn JwtVerifier.requireExpiry(self: JwtVerifier): JwtVerifier
fn JwtVerifier.verify(self: &Self, token: &string): Result<JwtClaims, JwtError>
```

The policy in one place: which algorithm, how much clock skew, which audience and issuer, and whether a token without `exp` is acceptable. `at` pins the clock to a fixed instant, which is what makes a claim test reproducible.

```milo
let verifier = JwtVerifier.new(JwtAlg.HS256, secret)
    .audience("api.example")
    .issuer("auth.example")
    .requireExpiry()
let claims = verifier.verify(token)?
```

## JwtClaims

```milo
fn JwtClaims.raw(self: &Self): string
fn JwtClaims.str(self: &Self, key: &string): Option<string>
fn JwtClaims.i64(self: &Self, key: &string): Option<i64>
fn JwtClaims.bool(self: &Self, key: &string): Option<bool>
fn JwtClaims.subject(self: &Self): Option<string>
fn JwtClaims.issuer(self: &Self): Option<string>
fn JwtClaims.tokenId(self: &Self): Option<string>
fn JwtClaims.expiresAt(self: &Self): Option<i64>
fn JwtClaims.notBefore(self: &Self): Option<i64>
fn JwtClaims.issuedAt(self: &Self): Option<i64>
fn JwtClaims.hasAudience(self: &Self, want: &string): bool
```

Only ever produced by a successful `verify`, so holding one is the proof the token checked out. `hasAudience` understands both shapes RFC 7519 §4.1.3 allows — a bare string and an array of strings.

## JwtError

| Variant | Means |
|---|---|
| `Malformed(string)` | not three base64url segments, or a segment is not valid base64url / JSON |
| `UnsupportedAlg(string)` | header `alg` is not the one required — carries the value found, so `none` shows up verbatim |
| `UnsupportedCritical` | header carries a `crit` extension this implementation does not understand (RFC 7515 §4.1.11) |
| `BadSignature` | the MAC did not match |
| `Expired(i64)` | `exp` has passed |
| `NotYetValid(i64)` | `nbf` is in the future |
| `IssuedInFuture(i64)` | `iat` is in the future |
| `MissingClaim(string)` | a required claim is absent |
| `WrongAudience(string)` | `aud` does not contain the required audience |
| `WrongIssuer(string)` | `iss` is not the required issuer |

`jwtErrorMessage(err)` renders any of them as one log-safe line.
