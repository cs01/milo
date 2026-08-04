# std/jwt

## std/jwt

### `Jwt.sign`

```milo
fn Jwt.sign(alg: JwtAlg, payload: &string, secret: &string): string
```

Sign a JSON payload string with `alg`, returning a compact JWS.

### `Jwt.signHS256`

```milo
fn Jwt.signHS256(payload: &string, secret: &string): string
```

Sign with HMAC-SHA256 — the JWT default.

### `Jwt.signHS384`

```milo
fn Jwt.signHS384(payload: &string, secret: &string): string
```

Sign with HMAC-SHA384.

### `Jwt.signHS512`

```milo
fn Jwt.signHS512(payload: &string, secret: &string): string
```

Sign with HMAC-SHA512.

### `Jwt.verifyHS256`

```milo
fn Jwt.verifyHS256(token: &string, secret: &string): Result<JwtClaims, JwtError>
```

Verify an HS256 token against `secret` and return its claims. Rejects any
other algorithm (including `none`), a bad signature, and a token that is
expired or not yet valid, allowing JWT_DEFAULT_LEEWAY of clock skew.
Use `JwtVerifier` to require an audience or issuer, or to fix the clock.

### `Jwt.verifyHS384`

```milo
fn Jwt.verifyHS384(token: &string, secret: &string): Result<JwtClaims, JwtError>
```

Verify an HS384 token. Same checks as `verifyHS256`.

### `Jwt.verifyHS512`

```milo
fn Jwt.verifyHS512(token: &string, secret: &string): Result<JwtClaims, JwtError>
```

Verify an HS512 token. Same checks as `verifyHS256`.

### `jwtAlgName`

```milo
pub fn jwtAlgName(alg: &JwtAlg): string
```

The JOSE registry name, as it appears in the header.

### `JwtClaims.bool`

```milo
fn JwtClaims.bool(self: &JwtClaims, key: &string): Option<bool>
```

A boolean-valued claim, or None if absent or not a boolean.

### `JwtClaims.expiresAt`

```milo
fn JwtClaims.expiresAt(self: &JwtClaims): Option<i64>
```

`exp` — expiry, seconds since the Unix epoch (§4.1.4).

### `JwtClaims.hasAudience`

```milo
fn JwtClaims.hasAudience(self: &JwtClaims, want: &string): bool
```

True iff the `aud` claim is `want`, or is an array containing it. RFC 7519
§4.1.3 allows either shape, and a verifier that only understands the string
form silently accepts every multi-audience token.

### `JwtClaims.i64`

```milo
fn JwtClaims.i64(self: &JwtClaims, key: &string): Option<i64>
```

An integer-valued claim, or None if absent or not a number.

### `JwtClaims.issuedAt`

```milo
fn JwtClaims.issuedAt(self: &JwtClaims): Option<i64>
```

`iat` — issued-at, seconds since the Unix epoch (§4.1.6).

### `JwtClaims.issuer`

```milo
fn JwtClaims.issuer(self: &JwtClaims): Option<string>
```

`iss` — who minted the token (§4.1.1).

### `JwtClaims.notBefore`

```milo
fn JwtClaims.notBefore(self: &JwtClaims): Option<i64>
```

`nbf` — not-before, seconds since the Unix epoch (§4.1.5).

### `JwtClaims.raw`

```milo
fn JwtClaims.raw(self: &JwtClaims): string
```

The payload segment as its raw JSON text.

### `JwtClaims.str`

```milo
fn JwtClaims.str(self: &JwtClaims, key: &string): Option<string>
```

A string-valued claim, or None if absent or not a string.

### `JwtClaims.subject`

```milo
fn JwtClaims.subject(self: &JwtClaims): Option<string>
```

`sub` — the subject the token is about (RFC 7519 §4.1.2).

### `JwtClaims.tokenId`

```milo
fn JwtClaims.tokenId(self: &JwtClaims): Option<string>
```

`jti` — the token's unique id, for replay tracking (§4.1.7).

### `jwtErrorMessage`

```milo
pub fn jwtErrorMessage(err: &JwtError): string
```

One-line, log-safe description of a rejection.

### `JwtVerifier.at`

```milo
fn JwtVerifier.at(self: JwtVerifier, unixSecs: i64): JwtVerifier
```

Evaluate the time claims against a fixed instant instead of the system clock.
Seconds since the Unix epoch. This is what makes a claim test reproducible.

### `JwtVerifier.audience`

```milo
fn JwtVerifier.audience(self: JwtVerifier, want: string): JwtVerifier
```

Require an `aud` claim naming `want` (string or array form).

### `JwtVerifier.issuer`

```milo
fn JwtVerifier.issuer(self: JwtVerifier, want: string): JwtVerifier
```

Require an `iss` claim equal to `want`.

### `JwtVerifier.leeway`

```milo
fn JwtVerifier.leeway(self: JwtVerifier, secs: i64): JwtVerifier
```

Tolerate `secs` of clock skew in both directions on exp/nbf/iat.

### `JwtVerifier.new`

```milo
fn JwtVerifier.new(alg: JwtAlg, secret: &string): JwtVerifier
```

A verifier that requires `alg` and `secret`, allows JWT_DEFAULT_LEEWAY of
clock skew, and validates whatever of `exp`/`nbf`/`iat` the token carries.

The secret is borrowed and copied in: a verifier is usually built per request
from one long-lived secret, and taking ownership would move that secret out
of the caller's variable on first use.

### `JwtVerifier.requireExpiry`

```milo
fn JwtVerifier.requireExpiry(self: JwtVerifier): JwtVerifier
```

Reject a token that carries no `exp` at all. Off by default because the claim
is optional in RFC 7519; turn it on for anything session-shaped, where a
token that never expires is a permanent credential.

### `JwtVerifier.verify`

```milo
fn JwtVerifier.verify(self: &JwtVerifier, token: &string): Result<JwtClaims, JwtError>
```

Check the signature and the claims, and hand back the payload.
