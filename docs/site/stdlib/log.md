# std/log

Leveled, structured logging to a redirectable sink.

```milo
from "std/log" import { Log, LogFormat, LogLevel, Logger }
```

```milo
Log.setLevel(LogLevel.Debug)
Log.info("server starting")
Log.str("path", p).int("bytes", n).warn("upload retried")

let http = Logger.new("http")
http.int("status", 503).error("upstream refused")
```

```
2026-08-04T05:11:00.792Z INFO  server starting
2026-08-04T05:11:00.792Z WARN  upload retried path=/var/tmp/a.bin bytes=4096
2026-08-04T05:11:00.793Z ERROR [http] upstream refused status=503
```

## Levels

`LogLevel` is ordered `Debug < Info < Warn < Error < Off`. Records below the
threshold are discarded. The default threshold is `Info`, so debug records need
`Log.setLevel(LogLevel.Debug)` to appear. `LogLevel.Off` is a threshold only —
it silences everything and is never a record level.

| Function | Meaning |
|---|---|
| `Log.setLevel(level)` | Set the process-wide threshold |
| `Log.level()` | Read the threshold |
| `Log.isEnabled(level)` | Would a record at `level` be emitted? |

`Log.debug/info/warn/error` check the threshold themselves, but only after their
arguments are evaluated. Guard an expensive message with `Log.isEnabled` first.

## Fields

A record is a message plus ordered key/value pairs. `str`, `int`, `float`, and
`bool` start a record on `Log` or a `Logger` and chain; a level method consumes
it and emits.

```milo
Log.str("path", path).int("bytes", n).bool("cached", hit).float("secs", t).info("served")
```

Text output leaves values bare unless they would be ambiguous (empty, or
containing a space, quote, backslash, `=`, or a control byte), in which case they
are quoted and escaped. Integers and booleans are always bare. A NaN or infinite
float is quoted, because JSON has no literal for it.

## Named loggers

`Logger.new(name)` tags every record with a subsystem name — `[name]` in text,
`"logger"` in JSON. Filtering stays process-wide: a `Logger` is a label, not an
independently configurable channel.

## Formats

`Log.setFormat(LogFormat.Json)` emits one JSON object per line:

```json
{"time":"2026-08-04T05:11:00.792Z","level":"WARN","logger":"http","msg":"slow","ms":1200}
```

`Log.setTimestamps(false)` drops the timestamp — for a sink that stamps lines
itself (journald, a container runtime) or when output must be reproducible.

## Sinks

| Function | Effect |
|---|---|
| `Log.setSinkFd(fd)` | Write to an already-open descriptor. It stays yours to close, and must outlive the last record. Default is `2` (stderr) |
| `Log.setSinkPath(path)` | Open `path` for append and own it until the sink is replaced. Returns `Result<Unit, IoError>` |

Records go straight at the descriptor, but stdio is flushed first, so a sink on
fd 1 interleaves correctly with `print`.

## Concurrency

Milo has no mutex, and `std/log` does not serialize writers. What it guarantees
instead is that a record renders to one complete line and reaches the sink
through exactly one `write(2)`. POSIX makes a single write to a pipe or terminal
atomic up to `PIPE_BUF` (4096 bytes), and a single write to an `O_APPEND` file
atomic at any size. Records from concurrent tasks therefore interleave whole, in
some order; only a record longer than `PIPE_BUF` on a pipe can tear.

Configuration is process-wide mutable state meant to be set once at startup.
Reconfiguring while other tasks log cannot corrupt anything — each setting is a
single machine word — but concurrent readers may observe the old value for an
unbounded time, and a `setSinkPath` that closes the previous owned descriptor can
race a write already in flight. Configure before you spawn.
