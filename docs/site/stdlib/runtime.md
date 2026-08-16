# std/runtime

The green-task scheduler: cooperative tasks on one OS thread, and the fd waits that
make blocking I/O yield instead of stall.

```milo
from "std/runtime" import { Task, schedulerCurrent, schedulerYield, schedulerWaitRead, schedulerWaitWrite, schedulerRunToCompletion }
```

Most programs never import this. `std/io`, `std/net`, `std/fetch`, `std/timer`,
`std/sync` and `std/select` are built on it and already yield at the right moments —
reach for `std/runtime` when you are writing your own async primitive, or driving a
raw fd that no stdlib module wraps. See [Concurrency](/language/concurrency).

Tasks are green, not threads: they never run in parallel, so nothing here needs a
lock. Parallelism comes from `Promise.blocking`, which runs a closure on a worker.

## Types

### Task

```milo
struct Task
```

A handle to a spawned green task. `join` blocks the caller until it finishes.

## Spawning

```milo
fn Task.spawn(f: move () => void): Task
fn Task.spawnWithStack(f: move () => void, stackBytes: i64): Task
fn Task.join(self: &Task): void
```

`spawn` gives the task a default stack; `spawnWithStack` sets it explicitly for a task
with deep recursion or large frames. A task's stack does not grow, so a too-small one
overflows rather than reallocating.

```milo
var t = Task.spawn(() => {
    print("in a task")
})
t.join()
```

## Yielding and waiting

```milo
fn schedulerYield(): void
fn schedulerWaitRead(fd: i32): void
fn schedulerWaitWrite(fd: i32): void
```

`schedulerYield` hands control to the next runnable task. `schedulerWaitRead` /
`schedulerWaitWrite` park the current task until the fd is ready, which is what turns
a blocking read into a suspension point — register the fd with `std/event` first and
set it non-blocking, or the wait returns and the read still blocks.

## Driving the scheduler

```milo
fn schedulerCurrent(): *u8
fn schedulerRunToCompletion(): void
```

`schedulerCurrent` returns the running task, or null when the caller is not on the
scheduler. A std API that can be called from either context branches on it — that is
the check to copy when you write your own.

Milo has Go exit semantics: `main` returning ends the program whether or not tasks are
still running, and `main` itself *is* a green task wherever the program can spawn. Call
`schedulerRunToCompletion` when you want the opposite — block until every outstanding
task has finished, without threading a `WaitGroup` through them all.
