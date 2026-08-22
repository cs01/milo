# std/shard

`shatter` splits a `Vec` into disjoint owned windows so several threads can transform it in place, with no copies and no shared references.

Milo will not let a reference cross a thread boundary. The usual consequence is that parallelising a transform means giving every worker its own copy of a chunk and stitching the copies back together, and for a large buffer that copy costs more than the parallelism saves.

This module takes the other route: instead of sharing a reference, it divides the *ownership*. `shatter` consumes the `Vec` and hands out windows, each an ordinary owned value that a worker receives by move like anything else.

```milo
from "std/shard" import { Shard, shatter }
```

## Quick start

```milo
from "std/shard" import { Shard, parallelMap }

fn double(w: Shard<f64>): Shard<f64> {
    var s = w
    var i: i64 = 0
    while i < s.len() {
        s.set(i, s.get(i) * 2.0)
        i = i + 1
    }
    return s
}

pub fn main(): i32 {
    var data: Vec<f64> = Vec.withCapacity(16)
    var i: i64 = 0
    while i < 16 {
        data.push(1.0)
        i = i + 1
    }

    let out = parallelMap(data, 4, double)!    // divide, run on 4 threads, reassemble
    print(out[0].toString())
    return 0
}
```

`data` is moved into `parallelMap` and comes back transformed, in the same allocation.
No element was copied and no reference crossed a thread.

`f` is a plain function rather than a closure because every worker needs its own copy:
a capturing closure is moved into the first task and gone for the rest. Everything the
work depends on therefore travels in the window, which is also what stops workers
sharing anything. The ergonomics and the safety property are the same choice.

## Why this is safe

Three things, none of them a new language rule:

- **`shatter` consumes the `Vec`.** After it there is no binding through which the buffer can be reached except the windows. Touching the original is `error: use of moved variable`.
- **The windows are disjoint by construction.** Window `i` covers exactly `[i*chunk, (i+1)*chunk)`, computed inside `windows()`, never supplied by you.
- **`Shard` is `@noCopy`.** Handing the same window to two workers is a compile error, not a race. A struct of a pointer and three integers would otherwise be `Copy`, and a copyable window would make the race representable again.

So the aliasing argument is the move checker that already shipped. Nothing new had to be proven.

## Doing it by hand

Reach for `shatter` / `windows` / `weld` directly only when the workers need to differ
from each other, or when you want the windows for something other than one task each:

```milo
from "std/shard" import { Shard, shatter }

pub fn main(): i32 {
    var data: Vec<i64> = Vec.withCapacity(4)
    data.push(1)
    data.push(2)

    var owner = shatter(data, 2)
    var windows = owner.windows()
    // ... hand each window to a worker by move, collect them back ...
    let out = owner.weld(windows)!
    print(out.len.toString())
    return 0
}
```

## The one obligation (on the manual path only)

Keep the owner alive until `weld`. A window is a pointer into the owner's buffer, so dropping the owner while a worker still holds one is a use-after-free that nothing here catches.

`weld` checks what it can: every window must carry this shatter's identity and the set must cover the buffer exactly. A missing window means some worker may still be holding a pointer, so `weld` refuses rather than handing the `Vec` back.

```milo
var data: Vec<i64> = Vec.withCapacity(4)
data.push(1)
data.push(2)
var owner = shatter(data, 2)
var windows = owner.windows()

match owner.weld(windows) {
    Result.Ok(v) => {
        print("welded " + v.len.toString())
    }
    Result.Err(_e) => {
        // Deterministic: a window is missing, or came from another shatter.
        print("weld refused")
    }
}
```

That is a runtime check, not a proof, and it is the honest residue of the manual path.

**`parallelMap` does not have that residue.** It creates every window, hands out every
window, awaits all of them and welds them itself, so no caller code can drop one or let
the owner die first: the completeness `weld` checks is guaranteed by the shape of the
call rather than verified after the fact. That is the same guarantee Rust's scoped
threads get from lifetimes, reached here by closing the cycle inside one function. Use
`parallelMap` unless you have a reason not to. See [how Milo compares to Rust](/language/vs-rust).

## What it costs

Measured on a 10-core machine, 20M `f64`, `a[i] = a[i] * 1.0000001 + 0.5`, 4 workers, `--release`:

| | time | peak memory |
|---|---|---|
| sequential, in place | 6 ms | 153.9 MiB |
| shatter/weld, 4 workers | 3 ms | 163.0 MiB |
| C, pthreads over one shared buffer | 3 ms | 154.0 MiB |

Reproduce with `sh benchmarks/shard/run.sh`.

Read the time column loosely: this loop is memory-bandwidth-bound, so at 20M elements every row
lands somewhere in 3-7 ms run to run and four workers buy less than four times anything. The memory
column is the stable number and it is the one being claimed here.

## What it actually buys on more cores

The table above measures the absence of a copy, not speedup. For speedup you need work per element
high enough that the memory bus is not the limit. `sh benchmarks/shard/scale.sh`, 2M `f64` with 200
rounds of arithmetic each, on a 10-core M-series:

| workers | time | speedup |
|---|---|---|
| 1 | 292 ms | 1.00x |
| 2 | 146 ms | 2.00x |
| 4 | 82 ms | 3.56x |
| 8 | 60 ms | 4.87x |
| 10 | 58 ms | 5.03x |

Linear to 2, close to it at 4, then flattening as the efficiency cores take a share.

**Equal-sized windows are not equal-work windows.** `examples/graphics/mandelbrotParallel.milo`
renders the Mandelbrot set, where a pixel inside the set costs the full iteration budget and one
outside escapes almost at once. With one window per core the worker holding the black interior is
still grinding while the rest sit idle:

| windows | time |
|---|---|
| 1 | 108 ms |
| 4 | 57 ms |
| 8 | 36 ms |
| 16 | 26 ms |
| 64 | 19 ms |

It keeps improving well past the core count, because smaller units even out the finishing times.
The caveat is that one task per window means 64 windows spawn 64 blocking tasks, which is more OS
threads than the machine has cores. A worker pool pulling windows off a queue is the better answer
and does not exist yet.

The point is the memory column. The copying approach this replaces roughly doubles peak memory; shatter/weld adds a flat 9.1 MiB, which is the worker stacks and is the same fixed cost at 40M elements. As a percentage that is 5.9% at 20M and 3.0% at 40M.

Build the `Vec` with `Vec.withCapacity` if you know the size. Growing one by pushing peaks at roughly 2.7x the final size during the doubling reallocs, which dwarfs anything this module does.

## Not for shared state

This divides data. It is not a concurrent map and not a substitute for a lock: two workers that need to touch the *same* element are outside what ownership can separate. Channels and atomics remain the answer there.
