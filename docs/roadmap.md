<!-- doc-meta
system: planning
purpose: canonical status — what shipped, what is in flight, what is planned, what was retired
key-files: docs/backlog.md (ROI ordering over the open items), docs/safety-roadmap.md, docs/self-hosting.md, docs/verification-roadmap.md
update-when: a feature ships, a track is abandoned, or a new track opens
last-verified: 2026-07-30 (stdlib planning track reconciled; prior full audit 2026-07-24)
-->

# Milo Roadmap

Status source of truth. [backlog.md](backlog.md) ranks the *open* items by return-on-investment; this file records what is true.

Shipped items are one-liners here — git history and the linked design docs keep the debugging record.

---

## Completed

### Core Language

Primitive types, `let`/`var`, if/else, while/for, functions, structs, enums with exhaustiveness-checked pattern matching, generics with monomorphization and inference, move semantics with use-after-move detection, second-class references (`&T`/`&mut T` in params only), closures (including escaping/move closures), traits with static dispatch and `@derive(Eq)`, operator overloading, Go-style interfaces (structural typing, vtable dispatch), `Heap<T>`, `Option<T>`, `Result<T,E>` with `!`/`?`/`??`, auto-`From` error conversion through `?`, `let`-else, string interpolation, bitwise ops, hex/binary literals, `as` casts, for-in over ranges/Vec/array/string/HashMap and any type with `next(&mut Self): Option<T>`, slicing on Vec/array/string, `pub`/private visibility with per-file enforcement, `@embedFile`, `@export`, `@targetOs()`, HIR-based typed IR.

### Type System & Safety

- **Ownership**: single-owner moves, compiler-tracked drops, no GC, no RC
- **Null safety**: `Option<T>` — no null in safe code
- **Race safety**: structural `Send`/`Sync`, checked at `spawn()`/`Promise.blocking` boundaries
- **Overflow safety**: compile-time range proof + runtime traps on `+ - * -x` (and shift-out-of-range, div-by-zero, `INT_MIN / -1`) in **all** build modes; `--no-overflow-checks` / `--fast` opt back into wrapping for `+ - *`, `.wrappingAdd`/`.saturatingAdd`/`.checkedAdd` name it per op
- **`unsafe` blocks**: required for deref, pointer indexing, address-of, pointer casts, `zeroed<T>()`, unsafe-signature extern calls; unused-`unsafe` lint on by default
- **Borrow invalidation**: ref-while-frozen and use-after-invalidate for built-in borrows; call-site exclusivity (`f(&mut v, &v[0])` rejected)
- **Arena safety**: identity + generation validation at runtime for `Arena<T>`/`Handle<T>`
- **No implicit coercion**: explicit `as` casts only
- **Ranged integers (L1+L2)**: `type Altitude = i32(0..50000)`, range propagation through arithmetic
- **Off-by-default warnings** promotable with `--deny=`: `unused-move`, `unused-import`, `unverified-extern`, `large-stack-array`

See [safety-roadmap.md](safety-roadmap.md) for the enforced-vs-remaining breakdown and the explicit trust boundaries; [memory-safety-vs-rust.md](memory-safety-vs-rust.md) for the 13-probe battle test (0 UB misses).

### Contracts & Proving

