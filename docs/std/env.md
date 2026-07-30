# std/env

## std/env

### `Env.get`

```milo
fn Env.get(name: string): Option<string>
```

_Undocumented._

### `Env.getOr`

```milo
fn Env.getOr(name: string, defaultVal: string): string
```

_Undocumented._

### `getEnv`

```milo
fn getEnv(name: string): Option<string>
```

Value of environment variable `name`, or None if it isn't set.

### `getEnvOr`

```milo
fn getEnvOr(name: string, defaultVal: string): string
```

Value of environment variable `name`, or `defaultVal` if it isn't set.
