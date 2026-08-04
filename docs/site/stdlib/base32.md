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
fn Base32.decode(input: &string): Result<string>
```

Strict RFC 4648 decode: the input must be `=`-padded to a multiple of 8 characters and contain only alphabet symbols. Lowercase is accepted (the alphabet has no lowercase symbols, so case-folding is unambiguous); whitespace, `-`, and anything else is an `Err` naming the byte offset. Use this on machine-produced input, where anything else means corruption.

### Base32.decodeLoose

```milo
fn Base32.decodeLoose(input: &string): Result<string>
```

Decode for human-transcribed secrets: ASCII whitespace, `-`, and `=` are skipped wherever they appear, and padding is optional. Every other non-alphabet byte is still an `Err` — leniency covers formatting, never content.

```milo
let secret = Base32.decodeLoose("JBSW Y3DP EHPK 3PXP")!   // as pasted from an authenticator app
```
