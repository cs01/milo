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
    Some(home) => writeStdout(home),
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

### Env.set

```milo
fn Env.set(name: &string, value: &string): Result<Unit, EnvError>
```

Set a variable in **this** process's environment, replacing any current value. Children
spawned afterwards inherit it; the parent shell never sees it. To give one child a
variable without changing your own environment, use `Command.env` in `std/process`.

`EnvError.InvalidName` means the name was empty or contained `=`.

```milo
let _ = Env.set("RUST_LOG", "debug")!
```

::: warning Not thread-safe
C's `setenv` may free the block a concurrent `getenv` is reading, and no platform offers
a thread-safe version. It is safe from a single-threaded program and from green tasks
(which never switch inside this call), but **not** concurrently with `Promise.blocking`
work, which runs on real OS threads and may call `getenv` through any C library. Set the
environment during startup, before spawning anything — the same advice Go and Rust give.
:::

### Env.remove

```milo
fn Env.remove(name: &string): Result<Unit, EnvError>
```

Remove a variable from this process's environment. Removing a name that is not set
succeeds. Same thread-safety limits as `Env.set`.
