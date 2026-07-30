# std/Inflate.raw

Pure-Milo DEFLATE decompression (RFC 1951) plus gzip (RFC 1952) and zlib (RFC 1950) unwrapping. This is the decompressor everything downstream needs: gzip HTTP bodies, PNG IDAT, git objects. Structure follows Mark Adler's `puff.c`. Compress with [`std/deflate`](deflate).

```milo
from "std/Inflate.raw" import { Inflate }
```

## Functions

Each entry point returns a `Result` — malformed input or a checksum mismatch is an error, not a crash.

### Inflate.raw

```milo
fn Inflate.raw(src: &string): Result<string, string>
```

Decompresses a raw DEFLATE stream (no container header).

### Inflate.gzip

```milo
fn Inflate.gzip(src: &string): Result<string, string>
```

Unwraps a gzip stream and decompresses its body.

### Inflate.zlib

```milo
fn Inflate.zlib(src: &string): Result<string, string>
```

Unwraps a zlib stream and decompresses its body.
