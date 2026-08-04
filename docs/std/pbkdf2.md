# std/pbkdf2

## std/pbkdf2

### `Pbkdf2.sha1`

```milo
fn Pbkdf2.sha1(password: &string, salt: &string, iterations: i64, dkLen: i64): Result<string>
```

PBKDF2-HMAC-SHA1. Present for interoperating with existing stores (WPA2,
older Django/OpenSSL formats) and because RFC 6070's test vectors are
specified on it. Do not choose it for new password storage.

### `Pbkdf2.sha256`

```milo
fn Pbkdf2.sha256(password: &string, salt: &string, iterations: i64, dkLen: i64): Result<string>
```

PBKDF2-HMAC-SHA256. The default choice for new password storage.

### `Pbkdf2.sha512`

```milo
fn Pbkdf2.sha512(password: &string, salt: &string, iterations: i64, dkLen: i64): Result<string>
```

PBKDF2-HMAC-SHA512.
