# std/log

## std/log

### `Log.bool`

```milo
fn Log.bool(key: &string, val: bool): LogFields
```

Start an unnamed record with a boolean field.

### `Log.debug`

```milo
fn Log.debug(msg: &string): void
```

Log a field-less debug record.

### `Log.error`

```milo
fn Log.error(msg: &string): void
```

Log a field-less error record.

### `Log.float`

```milo
fn Log.float(key: &string, val: f64): LogFields
```

Start an unnamed record with a floating-point field.

### `Log.format`

```milo
fn Log.format(): LogFormat
```

The current record format.

### `Log.info`

```milo
fn Log.info(msg: &string): void
```

Log a field-less info record.

### `Log.int`

```milo
fn Log.int(key: &string, val: i64): LogFields
```

Start an unnamed record with an integer field.

### `Log.isEnabled`

```milo
fn Log.isEnabled(level: LogLevel): bool
```

True when a record at `level` would be emitted. Check this before building
an expensive message or field set; the level methods check it themselves,
but only after their arguments have been evaluated.

### `Log.level`

```milo
fn Log.level(): LogLevel
```

The current threshold.

### `Log.setFormat`

```milo
fn Log.setFormat(format: LogFormat): void
```

Choose how records render. Defaults to `LogFormat.Text`.

### `Log.setLevel`

```milo
fn Log.setLevel(level: LogLevel): void
```

Discard records below `level`. Defaults to `Info`; `LogLevel.Off` silences
the logger entirely.

### `Log.setSinkFd`

```milo
fn Log.setSinkFd(fd: i32): void
```

Send records to an already-open descriptor — 2 (the default) for stderr,
1 for stdout, or a descriptor you opened. The descriptor stays yours: this
module never closes it, and it must outlive the last record.

### `Log.setSinkPath`

```milo
fn Log.setSinkPath(path: &string): Result<Unit, IoError>
```

Append records to `path`, creating it if absent. The descriptor is opened
and owned here for the life of the process (or until the sink is replaced).
O_APPEND is what makes concurrent whole-record writes atomic at any size.

### `Log.setTimestamps`

```milo
fn Log.setTimestamps(enabled: bool): void
```

Prepend an ISO-8601 UTC timestamp to every record. On by default; turn it
off when the sink already stamps lines (journald, a container runtime) or
when output must be byte-for-byte reproducible.

### `Log.str`

```milo
fn Log.str(key: &string, val: &string): LogFields
```

Start an unnamed record with a text field, e.g.
`Log.str("path", p).int("bytes", n).info("uploaded")`.

### `Log.warn`

```milo
fn Log.warn(msg: &string): void
```

Log a field-less warn record.

### `LogFields.bool`

```milo
fn LogFields.bool(self: LogFields, key: &string, val: bool): LogFields
```

Append a boolean field, rendered as `true`/`false` unquoted.

### `LogFields.debug`

```milo
fn LogFields.debug(self: LogFields, msg: &string): void
```

Emit the record at debug level, consuming it.

### `LogFields.error`

```milo
fn LogFields.error(self: LogFields, msg: &string): void
```

Emit the record at error level, consuming it.

### `LogFields.float`

```milo
fn LogFields.float(self: LogFields, key: &string, val: f64): LogFields
```

Append a floating-point field, rendered unquoted in both formats. A NaN or
infinite value is quoted instead, since JSON has no literal for it.

### `LogFields.info`

```milo
fn LogFields.info(self: LogFields, msg: &string): void
```

Emit the record at info level, consuming it.

### `LogFields.int`

```milo
fn LogFields.int(self: LogFields, key: &string, val: i64): LogFields
```

Append an integer field, rendered unquoted in both formats.

### `LogFields.str`

```milo
fn LogFields.str(self: LogFields, key: &string, val: &string): LogFields
```

Append a text field. The value is copied, and quoted on output whenever
bare text would be ambiguous.

### `LogFields.warn`

```milo
fn LogFields.warn(self: LogFields, msg: &string): void
```

Emit the record at warn level, consuming it.

### `Logger.bool`

```milo
fn Logger.bool(self: &Logger, key: &string, val: bool): LogFields
```

Start a named record with a boolean field.

### `Logger.debug`

```milo
fn Logger.debug(self: &Logger, msg: &string): void
```

Log a field-less debug record under this logger's name.

### `Logger.error`

```milo
fn Logger.error(self: &Logger, msg: &string): void
```

Log a field-less error record under this logger's name.

### `Logger.float`

```milo
fn Logger.float(self: &Logger, key: &string, val: f64): LogFields
```

Start a named record with a floating-point field.

### `Logger.info`

```milo
fn Logger.info(self: &Logger, msg: &string): void
```

Log a field-less info record under this logger's name.

### `Logger.int`

```milo
fn Logger.int(self: &Logger, key: &string, val: i64): LogFields
```

Start a named record with an integer field.

### `Logger.new`

```milo
fn Logger.new(name: &string): Logger
```

Create a logger tagging every record with `name`. Cheap enough to keep one
per subsystem in a global or a struct field.

### `Logger.str`

```milo
fn Logger.str(self: &Logger, key: &string, val: &string): LogFields
```

Start a named record with a text field.

### `Logger.warn`

```milo
fn Logger.warn(self: &Logger, msg: &string): void
```

Log a field-less warn record under this logger's name.
