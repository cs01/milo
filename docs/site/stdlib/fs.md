# std/fs

Filesystem metadata, directory listing and traversal, and read-by-path helpers.

```milo
from "std/fs" import { readFile, readDir, walkDir, glob, mkdirAll, removeAll, writeFile }
```

## Types

### FileInfo

```milo
struct FileInfo {
    size: i64,
    mode: i32,
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

### WalkEntry

```milo
struct WalkEntry {
    path: string,     // full path: walk root joined with relPath
    relPath: string,  // path relative to the walk root
    isDir: bool,
}
```

## Reading and writing

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

### writeFile

```milo
fn writeFile(path: &string, data: &string): Result<i64, IoError>
```

Write a string to a file (creates or truncates). Returns bytes written.

### copyFile

```milo
fn copyFile(src: &string, dst: &string): Result<Unit, IoError>
```

Copy file contents through a 64 KiB buffer, so size is not bounded by memory.
`dst` is created 0644 and made 0755 when `src` is executable; other permissions,
timestamps and xattrs are not copied.

## Metadata

### fileInfo

```milo
fn fileInfo(path: &string): Option<FileInfo>
```

Metadata for a path, or `None` when it cannot be inspected.

### pathExists / isDir / isFile / isSymlink

```milo
fn pathExists(path: &string): bool
fn isDir(path: &string): bool
fn isFile(path: &string): bool
fn isSymlink(path: &string): bool
```

Convenience predicates. `isSymlink` does not follow the link, so a dangling link
is still a link.

### fileSizePath

```milo
fn fileSizePath(path: &string): Option<i64>
```

File size in bytes, or `None` when the file cannot be opened.

## Directories

### readDir

```milo
fn readDir(path: &string): Result<Vec<DirEntry>, IoError>
```

List one directory. An empty directory is distinct from a failed read.

```milo
for entry in readDir(".")! {
    if entry.isFile {
        print(entry.name)
    }
}
```

### walkDir

```milo
fn walkDir(root: &string): Result<Vec<WalkEntry>, IoError>
```

Every entry below `root`, parents before children. Symlinks are never followed,
so a link to a directory comes back with `isDir: false` and no children. Eager:
the whole tree is materialized before the first entry is visible. One unreadable
directory fails the call rather than silently shortening the list.

### mkdirAll

```milo
fn mkdirAll(path: &string, mode: i32): Result<Unit, IoError>
```

`mkdir -p`. Succeeds when the directory already exists; `mode` applies only to
directories this call creates.

### removeAll

```milo
fn removeAll(path: &string): Result<Unit, IoError>
```

`rm -rf`. Symlinks are removed, never followed. A missing path is success.
Failure is not all-or-nothing: it stops at the first entry it cannot remove and
leaves the rest in place.

### makeTempDir / makeTempFile

```milo
fn makeTempDir(prefix: &string): Result<string, IoError>
fn makeTempFile(prefix: &string): Result<string, IoError>
```

Create a uniquely named directory (0700) or empty file (0600) and return its
path. The argument is a path *prefix*, not a parent directory. Cleanup is the
caller's.

## Globbing

### globMatch

```milo
fn globMatch(pattern: &string, text: &string): bool
```

Pure pattern match — it never touches the filesystem, so it works on any
`/`-separated string.

| Pattern | Matches |
|---|---|
| `?` | one byte, never `/` |
| `*` | any run of bytes inside one segment, never `/` |
| `**` | as a whole segment: zero or more segments |
| `[abc]` `[a-z]` | one byte from the set |
| `[!a-z]` `[^a-z]` | one byte outside the set |
| `\*` | a literal `*` |

`**` is special only as a complete segment: `src/**/*.milo` crosses directories,
`src/**.milo` is just `src/*.milo`.

### glob

```milo
fn glob(root: &string, pattern: &string): Result<Vec<string>, IoError>
```

Every path under `root` whose path *relative to* `root` matches `pattern`.
Returned paths are root-prefixed and sorted.

```milo
for src in glob("src", "**/*.milo")! {
    print(src)
}
```
