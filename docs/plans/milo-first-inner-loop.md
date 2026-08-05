<!-- doc-meta
system: milo-first-inner-loop
purpose: whether a Milo-hosted compiler can have a fast edit/test loop, and the prerequisites that decide it
key-files: src/main.ts, src/codegen.ts, tests/run.test.ts, src-milo/, docs/plans/compiler-host-language.md
update-when: parallel codegen units land, `milo test` gains a real runner, or a port slice actually starts
last-verified: 2026-08-04
-->

# Milo-first: can the inner loop survive it?

Companion to [compiler-host-language.md](compiler-host-language.md), which asked whether a
rewrite makes the compiler *more correct* (answer: no). This asks the different question:
**if we go Milo-first anyway — for dogfooding and proof — does the edit/test loop hold up,
or is it a tarpit?**

Not a parity gate. Nothing here blocks on `src-milo` keeping up with `src/`; per
`feedback_no_selfhost_gate` that stays banned.

**Verdict: achievable, but conditional.** The test cycle is fine and gets *better*. The
compiler-rebuild step is the whole risk, it is 95% clang, and it is only survivable if
parallel codegen units land first. Two of the three prerequisites pay for themselves for
every Milo user whether or not the port ever finishes.

---

## What the loop costs today (TS host)

Measured 2026-08-04, 10-core M-series, this checkout.

| step | cost |
|---|---|
| rebuild the compiler after an edit | **0s** — bun runs `src/*.ts` directly |
| `bun run src/main.ts --help` (interpreter floor) | 0.028s |
| `build examples/hello.milo` end to end | 0.109s |
| `bun test tests/run.test.ts -t "arithmetic"` | 1.06s (was 33.9s — see below) |

Zero rebuild is the number a Milo port has to answer for. Everything else is noise.

## What the loop would cost (Milo host)

The frontend is not the problem. Measured over real programs:

| program | LOC | IR lines | frontend |
|---|---|---|---|
| `examples/tools/java-dap` | 2,950 | 115,813 | 0.21s |
| `examples/games/neon` | — | 54,671 | 0.17s |
| `examples/cli-tools/fmt.milo` | 1,321 | 55,780 | 0.15s |
| `examples/games/flight` | 10,635 | 135,056 | **9.68s** |

The `flight` outlier is not frontend scaling — it embeds four `@embedFile` city assets, and
that time is byte-string emission (the same hot loop `codegen-js.ts` already had to chunk).
Read the other three rows: the frontend does ~100k IR lines in ~0.2s.

clang is the problem, and it is the *only* problem:

| stage | 115,813-line module |
|---|---|
| clang `-O0` | 0.49s |
| clang `-O1` | 0.92s |
| clang `-O2` | 1.02s |

Scaling across module sizes: 50k → 0.6s, 115k → 1.0s, 135k → 1.66s. The historical
self-host data point (2026-07-16, `src-milo` at 20k LOC → 240,583 IR lines) is **0.38s
frontend + 7.3s clang -O2 = 95% clang**.

**Extrapolated cost of one edit to a 40k-LOC Milo compiler: ~0.8s frontend + ~15s clang
-O2.** That is the tarpit, stated as a number. Fifteen seconds before a single test runs,
on every edit, is not a loop anyone iterates in.

---

## The lever that decides it: parallel codegen units

The compiler emits **one** LLVM module and shells out to **one** clang. Measured, clang
parallelises across processes almost linearly on this box:

```
4 × clang -O2 -c (115k-line module), serial:    3.89s
4 × clang -O2 -c (115k-line module), parallel:  1.13s   → 3.4x
```

Splitting the emitted IR into N codegen units, compiling them concurrently, and linking the
objects turns the dominant 95% term into wall-clock `total/N`. This is exactly what rustc's
CGUs do, and it is a **backend** split — it happens after monomorphization, when the full
function list is already in hand, so it does *not* require the resolver rework that
`project_compile_time` correctly ruled out for per-module incremental compilation.

What it does require, from the emitted IR of `java-dap`:

- 921 `define`s, of which **865 are `internal`**. Anything referenced across a CGU boundary
  has to lose `internal` linkage (or be duplicated into each CGU that calls it).
- 1,415 module-level `@` globals and 129 `%T = type` declarations to partition or replicate.
- Stable mangling to keep cross-CGU references resolvable — `src/mangle.ts` already provides
  this.

Bounded, well-understood work with a real precedent. **Highest-leverage item on this page,
and it speeds up every Milo build in the repo, port or no port.**

With CGUs at 8-way plus `--fast` (`-O0` + no overflow/contract checks, already shipped,
measured 2.5x), the 15s edit becomes **~1–2s**. That is a loop.

### The escape hatch, if ~1–2s still isn't enough

`emit-js` exists (`src/codegen-js.ts`, 1,325 lines — the smallest backend, with a locked
parity fixture sweep). A Milo-hosted compiler that carries its own JS backend can run
**itself** on bun for the dev loop: edit `.milo` → emit JS (~0.2s) → run, no clang in the
path at all. Native build stays the release artifact and the correctness oracle.

This is the move that makes "Milo-first" honest rather than masochistic: the JS is
*generated and disposable*, never hand-maintained. It is the opposite of keeping the
compiler written in TS.

