# std/io

Stdin/stdout and owned file handles. (Read-by-path helpers — `readFile`, `readLines`,
`splitLines` — live in [`std/fs`](fs).)

```milo
from "std/io" import { File, writeStdout }
```

## Types

### File

```milo
struct File {
    fd: i32,
}
```

An owned file descriptor. Closed automatically when dropped.

### IoError

```milo
enum IoError {
    NotFound(string),
    PermissionDenied(string),
    IsDirectory(string),
    AlreadyExists(string),
    Other(string),
}
```

## Functions

### writeStdout

```milo
fn writeStdout(s: &string)
```

Write a string to stdout.

### putChar

```milo
fn putChar(c: u8)
```

Write a single byte to stdout.

### readStdin

```milo
fn readStdin(): string
```

Read all of stdin to a string.

### readLine

```milo
fn readLine(): Option<string>
```

Read a single line from stdin. Returns `None` at EOF.

### File.openRead

```milo
fn File.openRead(path: &string): Result<File, IoError>
```

Open a file for reading.

### File.openWrite

```milo
fn File.openWrite(path: &string): Result<File, IoError>
```

Open a file for writing (creates or truncates).

### File.openAppend

```milo
fn File.openAppend(path: &string): Result<File, IoError>
```

Open a file for appending (creates if missing).

### f.fileSize

```milo
fn fileSize(self: &File): i64
```

Get the size of an open file in bytes.

### f.readAll

```milo
fn readAll(self: &File): Result<string, IoError>
```

Read the entire contents of an open file.

### f.writeAll

```milo
fn writeAll(self: &File, data: &string): Result<i64, IoError>
```

Write a string to an open file. Returns bytes written.
