# std/sync

Channel, wait-group, once, and atomic primitives for coordinating green tasks and `Promise.blocking` workers.

```milo
from "std/sync" import { Channel, WaitGroup, Once, AtomicI64, AtomicI32, AtomicU64, AtomicBool }
```

There is no `Mutex` or `RwLock`: green tasks never run in parallel, and parallel `Promise.blocking` workers share state through channels (pass ownership) or atomics (lock-free counters and flags). See [Concurrency](/language/concurrency).

Every type here is a reference-counted handle. `.clone()` gives another task or worker its own owner, and the shared object frees itself when the last owner drops — there is no `destroy`.

**Every atomic operation on every type below is sequentially consistent (`seq_cst`)**, including both the success and failure orderings of a `cas`. There is no ordering parameter and no acquire/release/relaxed form. `add`/`sub` wrap on overflow, unlike ordinary Milo arithmetic, which traps.

## Types

### Channel

```milo
struct Channel {
    h: *u8,
}
```

Bounded FIFO channel for streaming values between green tasks and `Promise.blocking` workers. Blocks on send when full, blocks on recv when empty.

### WaitGroup

```milo
struct WaitGroup {
    _p: *u8,
}
```

Counting barrier — `add` before spawning, `done` from each task, `wait` for the counter to reach zero.

### Once

```milo
struct Once {
    _p: *u8,
}
```

Run-exactly-once initialization guard. Correct under green tasks and `Promise.blocking` threads alike — a green waiter parks, an OS-thread waiter blocks on a condition variable, and the main thread with a live scheduler drives it.

### AtomicI64

```milo
struct AtomicI64 {
    _ptr: *u8,
}
```

Lock-free signed 64-bit atomic integer.

### AtomicI32

```milo
struct AtomicI32 {
    _ptr: *u8,
}
```

Lock-free signed 32-bit atomic integer.

### AtomicU64

```milo
struct AtomicU64 {
    _ptr: *u8,
}
```

Lock-free unsigned 64-bit atomic integer. Rides the same instructions as `AtomicI64` — 64-bit atomics are bit-level operations with no notion of sign — so `add`/`sub` wrap through the full u64 range.

### AtomicBool

```milo
struct AtomicBool {
    _ptr: *u8,
}
```

Lock-free atomic boolean.

There is no `AtomicPtr`. A raw pointer is only dereferenceable inside `unsafe`, so an `AtomicPtr` would be `AtomicI64` plus a cast with no safety added — and Milo cannot state that the pointee outlives the load, so a safe-looking `AtomicPtr` would be a lifetime claim nothing checks. Share an index into a `Vec` or an arena `Handle` instead.

## Channel Methods

### Channel.new

```milo
fn Channel.new(capacity: i64): Result<Channel<T>>
```

Create a bounded channel with the given capacity.

### ch.send

```milo
fn Channel.send(self: &Channel, val: T): Result<i32>
```

Send a value into the channel. Blocks if full.

### ch.recv

```milo
fn Channel.recv(self: &Channel): Result<T>
```

Receive a value from the channel. Blocks if empty.

### ch.trySend

```milo
fn Channel.trySend(self: &Channel, val: T): bool
```

Non-blocking send. Returns true if sent, false if full.

### ch.tryRecv

```milo
fn Channel.tryRecv(self: &Channel): Option<T>
```

Non-blocking receive. Returns `Option.None` if empty.

### ch.len

```milo
fn Channel.len(self: &Channel): i64
```

Current number of items in the channel.

### ch.clone

```milo
fn Channel.clone(self: &Channel): Channel<T>
```

Give another owner (a producer task, a worker thread) its own handle. The queue is torn down when the last one drops.

## WaitGroup Methods

### WaitGroup.new

```milo
fn WaitGroup.new(): WaitGroup
```

Create a new wait group with a zero counter.

### wg.add

```milo
fn add(self: &WaitGroup, n: i64): void
```

Add `n` to the counter — call before spawning the tasks it tracks.

### wg.done

```milo
fn done(self: &WaitGroup): void
```

Decrement the counter by one — call from each task when it finishes.

### wg.wait

```milo
fn wait(self: &WaitGroup): void
```

Block until the counter reaches zero.

### wg.clone

```milo
fn clone(self: &WaitGroup): WaitGroup
```

Give a worker its own owner. `add`/`done`/`wait` take `&Self`, so most uses need no clone.

## Once Methods

### Once.new

