# std/Sha1.hash

Pure-Milo SHA-1 (FIPS 180-4) — no platform crypto dependency. Same constant-time, fixed-round shape as [`std/sha256`](sha256).

> SHA-1 is broken for collision resistance — do **not** use it for signatures or adversarial dedup. It remains the content-address of git objects and the digest in the WebSocket handshake and legacy TLS, which is what a pure-Milo implementation is for.

```milo
from "std/Sha1.hash" import { Sha1 }
```

## Functions

### Sha1.hash

```milo
fn Sha1.hash(input: &string): string
```

SHA-1 digest as a 40-char lowercase hex string.

### Sha1.bytes

```milo
fn Sha1.bytes(input: &string): string
```

SHA-1 digest as 20 raw bytes (for HMAC-SHA1 and the WebSocket handshake).
