# std/timer

One-shot timers, repeating tickers, and timeouts.

```milo
from "std/timer" import { Timer, Ticker, recvTimeout, waitReadable, waitWritable }
```

Everything here is a thin layer over machinery that already exists: a green task
(`std/runtime`), a `Channel` ([`std/sync`](sync)), and a `Select` timer arm
(`std/select`). A `Timer` or `Ticker` *is* a task that sleeps and sends, so it
composes with `selectRecv` like any other channel.

## Scheduler

Timer and fd arms are driven by the green scheduler's poll loop. `std/select`
documents the trap: on a program that never spawned a green task there is no
scheduler, so `sel.onTimeout` is armed and never fires — it looks like protection
and isn't. Every entry point in `std/timer` calls `ensureTimersLive()` first, so a
timeout here is honest on the main context too.

## Timer

```milo
Timer.after(d: &Duration): Timer
timer.channel(): Channel<Instant>   // for arming in a Select
timer.recv(): Option<Instant>       // block until it fires; None if stopped
timer.stop(): void                  // idempotent
```

The clock starts at `Timer.after`, not at the first `recv`. Dropping a Timer
cancels it — without that, an unfired timer's task would sleep out the full span
and send into a channel nobody holds.

```milo
var t = Timer.after(Duration.secs(5))
if t.recv().isSome() {
    print("deadline reached")
}
```

## Ticker

```milo
Ticker.every(period: &Duration): Ticker
ticker.channel(): Channel<Instant>
ticker.recv(): Option<Instant>      // None once stopped and drained
ticker.stop(): void                 // idempotent
```

A slow receiver does not accumulate a backlog: the buffer holds one tick and the
sender drops any it can't deposit. That is Go's behavior and the only one that
can't grow without bound. `stop()` lets the task exit at its next wake, so up to
one period later; dropping a Ticker stops it.

A period of zero or less would be a hot loop, so it yields a Ticker that never
fires.

```milo
var tk = Ticker.every(Duration.millis(100))
var sel = Select.new()
selectRecv(sel, tk.channel())
selectRecv(sel, work)
match sel.wait() {
    0 => { print("tick") }
    1 => { /* work arrived */ }
}
sel.destroy()
tk.stop()
```

## Timeouts

```milo
fn recvTimeout<T>(ch: &Channel<T>, d: &Duration): Option<T>
fn waitReadable(fd: i32, d: &Duration): bool
fn waitWritable(fd: i32, d: &Duration): bool
```

`recvTimeout` receives from `ch`, giving up after `d`. `None` means the timeout
won or the channel closed empty. It is a free function, not a method, because
Milo has no method-level generics — the same reason `selectRecv` is one.

`waitReadable` / `waitWritable` are the timeout *under* a blocking read or write:
check first, then do the IO knowing it won't park forever. They move no bytes
themselves.

```milo
if !waitReadable(conn.fd(), Duration.secs(10)) {
    print("client idle, closing")
}
```
