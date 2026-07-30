# std/path

## std/path

### `Path.basename`

```milo
fn Path.basename(path: &string): string
```

_Undocumented._

### `Path.dirname`

```milo
fn Path.dirname(path: &string): string
```

_Undocumented._

### `Path.ext`

```milo
fn Path.ext(path: &string): string
```

_Undocumented._

### `Path.join`

```milo
fn Path.join(a: &string, b: &string): string
```

_Undocumented._

### `Path.stem`

```milo
fn Path.stem(path: &string): string
```

_Undocumented._

### `pathBasename`

```milo
fn pathBasename(path: &string): string
```

Final component of the path (the file name), directories stripped.

### `pathDirname`

```milo
fn pathDirname(path: &string): string
```

Directory portion of the path (everything before the final component).

### `pathExt`

```milo
fn pathExt(path: &string): string
```

File extension including the leading dot (e.g. ".txt"); empty if none.

### `pathJoin`

```milo
fn pathJoin(a: &string, b: &string): string
```

Join two segments with a single "/" separator (avoids doubling an existing one).

### `pathStem`

```milo
fn pathStem(path: &string): string
```

File name without its extension (basename minus pathExt).
