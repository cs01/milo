# std/crypto.linux

## std/crypto.linux

### `aesGcm128Decrypt`

```milo
fn aesGcm128Decrypt(key: &string, iv: &string, ciphertext: &string, tag: &string, aad: &string): Result<string, string>
```

Decrypt with AES-128-GCM. Key 16 bytes, IV 12 bytes, tag 16 bytes.

### `aesGcm128Encrypt`

```milo
fn aesGcm128Encrypt(key: &string, iv: &string, plaintext: &string, aad: &string): Result<AesGcmResult, string>
```

Encrypt with AES-128-GCM. Key 16 bytes, IV 12 bytes. (termpair uses AES-128.)

### `aesGcmDecrypt`

```milo
fn aesGcmDecrypt(key: &string, iv: &string, ciphertext: &string, tag: &string, aad: &string): Result<string, string>
```

Decrypt with AES-256-GCM. Key must be 32 bytes, IV 12 bytes, tag 16 bytes.

### `aesGcmEncrypt`

```milo
fn aesGcmEncrypt(key: &string, iv: &string, plaintext: &string, aad: &string): Result<AesGcmResult, string>
```

Encrypt with AES-256-GCM. Key must be 32 bytes, IV should be 12 bytes.

### `bytesToHex`

```milo
fn bytesToHex(buf: &[u8; 32], n: i64): string
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

### `evpCtrlGcmGetTag`

```milo
fn evpCtrlGcmGetTag(): i32
```

EVP_CTRL_GCM_SET_TAG = 0x11, EVP_CTRL_GCM_GET_TAG = 0x10

### `evpCtrlGcmSetTag`

```milo
fn evpCtrlGcmSetTag(): i32
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
