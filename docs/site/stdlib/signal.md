# std/signal

POSIX signal handling.

```milo
from "std/signal" import { onSignal, ignoreSignal, resetSignal, SIGINT, SIGTERM, SIGHUP, SIGQUIT, SIGABRT, SIGKILL, SIGALRM }
```

## Constants

| Name | Value | Description |
|------|-------|-------------|
| `SIGHUP` | 1 | Hangup |
| `SIGINT` | 2 | Interrupt (Ctrl+C) |
| `SIGQUIT` | 3 | Quit |
| `SIGABRT` | 6 | Abort |
| `SIGKILL` | 9 | Kill (cannot be caught) |
| `SIGALRM` | 14 | Alarm timer |
| `SIGTERM` | 15 | Termination |

## Functions

### onSignal

```milo
fn onSignal(sig: i32, handler: *u8)
```

Register a handler for the given signal. The handler receives the signal number.

`handler` must be a **top-level `fn (i32): void` passed as a raw pointer** — `myHandler as *u8` — never a closure. A C signal handler has no user-data slot, so a captured environment has nowhere to live: the closure's code pointer takes `(env, sig)`, C calls it with the signal number in the `env` slot, and the handler reads garbage as its `sig`.

### ignoreSignal

```milo
fn ignoreSignal(sig: i32)
```

Set the signal disposition to ignore. The signal will be silently discarded.

### resetSignal

```milo
fn resetSignal(sig: i32)
```

Reset the signal to its default disposition.

## Example

```milo
from "std/signal" import { onSignal, SIGINT, SIGTERM }
from "std/os" import { exit }

fn onInterrupt(_sig: i32): void {
    print("caught interrupt, cleaning up...")
    exit(0)
}

fn onTerminate(_sig: i32): void {
    print("terminated")
    exit(0)
}

fn main(): i32 {
    onSignal(SIGINT, onInterrupt as *u8)
    onSignal(SIGTERM, onTerminate as *u8)

    // main loop...
    return 0
}
```
