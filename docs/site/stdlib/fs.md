# std/fs

Filesystem metadata, directory listing, and read-by-path helpers.

```milo
from "std/fs" import { readFile, readLines, readDir, fileInfo, pathExists, writeFile }
```

## Types

### FileInfo

```milo
struct FileInfo {
    size: i64,
    mode: i32,
    exists: bool,
}
```

### DirEntry

```milo
struct DirEntry {
    name: string,
    isDir: bool,
    isFile: bool,
}
```

## Functions

### readFile

```milo
fn readFile(path: &string): Result<string, IoError>
```

Read an entire file by path.

```milo
let contents = readFile("config.txt")!
```

### readLines

```milo
fn readLines(path: &string): Result<Vec<string>, IoError>
```

Read a file and split it into lines.

### splitLines

```milo
fn splitLines(content: &string): Vec<string>
```

Split a string on newlines.

### fileInfo

```milo
fn fileInfo(path: &string): FileInfo
```

Get metadata for a path. If the path doesn't exist, `exists` is `false`.

### pathExists

```milo
fn pathExists(path: &string): bool
```

Check whether a path exists.

### isDir

```milo
fn isDir(path: &string): bool
```

Check whether a path is a directory.

### isFile

```milo
fn isFile(path: &string): bool
```

Check whether a path is a regular file.

### fileSizePath

```milo
fn fileSizePath(path: &string): i64
```

Get file size in bytes by path.

### readDir

```milo
fn readDir(path: &string): Vec<DirEntry>
```

List entries in a directory.

```milo
let entries = readDir(".")
for entry in entries {
    if entry.isFile {
        writeStdout(&entry.name)
        writeStdout("\n")
    }
}
```

### writeFile

```milo
fn writeFile(path: &string, data: &string): Result<i64, IoError>
```

Write a string to a file (creates or truncates). Returns bytes written.
