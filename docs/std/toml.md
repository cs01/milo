# std/toml

## std/toml

### `Toml.asBool`

```milo
fn Toml.asBool(self: &Toml): Option<bool>
```

The boolean value here.

### `Toml.asF64`

```milo
fn Toml.asF64(self: &Toml): Option<f64>
```

The float value here; an integer widens.

### `Toml.asI64`

```milo
fn Toml.asI64(self: &Toml): Option<i64>
```

The integer value here; None for a float, as with `i64`.

### `Toml.asStr`

```milo
fn Toml.asStr(self: &Toml): Option<string>
```

The string value here. A datetime answers with its original lexical text.

### `Toml.at`

```milo
fn Toml.at(self: &Toml, index: i64): Option<Toml>
```

The `index`-th element of this array. None for a table — a table's entries
are reached by key, or by cursor when the order matters.

### `Toml.bool`

```milo
fn Toml.bool(self: &Toml, key: &string): Option<bool>
```

The boolean at `key`.

### `Toml.boolPath`

```milo
fn Toml.boolPath(self: &Toml, p: &string): Option<bool>
```

The boolean at a dotted path.

### `Toml.curBool`

```milo
fn Toml.curBool(self: &Toml, cur: i64): Option<bool>
```

The boolean at the cursor.

### `Toml.curChild`

```milo
fn Toml.curChild(self: &Toml, cur: i64, index: i64): i64
```

The `index`-th child of the array or table at `cur`; -1 if there is none.

### `Toml.curField`

```milo
fn Toml.curField(self: &Toml, cur: i64, key: &string): i64
```

The value at `key` in the table at `cur`; -1 if absent or not a table.

### `Toml.curFloat`

```milo
fn Toml.curFloat(self: &Toml, cur: i64): Option<f64>
```

The float at the cursor; an integer widens.

### `Toml.curInt`

```milo
fn Toml.curInt(self: &Toml, cur: i64): Option<i64>
```

The integer at the cursor; None for a float.

### `Toml.curKey`

```milo
fn Toml.curKey(self: &Toml, cur: i64, index: i64): Option<string>
```

The key of the `index`-th entry of the table at `cur`.

### `Toml.curKind`

```milo
fn Toml.curKind(self: &Toml, cur: i64): Option<TomlKind>
```

The kind at the cursor, or None if the cursor is invalid.

### `Toml.curLen`

```milo
fn Toml.curLen(self: &Toml, cur: i64): i64
```

Child count at the cursor: array elements or table entries; 0 for a scalar.

### `Toml.curPath`

```milo
fn Toml.curPath(self: &Toml, p: &string): i64
```

Cursor at the end of a dotted path — "server.host", "bin[0].name". A missing
key, an out-of-range index or a shape mismatch yields -1, which every cursor
accessor reads as "nothing here", so the walk is total for any input. A key
containing '.' or '[' is not addressable this way; use get()/at().

### `Toml.curRoot`

```milo
fn Toml.curRoot(self: &Toml): i64
```


`get`/`at`/`table` above return an owned Toml by copying the whole pool per
call, so walking a large document with them is quadratic. A cursor is a plain
node index into THIS document: navigation is allocation-free (-1 = missing)
and only string reads materialize. Start at `curRoot()` and chain:
  let host = doc.curField(doc.curField(doc.curRoot(), "server"), "host")
  match doc.curStr(host) { Option.Some(s) => ..., Option.None => ... }

Unlike std/json's, `curChild` indexes tables as well as arrays, and
`curKey` names the child it lands on — that is what makes a generic walk
over a TOML document possible without cloning at every level.

### `Toml.curStr`

```milo
fn Toml.curStr(self: &Toml, cur: i64): Option<string>
```

The string at the cursor, materialized. A datetime answers with its lexical
text — the one place a cursor read allocates.

### `Toml.f64`

```milo
fn Toml.f64(self: &Toml, key: &string): Option<f64>
```

The float at `key`. An integer answers with its widened value.

### `Toml.f64Path`

```milo
fn Toml.f64Path(self: &Toml, p: &string): Option<f64>
```

The float at a dotted path; an integer widens.

### `Toml.get`

```milo
fn Toml.get(self: &Toml, key: &string): Option<Toml>
```

The value at `key` in this table, or None if the key is absent or this is
not a table.

### `Toml.i64`

```milo
fn Toml.i64(self: &Toml, key: &string): Option<i64>
```

The integer at `key`. A float answers None: TOML's `1.0` is not an integer,
and silently truncating it would lose data with no signal.

### `Toml.i64Path`

```milo
fn Toml.i64Path(self: &Toml, p: &string): Option<i64>
```

The integer at a dotted path.

### `Toml.isArray`

```milo
fn Toml.isArray(self: &Toml): bool
```

True for an array, whether written inline or as `[[table]]` elements.

### `Toml.isBool`

```milo
fn Toml.isBool(self: &Toml): bool
```

True for a boolean.

### `Toml.isDateTime`

```milo
fn Toml.isDateTime(self: &Toml): bool
```

An offset date-time, local date-time, local date or local time. Its lexical
text is read with `asStr`.

### `Toml.isFloat`

```milo
fn Toml.isFloat(self: &Toml): bool
```

True for a float only.

### `Toml.isInt`

```milo
fn Toml.isInt(self: &Toml): bool
```

True for an integer only — `1.0` is a float in TOML, not an int.

### `Toml.isNum`

```milo
fn Toml.isNum(self: &Toml): bool
```

True for both integers and floats — `isInt`/`isFloat` separate them.

### `Toml.isStr`

```milo
fn Toml.isStr(self: &Toml): bool
```

True only for a string; a datetime answers `isDateTime`.

### `Toml.isTable`

```milo
fn Toml.isTable(self: &Toml): bool
```

True for a table, whether written inline, as a `[header]`, or implied by a
dotted key.

### `Toml.keys`

```milo
fn Toml.keys(self: &Toml): Vec<string>
```

Every key of this table, in document order. Empty for a non-table.

### `Toml.kind`

```milo
fn Toml.kind(self: &Toml): TomlKind
```

What this node holds. The one accessor that tells `Str` from `DateTime`,
which both read back through `asStr`.

### `Toml.len`

```milo
fn Toml.len(self: &Toml): i64
```

Element count of an array, or entry count of a table; 0 for a scalar.

### `Toml.parse`

```milo
fn Toml.parse(s: string): Result<Toml>
```

Parse a TOML v1.0.0 document. The error carries a message plus the line and
column it was detected at. Propagate with `?` or match on the error.

### `Toml.path`

```milo
fn Toml.path(self: &Toml, p: &string): Option<Toml>
```

The value at a dotted path, whatever its kind.

### `Toml.str`

```milo
fn Toml.str(self: &Toml, key: &string): Option<string>
```

The string at `key`. A datetime answers with its original lexical text —
see `kind()` when the distinction matters.

### `Toml.stringify`

```milo
fn Toml.stringify(self: &Toml): string
```

Render back to TOML text that re-parses to an equal document. Scalars are
emitted first at each level, then `[table]` sections, then `[[array of
table]]` blocks, because a bare key after a header would belong to that
header's table. Inline-ness is not preserved — an inline table that owns
only tables comes back as a section — but values, types and structure are.

### `Toml.strPath`

```milo
fn Toml.strPath(self: &Toml, p: &string): Option<string>
```

The string at a dotted path — `t.strPath("server.host") ?? "localhost"`.

### `Toml.table`

```milo
fn Toml.table(self: &Toml, key: &string): Option<Toml>
```

The sub-table at `key` — TOML's spelling of std/json's object accessor.
