# std/toml

TOML v1.0.0 parsing and serialization.

```milo
from "std/toml" import { Toml, TomlKind }
```

The parser is a flat node pool with a lightweight handle, the same shape as
[`std/json`](json), and it shares that module's accessor vocabulary name for name.
A document is parsed once, up front: a key that is present but malformed is a
parse error with a line and column, never a `None` that looks like absence.

## Types

### Toml

A parsed document, or a handle onto one node of it. `get`, `at`, `table` and
`path` return a `Toml` rooted at the value they found.

### TomlKind

```milo
enum TomlKind: i32 { Str, Int, Float, Bool, DateTime, Array, Table }
```

`Int` and `Float` are distinct, as they are in TOML — `1` and `1.0` do not read
back the same way.

## Parsing

```milo
fn Toml.parse(input: string): Result<Toml>
```

Parses a TOML v1.0.0 document. The error carries a message plus the line and
column it was detected at:

```
toml: duplicate key 'name' (line 2, column 1)
```

Duplicate keys, duplicate table headers, redefining a table as a non-table and
extending an inline table are all errors, not last-wins.

## Reading values

Borrows are implicit — pass the key bare, never `&key`.

```milo
fn str(&self, key: &string): Option<string>
fn i64(&self, key: &string): Option<i64>
fn f64(&self, key: &string): Option<f64>
fn bool(&self, key: &string): Option<bool>
fn get(&self, key: &string): Option<Toml>
fn table(&self, key: &string): Option<Toml>
fn keys(&self): Vec<string>
```

Arrays index with `at`, and `len` counts array elements or table entries:

```milo
fn at(&self, index: i64): Option<Toml>
fn len(&self): i64
```

A handle's own value comes out bare:

```milo
fn asStr(&self): Option<string>
fn asI64(&self): Option<i64>
fn asF64(&self): Option<f64>
fn asBool(&self): Option<bool>
fn kind(&self): TomlKind
fn isStr(&self): bool
fn isNum(&self): bool
fn isInt(&self): bool
fn isFloat(&self): bool
fn isBool(&self): bool
fn isDateTime(&self): bool
fn isArray(&self): bool
fn isTable(&self): bool
```

`i64` answers `None` for a float: TOML's `1.0` is not an integer, and truncating
it silently would lose data. `f64` widens an integer, so a config that writes
`timeout = 5` still reads as a float.

## Paths

Dotted paths collapse a nested walk into one `Option`, so `?? fallback` finishes
the job:

```milo
fn path(&self, p: &string): Option<Toml>
fn strPath(&self, p: &string): Option<string>
fn i64Path(&self, p: &string): Option<i64>
fn f64Path(&self, p: &string): Option<f64>
fn boolPath(&self, p: &string): Option<bool>
```

```milo
let host = config.strPath("server.host") ?? "127.0.0.1"
let port = config.i64Path("server.port") ?? 8080
let first = config.strPath("bin[0].name")
```

A key that itself contains `.` or `[` is not addressable this way — reach it with
`get`.

## Cursors

`get`/`at`/`table`/`path` copy the pool to hand back an owned document, so a walk
that uses them at every level is quadratic. A cursor is a plain `i64` node index
into the same document; navigation allocates nothing and `-1` means "nothing
here", so the walk is total for any input.

```milo
fn curRoot(&self): i64
fn curChild(&self, cur: i64, index: i64): i64
fn curKey(&self, cur: i64, index: i64): Option<string>
fn curField(&self, cur: i64, key: &string): i64
fn curLen(&self, cur: i64): i64
fn curKind(&self, cur: i64): Option<TomlKind>
fn curStr(&self, cur: i64): Option<string>
fn curInt(&self, cur: i64): Option<i64>
fn curFloat(&self, cur: i64): Option<f64>
fn curBool(&self, cur: i64): Option<bool>
fn curPath(&self, p: &string): i64
```

Unlike `std/json`'s, `curChild` indexes tables as well as arrays and `curKey`
names the child it lands on, which is what makes a generic walk over a document
possible without cloning at every level.

## Writing

```milo
fn stringify(&self): string
```

Emits valid TOML that re-parses to an equal document. Scalars come first at each
level, then `[table]` sections, then `[[array of tables]]` blocks — a bare key
written after a header would belong to that header's table. Inline-ness is not
preserved; values, types and structure are.

## Datetimes

The four TOML datetime forms — offset date-time, local date-time, local date and
local time — are recognised and range-checked, tagged `TomlKind.DateTime`, and
carry their **original lexical text**, read back with `asStr`:

```milo
let released = config.str("released_at")   // "2026-08-14T09:15:00Z"
match config.get("released_at") {
    Option.Some(v) => { print(v.isDateTime().toString()) }
    Option.None => { print("absent") }
}
```

Typing them over `std/datetime` is future work. The parser deliberately builds no
temporal values: a lossy conversion would be worse than the text it came from.

## Example

```milo
from "std/toml" import { Toml }
from "std/fs" import { readFile }

pub fn main(): i32 {
    let text = readFile("config.toml")!
    let config = Toml.parse(text)!

    let title = config.str("title") ?? "untitled"
    let port = config.i64Path("server.port") ?? 8080

    match config.table("database") {
        Option.Some(db) => {
            let host = db.str("host") ?? "localhost"
            let maxConn = db.i64("max_connections") ?? 10
            print(host + ":" + maxConn.toString())
        }
        Option.None => {
            print("no [database] section")
        }
    }

    let peers = config.get("peer")
    match peers {
        Option.Some(list) => {
            var i: i64 = 0
            while i < list.len() {
                print(list.at(i)!.str("name") ?? "?")
                i = i + 1
            }
        }
        Option.None => {}
    }
    return 0
}
```

## Conformance

`scripts/toml-oracle.py` differential-tests the parser and the serializer against
Python's `tomllib` over `tests/toml-corpus/`: every valid file must agree on
values *and* types, and every file under `invalid/` must be rejected by both.
Feature-by-feature assertions live in `tests/fixtures/tomlFeatures.milo`,
`tomlErrors.milo` and `tomlStringify.milo`.
