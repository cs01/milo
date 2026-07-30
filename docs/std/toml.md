# std/toml

## std/toml

### `Toml.bool`

```milo
fn Toml.bool(self: &Toml, key: &string): Option<bool>
```

_Undocumented._

### `Toml.f64`

```milo
fn Toml.f64(self: &Toml, key: &string): Option<f64>
```

_Undocumented._

### `Toml.i64`

```milo
fn Toml.i64(self: &Toml, key: &string): Option<i64>
```

_Undocumented._

### `Toml.parse`

```milo
fn Toml.parse(s: string): Result<Toml>
```

Parse a TOML document. Access values via t.str/i64/f64/bool/table.

### `Toml.str`

```milo
fn Toml.str(self: &Toml, key: &string): Option<string>
```

_Undocumented._

### `Toml.table`

```milo
fn Toml.table(self: &Toml, key: &string): Option<Toml>
```

_Undocumented._
