# std/zip

## std/zip

### `findEocd`

```milo
fn findEocd(src: &string): i64
```

Locate the End Of Central Directory record by scanning back for its signature
(0x06054b50). The trailing comment is variable-length, so we search rather than
index from the end.

### `le16`

```milo
fn le16(src: &string, p: i64): i64
```

_Undocumented._

### `le32`

```milo
fn le32(src: &string, p: i64): i64
```

_Undocumented._

### `Zip.read`

```milo
fn Zip.read(src: &string): Result<Vec<ZipEntry>, string>
```

_Undocumented._

### `zipRead`

```milo
fn zipRead(src: &string): Result<Vec<ZipEntry>, string>
```

Read every entry, decompressing and CRC-checking each.
