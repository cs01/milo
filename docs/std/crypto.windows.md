# std/crypto.windows

## std/crypto.windows

### `aesGcm128Decrypt`

```milo
fn aesGcm128Decrypt(_key: &string, _iv: &string, _ciphertext: &string, _tag: &string, _aad: &string): Result<string, string>
```

_Undocumented._

### `aesGcm128Encrypt`

```milo
fn aesGcm128Encrypt(_key: &string, _iv: &string, _plaintext: &string, _aad: &string): Result<AesGcmResult, string>
```

_Undocumented._

### `aesGcmDecrypt`

```milo
fn aesGcmDecrypt(_key: &string, _iv: &string, _ciphertext: &string, _tag: &string, _aad: &string): Result<string, string>
```

_Undocumented._

### `aesGcmEncrypt`

```milo
fn aesGcmEncrypt(_key: &string, _iv: &string, _plaintext: &string, _aad: &string): Result<AesGcmResult, string>
```

_Undocumented._

### `aesUnsupported`

```milo
fn aesUnsupported(): Result<AesGcmResult, string>
```

CNG AES-GCM (BCryptEncrypt + BCRYPT_AUTHENTICATED_CIPHER_MODE_INFO) is not wired up yet;
fail loudly rather than return a plausible-looking ciphertext. Tracked in docs/roadmap.md.

### `bcryptHash`

```milo
fn bcryptHash(algHandle: i64, input: &string, outLen: i64): string
```

_Undocumented._

### `bytesToHex`

```milo
fn bytesToHex(raw: &string, n: i64): string
```

_Undocumented._

### `Crypto.aesGcm128Decrypt`

```milo
fn Crypto.aesGcm128Decrypt(key: &string, iv: &string, ciphertext: &string, tag: &string, aad: &string): Result<string, string>
```

_Undocumented._

### `Crypto.aesGcm128Encrypt`

```milo
fn Crypto.aesGcm128Encrypt(key: &string, iv: &string, plaintext: &string, aad: &string): Result<AesGcmResult, string>
```

Preconditions mirror the private free fn: the public namespace API must carry the
same AES-128 key/iv/tag length guarantees, else callers lose them at the wrapper.

### `Crypto.aesGcmDecrypt`

```milo
fn Crypto.aesGcmDecrypt(key: &string, iv: &string, ciphertext: &string, tag: &string, aad: &string): Result<string, string>
```

_Undocumented._

### `Crypto.aesGcmEncrypt`

```milo
fn Crypto.aesGcmEncrypt(key: &string, iv: &string, plaintext: &string, aad: &string): Result<AesGcmResult, string>
```

AES-256 lengths (key 32), mirroring the private free fn — see aesGcm128 note below.

### `Crypto.md5`

```milo
fn Crypto.md5(input: &string): string
```

_Undocumented._

### `Crypto.sha1`

```milo
fn Crypto.sha1(input: &string): string
```

_Undocumented._

### `Crypto.sha1Bytes`

```milo
fn Crypto.sha1Bytes(input: &string): string
```

_Undocumented._

### `Crypto.sha256`

```milo
fn Crypto.sha256(input: &string): string
```

_Undocumented._

### `md5`

```milo
fn md5(input: &string): string
```

Compute MD5 hash of a string. Returns 32-char lowercase hex string.

### `sha1`

```milo
fn sha1(input: &string): string
```

Compute SHA-1 hash. Returns 40-char lowercase hex string.

### `sha1Bytes`

```milo
fn sha1Bytes(input: &string): string
```

Raw 20-byte SHA-1 digest as a string (for WebSocket handshake, HMAC, etc.)

### `sha256`

```milo
fn sha256(input: &string): string
```

Compute SHA-256 hash of a string. Returns 64-char lowercase hex string.