```milo
fn Once.new(): Once
```

Create a guard whose initializer has not run yet.

### o.run

```milo
fn run(self: &Once, f: () => void): void
```

Run `f` if nobody has yet; otherwise block until whoever did is finished. Returns only once the initializer has completed exactly once, process-wide, and every caller that returns has seen its writes.

Re-entering `run` from inside its own initializer would wait for itself forever; it aborts with that message rather than hanging.

### o.isDone

```milo
fn isDone(self: &Once): bool
```

True once the initializer has completed. Still false while it is running, so this is a progress hint, never a substitute for `run`.

### o.clone

```milo
fn clone(self: &Once): Once
```

Give another owner its own handle. `run` takes `&Self`, so a module-level `Once` never needs a clone.

## AtomicI64 Methods

### AtomicI64.new

```milo
fn AtomicI64.new(v: i64): AtomicI64
```

Create an atomic integer with initial value.

### a.load

```milo
fn load(self: &AtomicI64): i64
```

Atomic read.

### a.store

```milo
fn store(self: &AtomicI64, v: i64): void
```

Atomic write.

### a.add

```milo
fn add(self: &AtomicI64, v: i64): i64
```

Atomic add, wrapping. Returns old value.

### a.sub

```milo
fn sub(self: &AtomicI64, v: i64): i64
```

Atomic subtract, wrapping. Returns old value.

### a.swap

```milo
fn swap(self: &AtomicI64, v: i64): i64
```

Atomic swap. Returns old value.

### a.cas

```milo
fn cas(self: &AtomicI64, expected: i64, desired: i64): i64
```

Compare-and-swap. Returns the value that was there — equal to `expected` exactly when the swap happened.

### a.clone

```milo
fn clone(self: &AtomicI64): AtomicI64
```

Give another owner its own handle; the storage frees when the last one drops.

## AtomicI32 Methods

`AtomicI32` carries the same surface as `AtomicI64` at 32 bits: `AtomicI32.new(v: i32)`, `load`, `store`, `add`, `sub`, `swap`, `cas`, `clone`.

## AtomicU64 Methods

`AtomicU64` carries the same surface as `AtomicI64` over `u64`: `AtomicU64.new(v: u64)`, `load`, `store`, `add`, `sub`, `swap`, `cas`, `clone`.

## AtomicBool Methods

### AtomicBool.new

```milo
fn AtomicBool.new(v: bool): AtomicBool
```

Create an atomic boolean with initial value.

### a.load

```milo
fn load(self: &AtomicBool): bool
```

Atomic read.

### a.store

```milo
fn store(self: &AtomicBool, v: bool): void
```

Atomic write.

### a.swap

```milo
fn swap(self: &AtomicBool, v: bool): bool
```

Atomic swap. Returns old value.

### a.cas

```milo
fn cas(self: &AtomicBool, expected: bool, desired: bool): bool
```

Compare-and-swap. Returns the value that was there, which is how a caller claims a one-shot flag: `f.cas(false, true) == false`.

### a.clone

```milo
fn clone(self: &AtomicBool): AtomicBool
```

Give another owner its own handle; the storage frees when the last one drops.

## Example: Lazy static

A module-level `var` already runs a real initializer in dependency order before `main`, so an *eager* static needs no `Once` at all. Reach for `Once` when the work must be deferred past the start of `main` or is expensive and usually unwanted. The shape is a global plus a guard function, because a getter cannot hand back a `&T`:

```milo
from "std/sync" import { Once }

var gTable: Vec<i64> = []
var gTableOnce: Once = Once.new()

pub fn ensureTable(): void {
    gTableOnce.run((): void => {
        gTable = buildTable()
    })
}
```

Callers do `ensureTable()` and then read `gTable` directly. There is no `Lazy<T>` or `OnceCell<T>`: with no way to return a reference, every `get()` would deep-copy the cached value.

## Example: Producer-Consumer

The producer runs on a `Promise.blocking` worker so it makes progress while `main` consumes on the channel (a green producer would only run while the scheduler is driven):

```milo
from "std/runtime" import { Promise }
from "std/sync" import { Channel }

fn main(): i32 {
    var ch = Channel<i64>.new(8)!

    let producer = Promise<i64>.blocking(move (): i64 => {
        ch.send(10)!
        ch.send(20)!
        ch.send(30)!
        ch.close()
        return 0
    })

    for val in ch {
        print(val)
    }

    producer.await()!
    print("done")
    return 0
}
```
