# std/string

String search, transform, and inspect operations are **methods** on any `string` value —
no import needed. The character-class helpers below are free functions imported from `std/string`.

```milo
let name = "  Alice  "
let clean = name.trim().toLower()   // "alice"
```

## String methods

### `s.contains`

```milo
fn contains(self: &string, needle: &string): bool
```

True if `s` contains `needle`.

### `s.indexOf` / `s.lastIndexOf`

```milo
fn indexOf(self: &string, needle: &string): i64
```

Byte index of the first (last) occurrence of `needle`, or `-1`.

### `s.indexOfFrom`

```milo
fn indexOfFrom(self: &string, needle: &string, start: i64): i64
```

Like `indexOf`, but begins searching from byte offset `start`.

### `s.startsWith` / `s.endsWith`

```milo
fn startsWith(self: &string, prefix: &string): bool
```

True if `s` starts with `prefix` (ends with `suffix`).

### `s.toLower` / `s.toUpper`

```milo
fn toLower(self: &string): string
```

New string with all ASCII characters lower- (upper-) cased.

### `s.trim` / `s.trimStart` / `s.trimEnd`

```milo
fn trim(self: &string): string
```

New string with whitespace removed from both ends (start, end).

### `s.split`

```milo
fn split(self: &string, delimiter: &string): Vec<string>
```

Split by `delimiter`.

```milo
let parts = "a,b,c".split(",")   // ["a", "b", "c"]
```

### `s.splitWords` / `s.splitWhitespace`

```milo
fn splitWhitespace(self: &string): Vec<string>
```

Split on runs of ASCII whitespace.

### `s.replace` / `s.replaceFirst`

```milo
fn replace(self: &string, old: &string, new: &string): string
```

Replace all (or the first) occurrence of `old` with `new`.

### `s.repeat`

```milo
fn repeat(self: &string, count: i64): string
```

`s` repeated `count` times.

### `s.padStart` / `s.padEnd`

```milo
fn padStart(self: &string, targetLen: i64, pad: &string): string
```

Pad to `targetLen` on the start (end).

### Other

`s.len()`, `s.isEmpty()`, `s.charAt(i)`, `s.reverse()`, `s.substr(start, end)`, `s.slice(start, end)`.

## Character helpers

```milo
from "std/string" import { charIsWhitespace, charIsDigit, charIsAlpha, charIsAlphanumeric }
```

Each takes a `u8` byte and returns `bool`: `charIsWhitespace(c)`, `charIsDigit(c)`,
`charIsAlpha(c)`, `charIsAlphanumeric(c)`.
