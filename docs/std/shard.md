# std/shard

## std/shard

### `parallelMap`

```milo
pub fn parallelMap<T>(v: Vec<T>, workers: i64, f: (Shard<T>) => Shard<T>): Result<Vec<T>, WeldRejected<T>>
```

Divide, run on `workers` threads, reassemble. The whole cycle in one call.

    let out = parallelMap(pixels, 4, shade)!

This is the shape almost every use wants, and doing it by hand means draining the
window Vec, building a Vec of Promises, awaiting them and welding — plumbing that
says nothing about the work. Reach for shatter/windows/weld directly only when the
workers need to differ from each other, or when you want the windows for something
other than one task each.

`f` is a plain function rather than a closure because each worker needs its own
copy: a capturing closure would be moved into the first task and gone for the rest.
Everything the work depends on therefore travels in the window itself, which is
also what keeps the workers from sharing anything.

### `parallelMapWith`

```milo
pub fn parallelMapWith<T, S>(v: Vec<T>, windows: i64, states: Vec<S>, f: (Shard<T>, &mut S) => Shard<T>): Result<Mapped<T, S>, WeldRejected<T>>
```

parallelMap with two things it cannot express: more windows than workers, and
per-worker state.

More windows than workers is how uneven work balances out. parallelMap spawns
one thread per window, so over-partitioning a 64-window render costs 64 OS
threads. Here `states.len` fixes the worker count and the windows go into a
queue the workers pull from: a worker that drew a cheap window pulls another,
and one that drew the expensive window keeps grinding without idling the rest.

The states are the answer to "why must `f` be a plain function": a closure
cannot be copied to N workers, so whatever it would have captured travels as an
explicit owned value instead. Each worker moves one `S` in, threads it through
every window it processes, and hands it back through the result. Configuration
rides in, accumulators ride out, and nothing is shared: an S is on exactly one
thread at a time, which is the same move-checker argument the windows use.

Which worker processes which window is scheduling, so state a caller reads back
must not encode the assignment: per-worker tallies merge into totals that are
deterministic even though each worker's share is not.

### `Shard.get`

```milo
fn Shard.get(self: &Shard, i: i64): T
```

The element at `i` within THIS window. Bounds-checked against the window's own
length, so a stray index cannot reach a sibling window's elements.

### `Shard.index`

```milo
fn Shard.index(self: &Shard): i64
```

Which window of the shatter this is, counting from 0.

### `Shard.len`

```milo
fn Shard.len(self: &Shard): i64
```

Elements in this window.

### `Shard.set`

```milo
fn Shard.set(self: &mut Shard, i: i64, val: T): void
```

Overwrite the element at `i` within this window. Bounds-checked the same way.

### `Shard.start`

```milo
fn Shard.start(self: &Shard): i64
```

Where this window begins in the ORIGINAL buffer. Without it a worker can only
do position-independent work: a filter that needs to know which pixel, row or
sample it is looking at has no way to find out, because a window's own indices
all start at 0. Global position of element `i` is `start() + i`.

### `Shards.count`

```milo
fn Shards.count(self: &Shards): i64
```

How many windows this shatter divides into.

### `Shards.len`

```milo
fn Shards.len(self: &Shards): i64
```

Elements across all windows.

### `Shards.reclaim`

```milo
fn Shards.reclaim(self: Shards): Result<Vec<T>, Shards<T>>
```

Take the buffer back from an owner that never handed a window out.

This is the way home for a refusal that happens BEFORE any division, where
`weld` is not an option because there are no windows to weld. Once
`windows` has run, some worker may hold a pointer into the buffer, so the
only sound route back is `weld` and its coverage check; `handedOut` records
exactly that moment, which is why it is the condition here.

### `Shards.weld`

```milo
fn Shards.weld(self: Shards, returned: Vec<Shard<T>>): Result<Vec<T>, WeldRejected<T>>
```

ESCAPE HATCH (see `shatter`). Reassemble: consume the owner and the windows, and
hand back the original Vec with its original allocation.

The checks are what keep a mistake a logic error instead of corruption: every
window must carry this shatter's identity, and the set must cover every index
exactly once. A missing window would mean some worker still holds a pointer
into this buffer, and returning the Vec then would be the use-after-free this
module exists to avoid.

A refusal costs nothing: the `WeldRejected` hands the owner and every window
back, so the caller fixes the set and welds again.

### `Shards.windows`

```milo
fn Shards.windows(self: &mut Shards): Vec<Shard<T>>
```

ESCAPE HATCH (see `shatter`). The windows, once.

A second call aborts rather than returning anything. It cannot hand out a
second set of pointers to the same storage without creating the aliases the
whole design exists to prevent, and it cannot refuse into a `WeldRejected`
either: this borrows the owner instead of consuming it, so there is nothing
of the caller's to hand back and nothing a caller could do about it except
stop asking twice. Returning an empty Vec used to defer the report to `weld`,
which then blamed the wrong step ("expected 4 windows, got 0").

