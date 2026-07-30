# std/env

Environment variable access.

```milo
from "std/env" import { Env }
```

## Functions

### Env.get

```milo
fn Env.get(name: string): Option<string>
```

Look up an environment variable. Returns `None` if unset.

```milo
match Env.get("HOME") {
    Some(home) => writeStdout(&home),
    None => writeStdout("HOME not set"),
}
```

### Env.getOr

```milo
fn Env.getOr(name: string, fallback: string): string
```

Look up an environment variable with a default.

```milo
let port = Env.getOr("PORT", "8080")
```
