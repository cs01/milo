# std/checksum

## std/checksum

### `adler32`

```milo
fn adler32(data: &string): i64
```

Adler-32 (RFC 1950). a = 1 + sum(bytes) mod 65521, b = sum(a) mod 65521.

### `Checksum.adler32`

```milo
fn Checksum.adler32(data: &string): i64
```

_Undocumented._

### `Checksum.crc32`

```milo
fn Checksum.crc32(data: &string): i64
```

_Undocumented._

### `crc32`

```milo
fn crc32(data: &string): i64
```

CRC-32/IEEE of a byte buffer. Returns the value in [0, 2^32).
