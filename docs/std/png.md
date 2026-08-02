# std/png

## std/png

### `encodePng`

```milo
pub fn encodePng(pixels: &string, width: i64, height: i64, channels: i64): Result<string, string>
```

Encode 8-bit truecolour (3 channels) or truecolour+alpha (4) to a PNG.

Every scanline is written with filter type 0 (None). Filtering exists to make
the deflate stream smaller, and the encoder's job here is to be obviously
correct rather than small — the filters are the part of PNG that is easy to
get subtly wrong, and this is the write side of a decoder that already has to
implement all five of them to read other people's files.

### `Png.decode`

```milo
fn Png.decode(src: &string): Result<PngImage, string>
```

_Undocumented._

### `Png.encode`

```milo
fn Png.encode(pixels: &string, width: i64, height: i64, channels: i64): Result<string, string>
```

_Undocumented._
