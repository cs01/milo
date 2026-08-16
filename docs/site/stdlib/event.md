# std/event

The OS readiness poller behind the scheduler — kqueue on macOS, epoll on Linux, IOCP
on Windows — plus the non-blocking fd flag every one of them requires.

```milo
from "std/event" import { EventLoop, eventLoopClose, setNonblocking, eventRegisterRead, eventPoll }
```

This is the lowest layer of Milo's async I/O. `std/runtime` owns an `EventLoop` and
drives it for you, so importing this module means you are writing a primitive the
stdlib does not already provide — a poller over fds no std type wraps, or an
integration with a C library's own descriptor.

`std/event` is a platform split: `std/event.darwin.milo`, `std/event.linux.milo` and
`std/event.windows.milo` all export the same names and the resolver picks by target
OS. Write `from "std/event"`, never the suffixed path.

## Types

### EventLoop

```milo
struct EventLoop
```

A kqueue/epoll/IOCP handle. `EventLoop.new()` returns `Result<EventLoop, string>`;
`eventLoopClose` releases it.

## Non-blocking fds

```milo
fn setNonblocking(fd: i32): i32
fn clearNonblocking(fd: i32): i32
```

Returns 0 on success, -1 on error. Registering an fd that is still blocking is the
usual cause of a poller that reports ready and then hangs in `read`: readiness says a
byte *was* available, not that the next read will return.

## Registering and polling

```milo
fn eventRegisterRead(el: &EventLoop, fd: i32): i32
fn eventRegisterWrite(el: &EventLoop, fd: i32): i32
fn eventDeregister(el: &EventLoop, fd: i32, forWrite: bool): i32
fn eventPoll(el: &EventLoop, readyFds: *i32, maxEvents: i32, timeoutMs: i32): i32
```

`eventPoll` fills `readyFds` — a caller-allocated `[i32; N]` with `N >= maxEvents`, passed bare
(a fixed array coerces to `*i32`) — and returns how many fds are ready, or -1 on error. A negative
`timeoutMs` blocks indefinitely.

```milo
var el = EventLoop.new()!
setNonblocking(fd)
eventRegisterRead(el, fd)

var ready: [i32; 8] = [0; 8]
let n = eventPoll(el, ready, 8, 1000)
eventLoopClose(el)
```

## Cross-task wakeups

```milo
fn eventLoopInitWakeup(el: &EventLoop): i32
fn eventLoopNotify(el: &EventLoop, wakeupId: i32): i32
fn eventLoopDrainWakeup(el: &EventLoop, wakeupId: i32): void
fn eventLoopCloseWakeup(el: &EventLoop, wakeupId: i32): void
```

A self-pipe that breaks a blocked `eventPoll` from elsewhere — how a `Promise.blocking`
worker tells the scheduler its result is ready. `eventLoopInitWakeup` returns the id to
pass to the others.

## Adopting a foreign loop

```milo
fn eventLoopFd(el: &EventLoop): i32
fn eventLoopFromFd(fd: i32): EventLoop
```

For embedding: hand Milo's loop fd to another runtime's poller, or wrap a descriptor
that runtime already owns. `eventLoopFromFd` does not take ownership — closing it is
still the original owner's job.
