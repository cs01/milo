# std/regex.linux

## std/regex.linux

### `Regex.compile`

```milo
fn Regex.compile(pattern: string): Result<Regex>
```

_Undocumented._

### `Regex.compileFlags`

```milo
fn Regex.compileFlags(pattern: string, flags: i32): Result<Regex>
```

_Undocumented._

### `Regex.find`

```milo
fn Regex.find(self: &Regex, input: &string): Option<RegexMatch>
```

_Undocumented._

### `Regex.findAll`

```milo
fn Regex.findAll(self: &Regex, input: &string): Vec<RegexMatch>
```

_Undocumented._

### `Regex.isMatch`

```milo
fn Regex.isMatch(self: &Regex, input: &string): bool
```

_Undocumented._
