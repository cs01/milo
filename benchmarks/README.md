# Milo Benchmarks

Milo vs C vs Go on small workloads. Uses [hyperfine](https://github.com/sharkdp/hyperfine).

```bash
./benchmarks/run.sh
```

Env vars: `RUNS=5` `WARMUP=1` `CC=clang` `CFLAGS="-O2 -march=native"`.

## Results (Apple M-series, macOS, Milo at -O2)

| Benchmark              | C       | Milo    | Go      | Milo vs C |
|------------------------|---------|---------|---------|-----------|
| matmul 512×512         | 12.8 ms | 12.0 ms | 13.2 ms | **0.94x** |
| binarytrees depth 18   | 3.9 ms  | 3.0 ms  | 10.5 ms | **0.77x** |
| quicksort 2M f64       | 35.7 ms | 34.7 ms | 34.7 ms | **0.97x** |
| startup empty main     | 1.2 ms  | 1.2 ms  | 1.5 ms  | **1.00x** |
| stringops 100k concat  | 3.1 ms  | 3.2 ms  | 6.5 ms  | 1.03x     |
| fib(42)                | 18.4 ms | 20.8 ms | 21.6 ms | 1.13x     |
| sieve to 10M           | 2.1 ms  | 2.5 ms  | 3.4 ms  | 1.19x     |
| maplookup 100k         | 3.3 ms  | 4.4 ms  | 5.0 ms  | 1.32x     |
| grep -c 5MB            | 2.1 ms  | 5.5 ms  | 4.0 ms  | 2.56x     |
| json parse+walk 1MB    | 1.6 ms* | 7.1 ms  | 9.7 ms  | 4.44x     |

\* C uses yyjson (best-in-class C library); Go and Milo use their stdlibs.

Hot spots: grep slurps whole file then scans; hashmap needs probe optimization. JSON gap vs C is stdlib-vs-yyjson; Milo now beats Go.

## Milo vs Rust / Zig / Odin / Hylo

```bash
./benchmarks/run-langs.sh        # needs rustc, zig, odin; HC=<path to hylo hc> for the hylo arm
```

Same source shape in every language (same algorithm, same stdlib-level containers —
`Vec`/`Vec`/`ArrayList`/`[dynamic]`), `rustc -O`, `zig -O ReleaseFast`, `odin -o:speed`,
`clang -O2 -march=native`. Mean of 10 runs, Apple M-series, macOS.

| Benchmark             | Milo    | Rust    | Zig     | Odin    | C       | Hylo    |
|-----------------------|---------|---------|---------|---------|---------|---------|
| fib(35)               | 18.4 ms | 17.0 ms | 19.0 ms | 21.9 ms | 17.6 ms | 96.2 ms |
| matmul 256×256 f64    | 11.6 ms | 11.5 ms | 12.0 ms | 12.2 ms | 12.1 ms | —       |
| quicksort 500k f64    | 34.0 ms | 33.2 ms | 39.6 ms | 38.7 ms | 36.0 ms | —       |
| binarytrees depth 15  | 3.1 ms  | 2.6 ms  | 2.0 ms  | 3.0 ms  | 2.3 ms  | —       |

Milo lands within noise of Rust on the two loop-over-a-buffer benchmarks, ~8% behind on
fib, and last on binarytrees — that one is pure malloc/free throughput (Zig's `smp_allocator`
beats libc malloc, which Milo, C, and Odin all go through), and at 2–3 ms it is close enough
to process startup that the ordering is soft.

Hylo runs only fib: its stdlib has no `Movable` conformance for `Float64`, so `Array<Float64>`
does not instantiate, and there is no float `print`. The 5.7× on fib is a debug-build `hc`
(there is no release distribution) emitting unoptimized calls, not a claim about the language.