- `requires` / `ensures` on functions, `invariant` on `while` **and** `for in` loops and on structs, `decreases` termination measures, and `old(e)` for a parameter's entry value; runtime asserts at `--debug`, forced either way with `--contract-checks` / `--no-contract-checks` (`decreases` is static-only — there is nothing for a runtime check to assert)
- The compiler rejects violations it can see statically
- **`milo prove`** discharges obligations through **`std/smt`** — a solver written *in Milo* (Fourier-Motzkin over linear scalar arithmetic), dogfooding the language on its own verification. `--solver=z3` swaps in Z3 for non-linear arithmetic; `--emit-smt` prints SMT-LIB2 instead of solving; `--all` includes imported stdlib
- Loop invariants proved by induction, on both loop forms. A `for` loop needs no invariant about its own index: the range supplies `lo <= i < hi` inside the body and the invariant is carried to the final index on exit
- **Struct invariants** are two-sided — assumed wherever a value of the type is observed, and owed at every struct literal and every `&mut` function that could break one. A use-site proof resting on an invariant this run could not establish everywhere is reported as conditional, not clean
- **Frame conditions**: `ensures h.count.len == old(h.count.len)` survives across a call. A `&mut` argument is havoced at the call site (keeping the walker sound), and the callee's contract is what puts the information back — without it a mutating callee taught its caller nothing
- **Termination**: a self-recursive call is modelled by assuming the function's own `ensures`, which is induction; `decreases` discharges the well-foundedness it needs. Without a measure the proof is reported as conditional on a termination nothing checked
- Callee `ensures` are assumed only under the callee's `requires` (the bare form let a call-site precondition prove itself)
- `unknown` is reported as unknown, never as proven — an i64 overflow inside the elimination degrades the verdict rather than producing a false proof

