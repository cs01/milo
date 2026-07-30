# std/datetime

Date and time from epoch timestamps. Construct with a `DateTime` static; format with a method.

```milo
from "std/datetime" import { DateTime, weekdayName, monthName }
```

## Types

### DateTime

```milo
struct DateTime {
    year: i32,
    month: i32,
    day: i32,
    hour: i32,
    minute: i32,
    second: i32,
    weekday: i32,
}
```

A broken-down calendar date and time.

## Constructors (statics)

### `DateTime.now`

```milo
fn DateTime.now(): DateTime
```

Current UTC date and time.

### `DateTime.localNow`

```milo
fn DateTime.localNow(): DateTime
```

Current date and time in the local timezone.

### `DateTime.fromEpoch`

```milo
fn DateTime.fromEpoch(epochSec: i64): DateTime
```

UTC `DateTime` for a Unix epoch timestamp (seconds).

### `DateTime.fromEpochLocal`

```milo
fn DateTime.fromEpochLocal(epochSec: i64): DateTime
```

Local `DateTime` for a Unix epoch timestamp (seconds).

## Formatting (methods)

### `dt.format`

```milo
fn format(self: &DateTime): string
```

Full date-time string (e.g. `"2026-05-15 10:30:00"`).

### `dt.formatDate`

```milo
fn formatDate(self: &DateTime): string
```

Date portion only (e.g. `"2026-05-15"`).

### `dt.formatTime`

```milo
fn formatTime(self: &DateTime): string
```

Time portion only (e.g. `"10:30:00"`).

## Functions

### weekdayName

```milo
fn weekdayName(weekday: i32): string
```

English name for a weekday (0 = Sunday).

### monthName

```milo
fn monthName(month: i32): string
```

English name for a month (1 = January).

## Example

```milo
let dt = DateTime.now()
print(dt.format())
print(weekdayName(dt.weekday) + ", " + monthName(dt.month))
```
