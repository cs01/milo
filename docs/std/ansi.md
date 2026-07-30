# std/ansi

## std/ansi

### `Ansi.bg24`

```milo
fn Ansi.bg24(r: i64, g: i64, b: i64): string
```

_Undocumented._

### `Ansi.bg256`

```milo
fn Ansi.bg256(code: i64): string
```

_Undocumented._

### `Ansi.clearLine`

```milo
fn Ansi.clearLine(): string
```

_Undocumented._

### `Ansi.clearScreen`

```milo
fn Ansi.clearScreen(): string
```

_Undocumented._

### `Ansi.clearToEnd`

```milo
fn Ansi.clearToEnd(): string
```

_Undocumented._

### `Ansi.cursorColumn`

```milo
fn Ansi.cursorColumn(col: i64): string
```

_Undocumented._

### `Ansi.cursorDown`

```milo
fn Ansi.cursorDown(n: i64): string
```

_Undocumented._

### `Ansi.cursorHome`

```milo
fn Ansi.cursorHome(): string
```

_Undocumented._

### `Ansi.cursorLeft`

```milo
fn Ansi.cursorLeft(n: i64): string
```

_Undocumented._

### `Ansi.cursorRight`

```milo
fn Ansi.cursorRight(n: i64): string
```

_Undocumented._

### `Ansi.cursorTo`

```milo
fn Ansi.cursorTo(row: i64, col: i64): string
```

_Undocumented._

### `Ansi.cursorUp`

```milo
fn Ansi.cursorUp(n: i64): string
```

_Undocumented._

### `Ansi.disableBracketedPaste`

```milo
fn Ansi.disableBracketedPaste(): string
```

_Undocumented._

### `Ansi.enableBracketedPaste`

```milo
fn Ansi.enableBracketedPaste(): string
```

_Undocumented._

### `Ansi.enterAltScreen`

```milo
fn Ansi.enterAltScreen(): string
```

_Undocumented._

### `Ansi.exitAltScreen`

```milo
fn Ansi.exitAltScreen(): string
```

_Undocumented._

### `Ansi.fg24`

```milo
fn Ansi.fg24(r: i64, g: i64, b: i64): string
```

_Undocumented._

### `Ansi.fg256`

```milo
fn Ansi.fg256(code: i64): string
```

_Undocumented._

### `Ansi.hideCursor`

```milo
fn Ansi.hideCursor(): string
```

_Undocumented._

### `Ansi.pushBg24`

```milo
fn Ansi.pushBg24(buf: &mut string, r: i64, g: i64, b: i64): void
```

_Undocumented._

### `Ansi.pushFg24`

```milo
fn Ansi.pushFg24(buf: &mut string, r: i64, g: i64, b: i64): void
```

_Undocumented._

### `Ansi.reset`

```milo
fn Ansi.reset(): string
```

_Undocumented._

### `Ansi.restoreCursor`

```milo
fn Ansi.restoreCursor(): string
```

_Undocumented._

### `Ansi.saveCursor`

```milo
fn Ansi.saveCursor(): string
```

_Undocumented._

### `Ansi.showCursor`

```milo
fn Ansi.showCursor(): string
```

_Undocumented._

### `ansiPush24`

```milo
fn ansiPush24(buf: &mut string, lead: &string, r: i64, g: i64, b: i64): void
```

_Undocumented._

### `ansiPushRaw`

```milo
fn ansiPushRaw(buf: &mut string, s: &string): void
```

_Undocumented._

### `ansiPushU8`

```milo
fn ansiPushU8(buf: &mut string, n: i64): void
```


fg24/bg24 return a freshly-allocated string; in a per-cell loop that
allocation dominates. These append the same bytes straight into a caller's
buffer with zero allocation — the fast path behind full-screen animation.

### `ansiReset`

```milo
fn ansiReset(): string
```

Reset all attributes to the terminal default.

### `bg24`

```milo
fn bg24(r: i64, g: i64, b: i64): string
```

_Undocumented._

### `bg256`

```milo
fn bg256(code: i64): string
```

xterm-256 background SGR.

### `clearLine`

```milo
fn clearLine(): string
```

Erase from the cursor to the end of the line.

### `clearScreen`

```milo
fn clearScreen(): string
```

Erase the entire screen.

### `clearToEnd`

```milo
fn clearToEnd(): string
```

Erase from the cursor to the end of the screen — used to clear a shrinking
live region without repainting rows that are already correct.

### `cursorColumn`

```milo
fn cursorColumn(col: i64): string
```

Move to column `col` on the current row (1-based).

### `cursorDown`

```milo
fn cursorDown(n: i64): string
```

_Undocumented._

### `cursorHome`

```milo
fn cursorHome(): string
```

Cursor to home (row 1, col 1).

### `cursorLeft`

```milo
fn cursorLeft(n: i64): string
```

_Undocumented._

### `cursorRight`

```milo
fn cursorRight(n: i64): string
```

_Undocumented._

### `cursorTo`

```milo
fn cursorTo(row: i64, col: i64): string
```

Move the cursor to a 1-based (row, col).

### `cursorUp`

```milo
fn cursorUp(n: i64): string
```

Relative cursor motion. A frame renderer moving between nearby cells emits
far fewer bytes with these than by re-addressing absolutely via cursorTo.

### `disableBracketedPaste`

```milo
fn disableBracketedPaste(): string
```

_Undocumented._

### `enableBracketedPaste`

```milo
fn enableBracketedPaste(): string
```

Bracketed paste: with this on, pasted text arrives wrapped in
ESC[200~ / ESC[201~ so it is never mistaken for typed key chords.

### `enterAltScreen`

```milo
fn enterAltScreen(): string
```

Alternate screen buffer: a full-screen app switches to it on start and back
on exit, so the user's scrollback and prompt are restored untouched rather
than overwritten by the app's output.

### `exitAltScreen`

```milo
fn exitAltScreen(): string
```

_Undocumented._

### `fg24`

```milo
fn fg24(r: i64, g: i64, b: i64): string
```

Truecolor (24-bit) foreground / background — smooth gradients on terminals
that support it (most modern ones). r/g/b are 0–255.

### `fg256`

```milo
fn fg256(code: i64): string
```

xterm-256 foreground select-graphic-rendition for a palette index (0–255).

### `hideCursor`

```milo
fn hideCursor(): string
```

Hide / show the cursor — hide while drawing a full-screen UI, show on exit.

### `pushBg24`

```milo
fn pushBg24(buf: &mut string, r: i64, g: i64, b: i64): void
```

_Undocumented._

### `pushFg24`

```milo
fn pushFg24(buf: &mut string, r: i64, g: i64, b: i64): void
```

Append a 24-bit foreground / background SGR directly into buf (no allocation).

### `restoreCursor`

```milo
fn restoreCursor(): string
```

_Undocumented._

### `saveCursor`

```milo
fn saveCursor(): string
```

Cursor position save/restore, for writing outside the live region (a log
line, a status write) and returning without recomputing coordinates.

### `showCursor`

```milo
fn showCursor(): string
```

_Undocumented._
