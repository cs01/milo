# Consuming-conversions benchmarks — measured 2026-08-22

Environment: 1 vCPU x86-64 container, 4GB RAM, clang 18, Milo from-source (`bun run src/main.ts`).
All numbers are medians of 3+ runs via `/usr/bin/time -v`; checksums identical within each group.
**One-core caveat:** parallel rows measure structural overhead, not speedup.

## Residue #2 — shared-memory parallelism (ownership fission)
20M f64, transform a[i] = a[i]*1.0000001 + 0.5, 4 workers.

| program | time | peak RSS | notes |
|---|---|---|---|
| milo_seq.milo | 20 ms | 158 MB | in-place baseline |
| milo_par.milo | 148 ms (659 cold) | 314 MB | Promise.blocking + mandatory chunk copies |
| c_par.c | 26 ms | 158 MB | pthreads, shared buffer — the banned workload |
| milo_shard.milo | **20 ms** | **158 MB** | shatter/weld prototype: copy tax gone |

## Residue #3 — stored zero-copy (seal/span)
52MB synthetic JSON, 3M string literals, identical scanner both sides.

| program | time | peak RSS | result allocations |
|---|---|---|---|
| milo_owned.milo | ~190 ms (548 cold) | 222 MB | ~3,000,000 |
| milo_span.milo | **~135 ms** | **170 MB** | ~25 (Vec doublings) |

Prediction scorecard: allocation collapse confirmed; RSS delta = copied payload,
confirmed; wall time 1.4x, short of the predicted 2x (17-byte average literals).

## Residue #1 — stale handles (frozen pools)
1M items, 10M lookups.

| path | time | failure mode |
|---|---|---|
| generational Pool.get (Option) | ~20 ms | stale handle -> None (runtime, demoted) |
| FrozenPool.get (infallible) | **~9 ms** | staleness unrepresentable |
| use of pool after freeze() | — | **compile error: use of moved variable** (milo_pool_neg.milo) |

## Reproduce
```
milo build milo_seq.milo -o milo_seq && /usr/bin/time -v ./milo_seq   # etc.
gcc -O2 -pthread c_par.c -o c_par
milo check milo_pool_neg.milo   # expect: use of moved variable 'pool'
```

Plans: ownership-fission.md, seal-span.md, frozen-pools.md (one directory up).
