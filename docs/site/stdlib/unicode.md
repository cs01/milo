# std/unicode

UTF-8 decoding, code-point traversal, display width, and UTF-16 conversion.
ASCII byte classification lives in `std/string` and uses the `ascii` prefix.

```milo
from "std/unicode" import { codepoints, displayWidth, isAlphaStr, isNumeric }
```

## Text queries

- `codepointCount(s)` counts decoded Unicode code points.
- `codepoints(s)` returns the decoded `i32` code points.
- `nextCodepointBoundary(s, at)` returns a byte offset.
- `displayWidth(s)` returns terminal columns.
- `truncateToWidth(s, maxCols)` returns a byte offset that fits the column limit.
- `isAlphaStr(s)` and `isNumeric(s)` classify ASCII-only strings.

## Code points

`decodeCodepoint` returns a `CodePoint` containing the decoded value and byte
width. `encodeCodepoint` appends one code point to a UTF-8 string. Width and
emoji helpers take an `i32` code point, while the surrogate helpers explicitly
convert between code points and UTF-16 units.

```milo
let points = codepoints("Milo")
let columns = displayWidth("Milo")
```