This is roughly SPARK's contract vocabulary (`Pre`/`Post`/`Loop_Invariant`/`Type_Invariant`/`Loop_Variant`/`Subprogram_Variant`/`'Old`) and lands at their "silver" level: absence of runtime error, plus termination and simple data invariants — not functional correctness.

Known frontier (tracked in backlog Tier 1 #1–#3 and Tier 2 #2/#3/#12): **no quantifiers** — `forall`/`exists` over container contents is unstateable, so sortedness cannot be specified and binary search cannot be verified; no bitvector theory (`&`, `<<`); no `IndexAccess` reasoning; no `Vec.len` through a builder; and *intermediate* arithmetic carries no range, so derived values can be refuted by inputs no real i32 could produce. `milo verify` remains as a deprecated alias for `prove`.

### Safety Profiles, WCET, Bare Metal

- **`milo safety --list` / `--safety=<profile>`**: DO-178C DAL A/B/C, ISO 26262 ASIL A–D, NASA Class A/B, IEC 61508 SIL 3
- **`milo wcet`**: OTAWA flow facts (loop bounds) plus cycle estimates
- **Bare-metal targets**: `cortex-m0/m3/m4/m4f/m7` (plus `rp2040`/STM32 aliases) — freestanding, QEMU machine per target, `--heap-size=<N>` cap, working heap (`Vec`/`String` over a bump allocator), OOM surfaces as `ENOMEM`. A reclaiming allocator is deliberately not planned.

### Concurrency

Green-tier concurrency with one OS-thread escape hatch:

- **Green threads** (`std/runtime`): stackful coroutines (ucontext / Win32 fibers), 64KB stacks with guard pages, kqueue/epoll/Win32-event backends, transparent async I/O — `recv`/`send` auto-yield on EAGAIN
- **Promises**: `Promise<T>.run()`, `.await()`, `Promise.all()`, `Promise.race()`, `p.channel()` to arm one in a `Select`
- **Tasks**: `Task.spawn()`, `Task.join()`, `WaitGroup`, Go-style exit semantics
- **`Promise.blocking()`**: the one OS-thread escape hatch for CPU-bound work or blocking FFI, `Send`-checked captures
- **`std/sync`**: `Channel<T>` (bounded FIFO, multi-producer, blocking + non-blocking), `AtomicI64`, `AtomicBool`
- **`std/select`**: fd, timer, channel, promise and child-exit arms
- **No async/await** — blocking-shaped code yields automatically in green context
- Public `Thread`/`Mutex`/`RwLock`/`parallel` were **removed** 2026-07-10 (green tier only — see [concurrency-simplification.md](concurrency-simplification.md))

### Standard Library (69 modules)

I/O & system: `io`, `fs`, `path`, `env`, `environ`, `args`, `process`, `signal`, `dl`, `sysinfo`, `mem`, `os`, `platform`, `term`, `pty`, `keys`, `ansi`
Networking: `net` (TCP + DNS), `unix` (AF_UNIX), `fetch` (HTTPS client + TLS), `http`, `httpmw`, `ws`, `url`
Data: `json`, `csv`, `toml`, `base64`, `base32`, `hex`, `sqlite`, `arena`, `set`, `pool`, `png`
Compression: `deflate`, `inflate`, `zip`, `zstd`
Crypto & auth: `crypto`, `sha256`, `sha1`, `hmac`, `jwt`, `totp`, `checksum`, `xxhash`
Concurrency: `runtime`, `sync`, `select`, `event`
Strings: `string`, `fmt`, `strconv`, `unicode`, `regex`, `cstr`
Math & verification: `math`, `random`, `sort`, `smt`

The supported surface follows [the stdlib design](stdlib-design.md): `milo api`
hides private/internal plumbing, commands use `Result<Unit>`, ordinary absence
uses `Option`, constructors and receiver operations have one discoverable shape,
and ASCII byte APIs state their representation.
CLI: `argparse`, `color`, `log`
Time: `time`, `datetime`, `uuid`
Testing: `testing`
Prelude: `prelude`

(88 files — several modules are platform splits.) Discover signatures with `milo api <terms>`; dump a module with `milo api --module std/<name>`.

TLS clients verify certificates (`SSL_VERIFY_PEER` + hostname binding); JSON parsing is RFC 8259-strict with a lenient `jsonParseJsonc` and a `jsonPull` streaming tokenizer.

### Self-Hosting — Bootstrap Converges

`milo0` (`src-milo/`, ~20.8K lines) — the Milo compiler written in Milo — compiles its own source to a **byte-identical fixed point at the production `-O2` level**: `stage1 == stage2 == stage3`. Manifest-wide, 212/339 fixtures emit byte-identical IR between stage1 and stage2, zero divergences. Drop-glue slice 1 (drop infra, `Ident` move-zeroing, reassign-drop) has landed and stays ASAN-clean.

See [self-hosting.md](self-hosting.md) for the M0–M5 milestone log and the eight oracle miscompiles the self-compile exposed and fixed.

Reproduce: `sh scripts/selfhost.sh` (builds stage1 via the oracle — required; `.selfhost/milo-self.bin` is gitignored), then `bun test tests/selfhost.test.ts`. **Never run `.selfhost/milo-self.bin` bare** — see the memory guards in CLAUDE.md.

### Platforms

- **darwin + linux**, aarch64 + x86_64 — full support, both CI-tested
- **Windows x64/arm64** — partial; core language, `std/io`, process, crypto hashing, ConPTY, plain TCP and the non-fd/socket green tiers all run as native PEs, CI-verified on `windows-latest`. Shipped pieces: COFF via `lld-link`, UCRT divergences (`_write`/`__acrt_iob_func`), Microsoft x64 struct ABI, platform splits for `platform`/`event`/`random`/`term`/`environ`/`sysinfo`/`crypto`/`pty`/`os` fd calls, pthreads over `SRWLOCK`/`CONDITION_VARIABLE`, green scheduler over `CreateFiber`, sockets over Winsock with `WSAEventSelect` readiness, `CreateProcess` for `fork`/`waitpid`/`kill`, cross-target `@cLayout`/`@cSig` verification against the xwin SDK, and the `std/net`→`std/fetch` split that lets a plain-TCP program link without OpenSSL. Remaining tiers are in In Progress. Dev loop: `xwin splat` + `MILO_WINDOWS_SDK`, sweep under Wine with `bun scripts/windows-sweep.ts` — but CI's `test-windows` job is the authority on real-OS execution. See [breaking-changes.md](breaking-changes.md) for the `std/os` → `std/platform` relocation it required.
- Remaining `// @skip-os: win32` fixtures carry their reason inline — the skip list *is* the remaining port work, item by item.