### `shatter`

```milo
pub fn shatter<T>(v: Vec<T>, n: i64): Shards<T>
```

ESCAPE HATCH. Prefer `parallelMap`, which is this whole cycle in one call and the
form in which `weld` cannot fail. Reach here only when the workers must differ from
each other, or when you want the windows for something other than one task each.

Consume a Vec and return an owner that can hand out `n` disjoint windows over
its storage. O(1): nothing is copied, and the Vec's buffer is untouched.

`n` is clamped to at least 1 and at most the element count, so a caller asking
for more windows than elements gets one window per element rather than a pile
of empty ones aliasing the same address. An EMPTY Vec is the case that has to
clamp up rather than down: `min(n, v.len)` would be 0 there, and a count of 0
divides by zero in `windows`, so the lower bound wins and an empty buffer is
one empty window.

### `shatterStr`

```milo
pub fn shatterStr(s: string, n: i64): StrShards
```

Consume a string and return an owner that hands out `n` read-only windows.

Unlike the Vec side there is no one-call form to prefer: `parallelMap` is map-shaped
(Vec<T> in, Vec<T> out) and a scan returns something else entirely, so this IS the
supported way to divide a string across workers.

### `StrShard.byteAt`

```milo
fn StrShard.byteAt(self: &StrShard, i: i64): u8
```

The byte at `i` within this window, bounds-checked against its length.

### `StrShard.index`

```milo
fn StrShard.index(self: &StrShard): i64
```

Which window of the shatter this is, counting from 0.

### `StrShard.len`

```milo
fn StrShard.len(self: &StrShard): i64
```

Bytes in this window, including any overlap it was given.

### `StrShard.matchesAt`

```milo
fn StrShard.matchesAt(self: &StrShard, i: i64, needle: &string): bool
```

Whether this window's bytes at `i` match `needle`. Bounded by the window, so a
needle running past the end is simply not a match here; give the window an
overlap if you need to catch one that straddles the boundary.

### `StrShard.ownLen`

```milo
fn StrShard.ownLen(self: &StrShard): i64
```

Bytes in this window BEFORE the overlap was added: the range no other window
owns. A scanner must count only matches beginning below this, or the two
neighbours that can both see a match in the overlap will both count it.

It is a field rather than something the caller derives because the last
window is the odd one out: it takes the remainder of an uneven division, so
`total / count` is wrong for exactly one window and a caller that re-derives
it silently miscounts there instead of failing.

### `StrShard.start`

```milo
fn StrShard.start(self: &StrShard): i64
```

Where this window begins in the original string.

### `StrShards.count`

```milo
fn StrShards.count(self: &StrShards): i64
```

How many windows this shatter divides into.

### `StrShards.len`

```milo
fn StrShards.len(self: &StrShards): i64
```

Bytes in the underlying string, across all windows.

### `StrShards.reclaim`

```milo
fn StrShards.reclaim(self: StrShards): Result<string, StrShards>
```

Take the string back from an owner that never handed a window out.

`weld` now requires the full set, so an owner that was shattered and then
abandoned before dividing had no route home at all: it would refuse an empty
Vec on the count. `handedOut` marks the moment a pointer into the string
escaped, and before that moment there is nothing to wait for. Same shape as
the writing side's `reclaim`.

### `StrShards.weld`

```milo
fn StrShards.weld(self: StrShards, returned: Vec<StrShard>): Result<string, StrWeldRejected>
```

Give the string back, once every window has come home.

What is checked and what is not: the windows must all carry this shatter's
identity, and every `index` this shatter handed out must appear exactly once.
What is NOT checked is that the returned windows cover the bytes disjointly,
because `windows(overlap)` hands out ranges that deliberately share bytes and
a coverage-of-bytes test would reject the module's own recommended usage.

The count and the seen-set are not about writes. This owner is the only thing
keeping the string alive: hand it back while a window is still out and the
caller can mutate or drop a buffer that a live StrShard still points into,
which is the use-after-free the writing side refuses for the same reason.
Reads make overlap sound; they do not make a dangling read sound.

### `StrShards.windows`

```milo
fn StrShards.windows(self: &mut StrShards, overlap: i64): Vec<StrShard>
```

The windows, once. `overlap` extends each window that far into the next, so a
scanner looking for an `m`-byte needle passes `m - 1` and never has to stitch
the seams. Pass 0 for exactly disjoint windows.

A second call aborts, for the reason the writing side's `windows` does: this
borrows the owner rather than consuming it, so a refusal has nothing to hand
back, and a silent empty Vec only moved the report to `weld`, which then
named the wrong step.

### `StrWeldRejected.message`

```milo
fn StrWeldRejected.message(self: &StrWeldRejected): string
```

A sentence for a human; `reason` and `index` are the machine-readable form.

### `WeldRejected.message`

```milo
fn WeldRejected.message(self: &WeldRejected): string
```

A sentence for a human. The machine-readable form is `reason` and `index`;
this exists so a caller that only wants to log has something to log.
