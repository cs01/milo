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
