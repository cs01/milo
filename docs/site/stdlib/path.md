# std/path

Path manipulation utilities.

```milo
from "std/path" import { Path }
```

## Functions

### Path.ext

```milo
fn Path.ext(path: &string): string
```

Extract the file extension including the dot. Returns `""` if none.

```milo
Path.ext("archive.tar.gz")  // ".gz"
```

### Path.basename

```milo
fn Path.basename(path: &string): string
```

Extract the final component of a path.

```milo
Path.basename("/home/user/file.txt")  // "file.txt"
```

### Path.dirname

```milo
fn Path.dirname(path: &string): string
```

Extract the directory portion of a path.

```milo
Path.dirname("/home/user/file.txt")  // "/home/user"
```

### Path.join

```milo
fn Path.join(a: &string, b: &string): string
```

Join two path segments with a separator.

```milo
Path.join("/home/user", "docs")  // "/home/user/docs"
```

### Path.stem

```milo
fn Path.stem(path: &string): string
```

Extract the filename without its extension.

```milo
Path.stem("report.pdf")  // "report"
```
