<!-- doc-meta
system: planning
purpose: public-facing roadmap for the docs site — a condensed view of docs/roadmap.md
key-files: docs/roadmap.md (canonical status; keep this file in step with it)
update-when: docs/roadmap.md changes status for anything a user would see
last-verified: 2026-07-24
-->

# Milo Roadmap

What ships today, what is being worked on, and what is planned.

## Completed

### Core Language

Primitive types, let/var bindings, if/else, while/for loops, functions, structs, enums with exhaustiveness-checked pattern matching, generics with monomorphization and type inference, move semantics with use-after-move detection, second-class references (`&T`/`&mut T` in params only), closures (including escaping/move closures), traits with static dispatch and `@derive(Eq)`, operator overloading via traits, Go-style interfaces with structural typing and vtable dispatch, `Heap<T>`, `Option<T>`, `Result<T,E>` with `!`/`?`/`??` and auto-`From` error conversion, `let`-else, string interpolation, bitwise operators, hex/binary literals, type casts, for-in over ranges/Vec/array/string/HashMap and any type with a `next()` method, slicing on Vec/array/string, `pub`/private visibility, `@embedFile`, and an HIR-based typed IR.

### Type System & Safety

- **Ownership**: single-owner move semantics, compiler-tracked drops, no GC, no reference counting
- **Null safety**: `Option<T>` — no null pointers in safe code
- **Race safety**: structural `Send`/`Sync` — the compiler rejects data races at `spawn()` boundaries
- **Overflow safety**: compile-time range proof plus traps in debug builds; `--overflow-checks` turns traps on at any optimization level
- **`unsafe` blocks**: pointer work is quarantined behind a grep target, with an unused-`unsafe` lint on by default
- **Borrow invalidation**: ref-while-frozen, use-after-invalidate, and call-site exclusivity are compile errors
- **Arena safety**: identity and generation validation for `Arena<T>`/`Handle<T>`
- **No implicit coercion**: explicit `as` casts only
- **Ranged integers (L1+L2)**: `type Altitude = i32(0..50000)` with range propagation through arithmetic

### Contracts & Proving

- `requires` / `ensures` / `invariant` on functions and loops, checked at runtime in debug builds (`--contract-checks` forces them on at any optimization level)
- **`milo prove`** discharges those obligations statically through `std/smt` — a solver written in Milo itself. `--solver=z3` swaps in Z3 for non-linear arithmetic; `--emit-smt` prints the SMT-LIB2 obligations
- Loop invariants are proved by induction
- An unproven obligation is reported as *unknown*, never as proven

### Safety Profiles, WCET, Bare Metal

- **`milo safety --list` / `--safety=<profile>`**: DO-178C DAL A/B/C, ISO 26262 ASIL A–D, NASA Class A/B, IEC 61508 SIL 3
- **`milo wcet`**: OTAWA flow facts and loop cycle estimates
- **Bare-metal targets**: Cortex-M0/M3/M4/M4F/M7 (with RP2040 and STM32 aliases), a `--heap-size` cap, and a working heap so `Vec`/`String` run on microcontrollers
- **Bare metal is integer-only**: the freestanding link carries no compiler-rt, so float math and 64-bit division are refused with a diagnostic pointing at fixed-point. Integer-only is what keeps the WCET numbers clean

### Concurrency

One model — green tasks — with a single OS-thread escape hatch. No async/await, no function coloring:

- **Green tasks** (`std/runtime`): stackful coroutines (64KB guarded stacks; kqueue, epoll, or Win32 events), cooperative scheduling — `Task.spawn()` for fire-and-forget, transparent async I/O (`stream.recv()`/`stream.send()` auto-yield on EAGAIN)
- **Promises** (`std/runtime`): `Promise<T>.run()`, `.await()`, `Promise.all()`, `Promise.race()` — structured concurrency over green tasks
- **OS-thread escape hatch**: `Promise<T>.blocking()` runs `Send` closures on a real thread for CPU-bound work or blocking FFI; the result returns through the same `.await()`
- **Synchronization** (`std/sync`): `Channel<T>` (bounded FIFO, multi-producer, blocking + non-blocking), `WaitGroup`, `AtomicI64`, `AtomicBool`; `select` over fd, timer, channel, promise, and child-exit arms (`std/select`)
- **Go exit semantics**: when `main` returns the process exits and outstanding tasks are abandoned — wait explicitly, or drive with `schedulerRunToCompletion()`

### Standard Library (69 modules)

I/O & system: io, fs, path, env, environ, args, process, signal, dl, sysinfo, mem, os, platform, term, pty, keys, ansi
Networking: net, unix, fetch, http, httpmw, ws, url
Data: json, csv, toml, base64, base32, hex, sqlite, arena, set, pool, png
Compression: deflate, inflate, zip, zstd
Crypto & auth: crypto, sha256, sha1, hmac, jwt, totp, checksum, xxhash
Concurrency: runtime, sync, select, event
Strings: string, fmt, strconv, unicode, regex, cstr
Math & verification: math, random, sort, smt
CLI: argparse, color, log
Time: time, datetime, uuid
Testing: testing