### C Interop

- Safe extern calls when args coerce safely and the return is scalar/void; `string.cstr()`, `extern type` opaque handles, pointer-to-struct field access, typed fn-pointer params, `std/cstr`
- **`@cLayout` / `@cSig`** verify extern struct layouts and function signatures against the real system headers by compiling a throwaway TU at build time — cross-target too, when a sysroot is available. `scripts/audit-extern-returns.ts` sweeps return types with no annotations required; std is clean on macOS and Linux
- Variadic externs are checked against libc's real fixed-param count (a wrong arity miscompiles silently on AArch64 — it found a live `execl` bug in our own `std/process`)
- Struct-by-value across the C ABI (`abi.ts`) for System V and Microsoft x64
- **Consuming Milo from C**: `emit-obj`, `build-lib` (static `.a`), and generated C headers declaring the `pub` surface

### Developer Experience

- **LSP**: diagnostics, hover, go-to-definition, completions, code lens, document symbols, workspace symbols, code actions, signature help, inlay hints, references, document highlight, rename, formatting
- **VS Code extension**: syntax highlighting + LSP client
- **Formatter**: `milo fmt` — written in Milo (`fmt.milo` is the only implementation)
- **Package manager**: `milo init/new/add/remove/install/update/tree/why/vendor/publish` plus `tool install/uninstall/list/run`, git-based cache with a lockfile, GitHub repos as the registry, per-package name mangling. Folded into the one `milo` binary. First published package: [milo-language/yaml](https://github.com/milo-language/milo-yaml). See [plans/package-manager.md](plans/package-manager.md)
- **Docs from source**: `milo doc <file|dir>` generates reference markdown from doc-comments; `milo api <terms>` searches std signatures
- **Test framework**: `@expect:`/`@error:` annotations, `milo test` runner — 441 fixtures, 120 error fixtures, 10 prove fixtures
- **Benchmarks**: `benchmarks/run.sh` with per-benchmark `results-*.md` (fib, binarytrees, grep, json, matmul, maplookup)
- **JS target**: `milo emit-js` — the playground on the docs site runs the compiler output in-browser
- **CI**: build + test on push/PR across macOS, Linux and Windows; release pipeline with `--static-deps` static linking (built on ubuntu-22.04 runners for glibc compatibility, never musl)
- **Examples**: `basics/` (9), `cli-tools/` (13), `net/` (4), `graphics/` (6), `simulation/` (3), `terminal/` (6), `embedded/` (2), `tools/java-dap`. Treated as integration smoke tests for stdlib changes
- **Debugging**: `-g` emits DWARF that composes with any `-O`; the DAP debugger lives in [milo-language/dapweb](https://github.com/milo-language/dapweb)

---

## In Progress

### Self-Hosting — M6

- [ ] Drop-glue slice 2 — scope and loop drops (slice 1 landed; this is the big leak win)
- [ ] Grow the fixture manifest toward parity. Expected gaps are what bootstrap doesn't need: closures (the `%Closure` decay fix is written up in `self-hosting.md`), user generics, traits beyond `impl Clone`, the green runtime

### Windows — Remaining Tiers

- [ ] **Pipe readiness** (~3 fixtures) — `WSAEventSelect` is sockets-only and a `CreatePipe` handle is not a SOCKET, so green readiness on a pipe fd genuinely needs overlapped IO / IOCP. Until then green IO on a non-socket fd fails loud rather than deadlocking
- [ ] **TLS backend** — SChannel, or OpenSSL built for `windows-msvc`; blocks HTTPS and `wsBasic`
- [ ] **AES-GCM over CNG** — hashing landed; `BCryptEncrypt` with `BCRYPT_AUTHENTICATED_CIPHER_MODE_INFO` is the remaining piece
- [ ] **`std/regex`** — no C-linkable regex exists on Windows, so the Windows arm is a fail-loud stub. The real fix is a pure-Milo engine (which would drop the libc dependency everywhere)
- [ ] **fd width** — `socket`/`accept` return `SOCKET` (`UINT_PTR`) but `std/os` declares `i32`; the audit script correctly flags it and stays off the Windows CI job until the fd layer goes i64
- [ ] Unskip `tcpIpv6` / `tcpGreenConnectRefused` once real Windows confirms them (they link; Wine can't emulate `AF_INET6` or a refused `FD_CONNECT`)

### Overflow Traps by Default — DONE

`+ - * -x` trap on overflow in **every** build mode (Ethos #1; the silent release wrap was the one inherited footgun). `--no-overflow-checks`/`--fast` opt back into wrapping; `wrappingAdd`/`saturatingAdd`/`checkedAdd` name it per op. The compiler proves most arithmetic safe and emits no check at all (`matmul` emits zero traps even with checks on); arithmetic-dominated code with unprovable operand ranges measured **~+8%** worst case (0.37s → 0.40s over 400M iterations), near-zero on real sub-0.3s benchmarks. Traps `abort()` (SIGABRT) for a supervisor-visible abnormal exit + core dump. Shipped alongside all-mode shift-out-of-range traps and float→int saturating casts.

---

## Planned

### Language

- [x] **`@pure`** — a function may read and write only its parameters and its own locals: no I/O, no module state, no raw memory, no impure callee. Works on fns, methods, generics, and (as an unchecked assertion) on `extern`. `std/math` is annotated throughout. The prover uses it for framing — a `@pure` call with no `&mut` parameter needs no havoc — which turns refutations into proofs (`tests/prove/pureMethodNoHavoc.milo`). Design and the unbuilt capability stage: [effects-and-capabilities.md](effects-and-capabilities.md)
- [ ] **`splitMut` — N disjoint mutable windows** — `&mut [T]` param views ship, and overlapping literal ranges at one call site are rejected; what's missing is handing N workers N windows in one call, and disjointness for *dynamic* ranges. Range disjointness is linear scalar arithmetic, which `milo prove` already discharges — so it should need no `unsafe` (backlog Tier 2 #9)
- [ ] **Capability parameters** — remove ambient authority: a function does I/O only if handed a capability, and second-class refs already prevent one from leaking into a struct, closure, or global. Proposed only; the breaking-change cost across `std` is the open question ([effects-and-capabilities.md](effects-and-capabilities.md))
- [ ] **Borrowed byte views** — `Buffer`/`ArrayBuffer`-shaped interop and zero-copy protocol parsing; gates the zero-copy form of the JSON byte-feed
- [ ] **Named enum-variant fields** — `ForEach { varName: string, … }` instead of an 8-slot positional payload. Greenlit as a language feature; hits the self-hosted compiler hardest. Parser + checker + formatter + LSP
- [ ] **Tuple binding in for-in** — `for (i, x) in vec.enumerate()`; converts most `while i < len()` loops. match already destructures tuples
- [ ] **Iterator breadth** — `map`/`filter`/`each`/`enumerate`/`find`/`any`/`all` ship on `Vec`; missing `fold`/`reduce`/`sum`/`take`/`skip`/`zip`, and the combinators are gated on `Vec` so arrays/maps/user types are excluded. Lazy/fusing adapters are deliberately out
- [ ] **`Heap<Interface>`** — heterogeneous collections (`Vec<Heap<Shape>>`)
- [ ] **Error boxing** — the `?` half of error conversion shipped; `anyhow`-style boxing wants `Heap<Interface>`
- [ ] **Ranged integers L3** — branch narrowing: after `if x < 50`, `x` is `(min..49)` in the then-branch
- [ ] **Structured OS / syscall errors** — `OsError` carrying `errno` plus syscall/path context
- [ ] **C ABI layout control** — packed structs, alignment. `extern struct`, `sizeOf`/`offsetOf` already work
- [ ] **Const / value generic params** — generics are type-only. The bun-rs audit found 1,120 `const B: bool` sites; the only real language gap that audit surfaced. Weigh against Ethos #3 when a concrete Milo need appears
- [ ] **MIR** — lower-level IR for optimization passes, post self-hosting

### Standard Library

- [ ] **JSON incremental byte-feed** — `jsonPull` is string-backed; unbounded input (socket, multi-GB) wants a reader layer over the same tokenizer
- [ ] **JSON builder ergonomics** — the read side is clean; hand-constructing a document is clunky, and `JsonObj.build()` returns `string` rather than `Json`
- [ ] **Pure-Milo regex engine** — unblocks Windows and drops a libc dependency everywhere
- [ ] **`std/decimal`** — scaled-i128 for financial math; stdlib only, no compiler change
- [ ] **Missing bindings** — `alarm`/`setitimer`, `setpgid`/`killpg` (`execvp` shipped)

### Tooling

- [ ] **Cross-compilation for hosted targets** — `--target` reaches clang and fails loudly with a hint, but a real cross needs a target linker + sysroot; the compiler has no `-isysroot`/`--sysroot` notion. Bare-metal and Windows crosses already work
- [ ] **Compile-time reduction** — profiled: the frontend is 0.38s and clang `-O2` is **7.3s, 95% of a self-host build**. Not generics (only 8 monomorphized instances). Levers, in order: interned method IDs instead of `src-milo/codegen`'s string-compare dispatch chains, `String`-by-value struct shredding, then MIR. `--fast` (~2x) exists as the edit-loop workaround
- [ ] **`@bench` annotations + `milo bench`** — the harness exists as a shell script; the in-language form does not
- [ ] **"The book"** — documentation and tutorials beyond the reference

### Safety Hardening

Phases 1–3a are done (see Type System & Safety). Remaining, from [safety-roadmap.md](safety-roadmap.md):

- [ ] **3b — purity inference** for safe overlap at call sites
- [ ] **4a — debug ref counting** for patterns static analysis can't reach (`--sanitize` already links ASAN)
- [ ] **`unsafe fn` declarations** and `--deny-unsafe` for user code; `unsafe` visibility in the LSP

---

## Retired / Not Planned

- **`node-milo`** (the Node.js fork) — **frozen 2026-07-22, abandoned.** It was the runtime stress test that shaped the FFI and binary-data ordering above; that role now belongs to **milojs**, our own JS engine and runtime, which lives in [milo-language/milojs](https://github.com/milo-language/milojs) with its own roadmap and backlog. The V8-C-API-wrapper plan died with the fork. `docs/node-milo.md` is kept as the retrospective (the kqueue connect-failure and IPv6 gotchas generalize to any Milo runtime)
- **Emulators (NES/SNES/Genesis), milojs, and the DAP debugger** moved out of this repo 2026-07-24 — [milo-language/emulators](https://github.com/milo-language/milo-emulators), [milo-language/milojs](https://github.com/milo-language/milojs), [milo-language/dapweb](https://github.com/milo-language/dapweb). The docs site builds the browser emulator cores from the emulators repo
- **`Thread`/`Mutex`/`RwLock`/`parallel`** — removed 2026-07-10 in favour of the green tier; re-add on demand
- **Lazy / fusing iterator adapters** — laziness buys performance only through aggressive inlining and would pull associated types into the trait system (Graydon review decision #2). Eager `Vec`-returning stages stay
- **Dependent types + proof terms** — Tier 3 in [verification-roadmap.md](verification-roadmap.md); a different language identity. Milo's lane is SMT-discharged contracts with no proof terms
- **Reclaiming bare-metal allocator** — the bump allocator plus `--heap-size` closed the safety-critical story
- **Lowercase type aliases, script mode, let-chains, an `any` type** — considered and declined