---

## The test cycle: fine, and probably better

Two things matter here and only one is about the host language.

**Fixed today (this change): the targeted-test path.** `tests/run.test.ts` fanned out
compiles for *all* 577 fixtures in `beforeAll` regardless of `bun test -t`, so running one
test cost 33.9s. The lanes now mirror the `-t` pattern into the compile pool, so only what
will execute gets built:

| command | before | after |
|---|---|---|
| `-t "arithmetic"` (1 test) | 33.9s | **1.06s** |
| `-t "closure"` (17 tests) | 33.9s | 3.74s |
| `-t "zzzNoSuchFixture"` (0 tests) | 33.9s | 0.03s |

Bun scrubs `-t` from `process.argv` before a test file loads (verified on bun 1.3.10), so
the pattern is read back off the process's real command line, with `MILO_TEST_FILTER` as an
explicit override. It fails open — any trouble reading it means "compile everything", which
is slow, never wrong. This is a today-win, independent of any port.

**Host-language effect on the suite: mildly positive.** After a compiler change every
fixture must recompile no matter what language the compiler is written in, so the 577-fixture
sweep costs the same modulo per-invocation overhead — where a native Milo binary starts in
~1ms against bun's ~28ms, across 577 invocations. The test cycle is not an argument against
the port.

**What is missing is a runner.** `milo test` today:

- discovers `*_test.milo`, scrapes `fn testX(` with a **regex**, appends a generated `main`
- runs files **serially**, one binary each, no parallelism
- **no name filter** — no `-t` equivalent, so there is no targeted-run story at all
- **no per-test isolation**: a trap kills the rest of the file, and the runner papers over
  the count with `totalPassed += Math.max(0, testFns.length - 1)`
- `std/testing` offers 6 helpers — `assert`, `assertMsg`, `assertBool`, `assertEqual` (i32),
  `assertEqual64`, `assertStrEqual`. No floats, no containers, no generic equality.
- **zero `*_test.milo` files exist in this repo.** It is unused infrastructure.

You cannot host a compiler's own suite on that. It needs: process-per-test isolation,
parallel execution, a name filter, and generic assertions. That is a real project, and it
is the prerequisite everyone forgets when they say "just rewrite it in Milo".

---

## Prerequisites, in order

1. **Parallel codegen units.** Turns 15s/edit into ~2s. Benefits every user today.
   Independent of the port — do it whether or not the port happens.
2. **A real `milo test`.** Isolation, parallelism, `-t`, generic assertions. Also
   independent, and it is the thing that lets Milo projects outside this repo test at all.
3. **Un-rot `src-milo`.** Its parser cannot read post-coherence stdlib syntax (`Some(...)`
   ctors, `Type.method()` calls), so all 168 manifest fixtures die at bundled-std line 427.
   Bounded and mechanical.
4. **A differential harness before any porting.** Byte-exact IR diff, `src-milo` vs
   `src/codegen.ts`, over the fixture corpus, as a seconds-fast script. `src-milo` broke
   silently once already precisely because this did not exist. It also produces the single
   number — "N/339 byte-identical" — that tells you whether the port is converging before
   you have spent months.
5. **Then port, codegen first, checker last.** Codegen is the most mechanical, least
   graph-shaped stage and it is the one with an exact oracle. The checker is the most
   reference-heavy and the worst fit for second-class refs; it goes last, when everything
   else is proven.

Items 1–2 are the ones to fund now. They are useful unconditionally, and they are precisely
what converts "Milo-first" from a tarpit into a decision you can reverse cheaply.

---

## The pitfalls, named so they can be avoided

- **Parity gating.** Already banned (`feedback_no_selfhost_gate`); it froze `milojs`'s
  release once. The differential harness reports a number, it does not gate a merge.
- **Resync churn.** `src-milo`'s recent commits are all chasing stdlib renames, not feature
  progress. A port must pin its own std snapshot and update deliberately, or it bleeds time
  to churn it did not cause.
- **Bootstrap paradox with live bugs.** Currently open and directly in the blast radius:
  `let m = v[i]` on a struct with heap fields silently deep-clones (AST/HIR nodes are exactly
  that shape), the for-in loop-var shadow that emits invalid IR with no diagnostic, and
  generic-struct statics needing a turbofish (backlog T1 #5 — every generic collection in a
  compiler). Fix these *before* the checker port, not during it.
- **Debuggability regression.** TS gives `console.log` plus an instant re-run. Milo gives
  `eprint` plus a rebuild — which is the whole reason item 1 comes first — or `hades` over
  DWARF. Budget for it rather than discovering it.
- **The operational hazard is real.** Unguarded `milo-self` has crashed this machine twice
  (`project_selfhost_guard`). Every self-host run stays guarded, no exceptions.

---

## Standing note

Nothing here changes the [host-language decision](compiler-host-language.md): a rewrite is
still not justified on correctness grounds, and the dominant defect class — incomplete
traversal reporting success — is invariant under host language. What this page adds is that
the *feasibility* objection is smaller than it looks, and it reduces almost entirely to one
buildable thing: stop handing clang a single 500k-line module.
