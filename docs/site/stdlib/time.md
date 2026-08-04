# std/time

Wall clock, elapsed time, `Duration` arithmetic, sleep.

Timers, tickers and timeouts live in [`std/timer`](timer).

```milo
from "std/time" import { Instant, Duration, now, elapsed, since, sleepMs, sleepFor, epochMillis }
```

## Types

### Instant

```milo
struct Instant {
    sec: i64,
    usec: i64,
}
```

A point in time from the system clock.

### Duration

```milo
struct Duration    // i64 nanoseconds
```

A signed span of time, stored as i64 nanoseconds: **±292.47 years, 1 ns
resolution**. Nanoseconds are what benchmarks and profilers need, and nothing
measures a span longer than a lifetime — anything that does is a *date* problem,
so use epoch seconds and [`std/datetime`](datetime).

Construction and arithmetic past the range trap like any other i64 overflow;
Milo is checked by default and a duration that wrapped to negative is exactly the
silent nonsense that causes. `Duration.parse` is the one exception — it takes
untrusted text, so overflow is `None` rather than an abort.

`now()` reads the wall clock, so a span measured across an NTP step inherits that
step. There is no monotonic clock in std yet.

## Duration

### Constructors

```milo
Duration.zero()
Duration.nanos(n: i64)
Duration.micros(n: i64)
Duration.millis(n: i64)
Duration.secs(n: i64)
Duration.mins(n: i64)
Duration.hours(n: i64)
Duration.days(n: i64)
Duration.parse(text: &string): Option<Duration>
```

`parse` accepts a Go-style duration: an optional sign, then one or more
`<number><unit>` components — `"300ms"`, `"1h30m"`, `"-1.5h"`, `"2h45m10.5s"`,
`"7d"`, `"0"`. Units are `ns`, `us` (or `µs`), `ms`, `s`, `m`, `h`, `d`.

It returns `Option`, not `Result`: every failure — a stray character, a missing
unit, a value past ±292 years — leaves the caller with the same move (reject the
input and echo it back), and a duration string is short enough that a byte offset
tells a user nothing their own eyes don't.

### Accessors

```milo
d.toNanos(): i64      d.toSecs(): i64      d.toSecsF64(): f64
d.toMicros(): i64     d.toMins(): i64      d.toMillisF64(): f64
d.toMillis(): i64     d.toHours(): i64
```

Integer accessors truncate toward zero.

### Arithmetic and comparison

```milo
a + b                          // Add
a - b                          // Sub
d.times(k: i64): Duration      // scale
d.dividedBy(k: i64): Duration  // truncating; k == 0 traps like any division by zero
d.ratio(other: &Duration): f64 // "how many times does other fit in d"
d.negated(): Duration
d.abs(): Duration

a == b, a != b                 // @derive(Eq)
a.compare(b): i64              // -1, 0, 1
a.isLess(b): bool
a.isGreater(b): bool
d.isZero(): bool
d.isNegative(): bool
```

Scaling is a method, not `*`: Milo's operator overloading is homogeneous (`Mul`
is `Self × Self`) and a duration times a duration is meaningless.

### Text

```milo
d.toString(): string
```

Go-style: `"0s"`, `"1.5ms"`, `"2m3.5s"`, `"1h30m0s"`. Round-trips through
`Duration.parse`. Microseconds print as `"us"`, not `"µs"`, so the output is ASCII
everywhere it lands; parse accepts both.

## Functions

### now

```milo
fn now(): Instant
```

The current time.

### epochMillis / epochSecs

```milo
fn epochMillis(): i64
fn epochSecs(): i64
```

Milliseconds / seconds since the Unix epoch.

### elapsed

```milo
fn elapsed(start: Instant, end: Instant): Duration
```

The span between two instants.

### since

```milo
fn since(start: Instant): Duration
```

The span from `start` until now.

### sleepMs / sleepSecs / sleepFor

```milo
fn sleepMs(ms: i64): void
fn sleepSecs(secs: i64): void
fn sleepFor(d: &Duration): void
```

With a scheduler running, a sleep parks on a select timer arm: the caller is off
the run queue for the whole interval and every other green task keeps running.
Without one it is a plain `usleep`. `sleepFor` rounds a non-zero sub-millisecond
span up to 1 ms once a scheduler exists — the event loop's deadlines are
milliseconds, and rounding down would turn a 100 µs sleep into a busy spin.

### ensureTimersLive

```milo
fn ensureTimersLive(): void
```

Make the green scheduler exist so timer and fd arms are live on a program that
never spawned a task. `std/timer` calls this for you; it is exported for callers
that arm a `Select` on the main context themselves.

## Example

```milo
let start = now()
// ... do work ...
let d = since(start)
print("took ", d.toString())

let timeout = Duration.parse(flagValue) ?? Duration.secs(30)
if d.isGreater(timeout) {
    print("over budget by ", (d - timeout).toString())
}
```
