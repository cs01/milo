# std/base32

Base32 encode/decode (RFC 4648), pure Milo. The encoding `otpauth://` URIs use for TOTP/HOTP secrets, and what DNS, S/MIME, and many license keys use for case-insensitive, human-transcribable binary. Alphabet A–Z 2–7, MSB-first, `=` padding. Input and output are byte strings, matching `std/base64`.

```milo
from "std/base32" import { Base32 }
```

## Functions

### Base32.encode

```milo
fn Base32.encode(input: &string): string
```

Encodes bytes to a padded Base32 string.

### Base32.decode

```milo
fn Base32.decode(input: &string): string
```

Decodes a Base32 string to bytes. Padding, whitespace, and case are tolerated, and any other character is skipped — so a secret copied from an authenticator app decodes as-is.
