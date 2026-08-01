# std/string

## std/string

### `asciiIsAlpha`

```milo
pub fn asciiIsAlpha(ch: u8): bool
```

Check if a byte is an ASCII letter.

### `asciiIsAlphanumeric`

```milo
pub fn asciiIsAlphanumeric(ch: u8): bool
```

Check if a byte is an ASCII letter or digit.

### `asciiIsControl`

```milo
pub fn asciiIsControl(ch: u8): bool
```

_Undocumented._

### `asciiIsDigit`

```milo
pub fn asciiIsDigit(ch: u8): bool
```

Check if a byte is an ASCII digit.

### `asciiIsHexDigit`

```milo
pub fn asciiIsHexDigit(ch: u8): bool
```

_Undocumented._

### `asciiIsLower`

```milo
pub fn asciiIsLower(ch: u8): bool
```

_Undocumented._

### `asciiIsPrintable`

```milo
pub fn asciiIsPrintable(ch: u8): bool
```

_Undocumented._

### `asciiIsPunctuation`

```milo
pub fn asciiIsPunctuation(ch: u8): bool
```

_Undocumented._

### `asciiIsUpper`

```milo
pub fn asciiIsUpper(ch: u8): bool
```

_Undocumented._

### `asciiIsWhitespace`

```milo
pub fn asciiIsWhitespace(ch: u8): bool
```

Check if a byte is ASCII whitespace.

### `asciiToLower`

```milo
pub fn asciiToLower(ch: u8): u8
```

_Undocumented._

### `asciiToUpper`

```milo
pub fn asciiToUpper(ch: u8): u8
```

_Undocumented._

### `strContainsIgnoreCase`

```milo
pub fn strContainsIgnoreCase(haystack: &string, needle: &string): bool
```

True if `needle` occurs anywhere in `haystack`, ignoring ASCII case.

### `strIndexOfFromIgnoreCase`

```milo
pub fn strIndexOfFromIgnoreCase(haystack: &string, needle: &string, pos: i64): i64
```

First occurrence of `needle` in `haystack` at or after `pos`, comparing ASCII
letters case-insensitively, or -1.

Same memchr skip as strIndexOfFrom, with two differences that both come from case
folding:

  - The scan anchors on the first byte of the needle that is NOT a letter. That
    byte has one spelling, so memchr runs once instead of once per case, and a
    digit or punctuation byte is rarer in text than a letter, so each call rejects
    far more. Searching "uint256" case-insensitively anchors on '2', not 'u'.
    A needle that is all letters falls back to the two-pass scan on byte 0.
  - When two passes ARE running, only the one whose hit was just consumed is
    re-run. Refreshing both after every failed verify re-scans the rest of the
    buffer per candidate, which is quadratic in candidate count.

The verify is a byte loop rather than strncasecmp: the MSVC CRT spells that
`_strnicmp`, and this file is in the prelude of every program on every platform.
It only runs on candidate positions, which memchr has already made rare.