TLS clients verify certificates and bind hostnames. JSON parsing is RFC 8259-strict, with a lenient JSONC mode and a streaming pull tokenizer.

### C Interop

Extern calls are safe when their arguments coerce safely; `extern type` gives opaque foreign handles, and `string.cstr()` hands C a borrowed pointer with no `unsafe`. `@cLayout` and `@cSig` verify extern struct layouts and function signatures against the real system headers at build time, and variadic externs are checked against libc's true fixed-parameter count. Milo can also be consumed *from* C: `emit-obj`, `build-lib` for a static archive, and a generated C header for the `pub` surface.

### Platforms

macOS and Linux are fully supported on both aarch64 and x86_64. Windows is a partial target: the core language, `std/io`, processes, hashing, ConPTY, plain TCP, and the non-socket green tiers run as native PEs and are verified in CI on `windows-latest`. Pipe readiness, a TLS backend, AES-GCM, and regex are the remaining tiers.

### Developer Experience

- **LSP server**: diagnostics, hover, go-to-definition, completions, code lens, document and workspace symbols, code actions, signature help, inlay hints, references, rename, formatting
- **VS Code extension**: syntax highlighting plus the LSP client
- **Formatter**: `milo fmt`, written in Milo
- **Package manager**: `milo add`/`install`/`publish` plus `milo tool install`, with a lockfile, a git-based cache, and GitHub repositories as the registry — built into the one `milo` binary. [Published packages](/packages) cover PostgreSQL, Redis, markdown, TOML, YAML, JSON-RPC, OpenGL and SDL.
- **Docs from source**: `milo doc` generates reference markdown from doc-comments; `milo api` searches the standard library
- **Test framework**: `@expect:`/`@error:` annotations and a `milo test` runner over 441 fixtures
- **Debugging**: `-g` emits DWARF that composes with any optimization level
- **CI**: build and test on macOS, Linux, and Windows, plus a release pipeline with static linking
- **Playground**: the compiler's JavaScript backend running in the browser

### Self-Hosting

`milo0` — the Milo compiler written in Milo — compiles its own source to a byte-identical fixed point at the production `-O2` level: stage1 == stage2 == stage3. Across the fixture manifest, 212 of 339 fixtures emit byte-identical IR between stages, with zero divergences.

---

## In Progress

- **Self-hosting**: growing the fixture manifest toward full parity, and finishing drop-glue for scope and loop exits
- **Windows**: overlapped IO for pipe readiness, a TLS backend, AES-GCM, and a regex engine
- **Overflow traps by default in release builds** — the direction is decided; what remains is a credible benchmark on a quiet machine (worst measured case is about +8%, and most arithmetic is proved safe and emits no check at all)

---

## Planned

### Language

- **`&mut [T]` views and a checked disjoint split** — slices are immutable-only today, so nothing can hand several workers non-overlapping mutable windows into one buffer
- **Borrowed byte views** — offset/length I/O, buffer interop, zero-copy protocol parsing
- **Named enum-variant fields** — `ForEach { varName: string, … }` instead of long positional payloads
- **Tuple binding in for-in** — `for (i, x) in vec.enumerate()`
- **Iterator breadth** — `fold`/`sum`/`take`/`skip`/`zip`, and combinators beyond `Vec` (`map`/`filter`/`each`/`enumerate`/`find`/`any`/`all` already ship on `Vec`)
- **`Heap<Interface>`** — heterogeneous collections such as `Vec<Heap<Shape>>`
- **Error boxing** — the `anyhow`-style half of error conversion
- **Ranged integers L3** — branch narrowing: after `if x < 50`, `x` is known to be `(min..49)` in the then-branch
- **Structured OS errors** — `errno` plus syscall and path context
- **C ABI layout control** — packed structs and alignment
- **Const generic parameters** — generics are type-only today
- **MIR** — a lower-level IR for optimization passes, after self-hosting

### Standard Library

- **Incremental JSON byte-feed** for unbounded input, and a nicer builder for the write path
- **A pure-Milo regex engine**, which also drops a libc dependency on every platform
- **`std/decimal`** — scaled fixed-point for financial math

### Tooling

- **Cross-compilation to hosted targets** — bare-metal and Windows crosses work; other targets need sysroot handling
- **Faster builds** — LLVM is 95% of a self-host build; the levers are interned method dispatch, less struct churn, and eventually MIR
- **`@bench` annotations and a `milo bench` runner**
- **"The book"** — tutorials beyond the reference

### Safety

- Purity inference for safe overlap at call sites
- Debug reference counting for patterns static analysis cannot reach
- `unsafe fn` declarations and a `--deny-unsafe` flag

---

## Not Planned

- **Lazy iterator adapters** — laziness pays off only through aggressive inlining and would pull associated types into the trait system. Eager stages stay.
- **Dependent types and hand-written proof terms** — Milo's lane is SMT-discharged contracts with no proof obligations to write by hand.
- **OS threads as a public API** — `Thread`/`Mutex`/`RwLock` were removed in favour of the green tier and `Promise.blocking()`.
