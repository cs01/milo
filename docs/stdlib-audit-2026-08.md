<!-- doc-meta
system: stdlib
purpose: action-item tracker for the 2026-08-03 stdlib audit (Milo vs Go/Rust/Node); each box is a fix in flight
key-files: std/*.milo, src/suggest.ts (builtin member tables), src/checker.ts, docs/stdlib-design.md, docs/stdlib-coherence-migration.md
update-when: an item's fix lands (check the box), a finding is refuted (delete it and say why), or a new one is triaged
last-verified: 2026-08-03 (initial sweep: all 67 modules via `milo api --module`, plus the builtin surface in src/suggest.ts; behavioral claims probed against a live build)
-->

# stdlib audit — 2026-08-03

Comparative sweep of `std/` (67 modules, ~26k LOC) plus the builtin container surface,
against Go's stdlib, Rust's `std` + the de-facto crate set, and Node's core modules.

**Breadth is not the problem.** zstd, PNG, TLS client, WebSocket, PTY, SQLite, regex and
JWT are all present, which beats Go's and Rust's *core* libraries outright. What the sweep
found is **five unresolved conventions running side by side**, plus a short list of gaps
that are load-bearing rather than cosmetic.

**Verify before working an entry.** Findings are written from a point-in-time probe and rot
as code lands. Every behavioral claim below has its probe recorded — re-run it before
starting, and correct the entry when it lies.

**This file ranks by convention violation, not by use — weigh that yourself.** An in-repo
consumer count (excluding each module's own fixtures) puts these at **zero**: `base32`, `dl`,
`environ`, `keys`, `pool`, `sqlite`, `testing`, `toml`, `unix`, `url`, `zip`, `zstd`; and these
at **one**: `csv`, `cstr`, `httpmw`, `log`, `set`, `sha1`, `smt`, `sort`, `totp`, `uuid`. It is
a weak signal — std exists for users, not this repo, and the sibling repos (emulators, milojs,
yaml, dapweb) consume some of these — but it is the only dogfooding evidence available. So the
Tier 5 "sharpest case" (`std/unix` and `std/net` disagreeing on error types) is a fight between
a module with no callers and one with several. Prefer items that block programs from being
written (struct⇄JSON, `Reader`/`Writer`, UDP, timers, enumerable `HashSet`) over convention debt
in modules nobody calls.

**`std/csv` is explicitly parked** (decision 2026-08-03). One consumer, its own fixture. Not
worth extracting to a package, not worth further investment; it stays where it is at whatever
state the Tier 1 decoder pass leaves it. Do not re-propose work on it.

**Checked items stay** with a one-line note on what landed (unlike `backlog.md`, where
shipped entries are deleted). This file is a record of a single audit, not a live queue.

---

## Tier 1 — correctness. Cheap, and they change the language's character

- [x] **`"…".parseInt()` / `.parseF64()` silently return junk.** *Landed b46ce593: both builtins
  return `Option<T>`, strict + range-checked; `strconv.parseInt`/`parseFloat` now forward to them
  (one parser); redeclaring builtin `Option`/`Result` is now a checker error. Also fixed a
  pre-existing read-past-the-view in `parseF64` on `&string` views.* Probed: `"42x".parseInt()`
  → `42`; `"abc".parseF64()` → `0`, indistinguishable from a real `0`. Meanwhile
  `strconv.parseInt` returns `Option<i64>`. Two parsers, opposite failure models, and the
  builtin — the spelling everyone reaches for first — is the JS `parseInt` wart. Go returns
  `(int, error)`, Rust returns `Result`. This contradicts the ethos memo directly
  (*total by default, weird is opt-in*): the total-**looking** spelling is the lossy one.
  Breaking change; worth it. Ref: `src/checker.ts` (`method === "parseInt"` / `"parseF64"`),
  `std/strconv.milo`.

- [x] **Decoders that cannot report failure.** *All four now return `Result` with a byte offset.
  Probed pre-fix: `Base64.decode("!!!!")` → 3 NUL bytes; `Base32.decode("MZXW6YT1")` → `"foob"`,
  a silently shortened secret; `Csv.parse` on an unterminated quote swallowed the rest of the
  file into one field. `Base64.decode` no longer accepts whitespace (MIME/PEM never worked — it
  decoded `\n` as symbol 0); `Base32.decodeLoose` keeps the pasted-authenticator-secret case
  under a name that advertises it. `Hex`'s `pub _hexVal` footgun removed. New `Base64.urlDecode`
  — `urlEncode` had no inverse. Ragged CSV rows deliberately still accepted (not a syntax error;
  indexing already bounds-checks). Note: the audit's implication that `std/jwt` base64url-decodes
  is **false** — jwt only encodes and verifies by recompute.* Original finding:
  `Base64.decode`, `Base32.decode`, `Hex.decode`
  return bare `string`; `Csv.parse` returns `Vec<Vec<string>>`. Malformed input yields
  garbage with no signal — an auth header that fails to decode becomes a plausible-looking
  string. Go returns `([]byte, error)`, Rust returns `Result`. Should be `Result` on all four.
  Ref: `std/base64.milo`, `std/base32.milo`, `std/hex.milo`, `std/csv.milo`.

- [x] **"Absent" collapses into "empty" across the HTTP stack.** *All eight accessors now return
  `Option<string>`; `?foo=` is `Some("")` and a missing `?foo` is `None`. `fetch.hasHeader`
  deleted — it existed **only** because `findHeader` couldn't answer this, and said so in its own
  doc comment. Found and fixed a latent bug the conflation had been hiding: `findHeader` missed a
  value-less header at the end of a block (`"A: b\r\nX-Empty:"` read as absent). No `queryOr`
  family added — `??` is the collapse spelling (`unwrapOr` is Copy-only, so `.unwrapOr("")` does
  not compile on `Option<string>`). Two follow-ups left behind: `std/ws` has a **third** private
  copy of header lookup returning bare `string`, and `std/http`'s `Response` enum collides with
  `std/fetch`'s `Response` struct in the flat namespace — a file cannot import both today.*
  Original finding: `Context.query/param/header/cookie`,
  `fetch.findHeader`, `Response.header` and `ParsedArgs.getString` all return bare `string`.
  Milo *has* `Option` and `Env.get` already uses it — so the same concept has two answers in
  one stdlib. Rust returns `Option`, Node returns `undefined`; only Go shares this wart, and
  Go regrets it. Ref: `std/http.milo`, `std/fetch.milo`, `std/argparse.milo`.

- [ ] **`Option` and `Result` are asymmetric, and it is damaging `std/json`.**
  ```
  Option: isSome isNone unwrapOr unwrapOrElse map
  Result: isOk   isErr  unwrapOr               map mapErr andThen
  ```
  `Option` has `unwrapOrElse` but **no `andThen`**; `Result` has `andThen` but **no
  `unwrapOrElse`**. Neither has `ok()`/`err()`/`okOr()`/`filter()`/`orElse()`/`expect()`.
  Not cosmetic: missing `Option.andThen` is *why* `std/json` carries ~20 accessor variants —
  `Json.get`/`at`/`path` all return `Option<Json>` but cannot be chained, so every navigation
  shape needs a bespoke method. Add `andThen` and half of `json.milo`'s public surface becomes
  deletable. Ref: `src/suggest.ts OPTION_MEMBERS`/`RESULT_MEMBERS`,
  `docs/language-reference.md` §Option Combinators.

- [x] **JWT verification does not validate claims.** *`verifyHS256/384/512` now return
  `Result<JwtClaims, JwtError>` — 10 variants, no `Other(string)` catch-all — validating
  `exp`/`nbf`/`iat` with 60 s leeway, plus a `JwtVerifier` builder for `aud`/`iss`/fixed clock/
  `requireExpiry`. Algorithm comes from the verifier, never the token, so algorithm confusion is
  `UnsupportedAlg`. Signature compared constant-time on raw bytes, and a **non-canonical
  base64url signature** (same MAC, different token text — walks past a replay blocklist) is now
  rejected. Verified against RFC 7515 A.1's literal token. **Audit correction:** `alg: none` was
  already rejected, but incidentally — the old code recomputed the MAC over the token's own
  header bytes; nothing checked `alg`, so an HS512 token would have verified as HS256.* `Jwt.verifyHS256(token, secret) -> bool`
  checks the signature and nothing else — no `exp`, no `nbf`, no `aud`, and no way to read the
  payload at all. Every user writing `if Jwt.verifyHS256(…)` accepts expired tokens forever.
  `httpmw.verifyBearer` inherits it. HS256 is also the only algorithm. Ref: `std/jwt.milo`,
  `std/httpmw.milo`.

- [x] **No constant-time comparison.** *`std/subtle.constantTimeEq` (own module so "I'm comparing
  a secret" shows at the import line), `std/sha512` (Sha512+Sha384), `std/hkdf` (RFC 5869),
  `std/pbkdf2` (RFC 8018), `Hmac.sha384Bytes`/`sha512Bytes`, `Totp.verify`. All verified against
  published vectors (FIPS 180-4, RFC 4231, 5869, 6070, 7914), cross-checked against Python
  hashlib. A correct `constEq` already existed inside `std/jwt` but was unexported — every other
  user was on their own. **bcrypt/argon2/scrypt deliberately declined**: eksblowfish, the
  `$2a`/`$2b` sign-extension bug, 72-byte truncation, and memory-hard cores all weaken silently
  when wrong, and a wrong password hash is worse than none. PBKDF2 is the answer, documented with
  OWASP iteration floors and its honest weakness (compute-hard, not memory-hard).* Ships HMAC, JWT and AES-GCM, but `constantTimeEq` does
  not exist — so every user-written MAC check will be `==`. Also missing: sha512, HKDF,
  PBKDF2/bcrypt/argon2. A stdlib with an HTTP server, cookies and JWT has no password hashing.
  Ref: `std/crypto.*.milo`, `std/hmac.milo`.

---

## Tier 2 — the architectural one

- [ ] **No `Reader`/`Writer` abstraction.** Go's `io.Reader`/`io.Writer` and Rust's
  `Read`/`Write` are the spine their stdlibs hang on. Milo has interfaces *and* traits and
  uses neither here. Every source has a bespoke shape:
  ```
  File.readAll()          TcpStream.recv()        Child.readStdout(ptr, len)
  FdReader.readByte()     TlsStream.recv()        WsConn.recv()
  ```
  Three consequences, each independently worth fixing:
  - **No buffering.** `FdReader.readByte` is literally one `read(2)` syscall per byte
    (`std/io.milo:178`). `bufio` exists in Go for exactly this. Anyone writing a parser over
    a pipe hits it.
  - **No streaming file IO.** `File` is `openRead`/`openWrite`/`openAppend`/`readAll`/`size`/
    `writeAll` — no `read(n)`, no `seek`, no `close`, no `flush`, no line iteration. Every file
    read slurps whole; a 4 GB file has no API. `fs.readFile` duplicates the slurp from the other
    direction.
  - **Nothing composes.** Can't gzip-wrap a socket, tee a stream, or hash while copying. It is
    also why `std/deflate` (compress) and `std/inflate` (decompress) are split across modules
    when Go and Rust unify them behind Reader/Writer.

  Retrofit order once the interfaces exist: `File`, `TcpStream`, `TlsStream`, `Child`,
  `deflate`/`inflate`. Everything downstream composes after this.

---

## Tier 3 — hard gaps vs Go / Rust / Node

Ranked by how often real programs hit them.

- [ ] **No UDP.** Zero `SOCK_DGRAM` anywhere in `std/` (grepped). Go `net.UDPConn`, Rust
  `UdpSocket`, Node `dgram`. Blocks DNS, QUIC, game netcode, syslog, mDNS.

- [ ] **No struct ⇄ JSON.** There is a checker special-case (`src/checker.ts:7181`) that
  auto-stringifies a struct passed to a method *literally named* `json`, so `ctx.json(user)`
  works — but there is no general `toJson`, and **no deserialization at all**. serde /
  `encoding/json` struct tags / `JSON.parse` are table stakes. Largest single ergonomics delta
  vs all three languages. `@derive` machinery already exists to hang it on.

- [x] **No binary / byte-order helpers.** *`std/binary` shipped — `Bytes` namespace, 37 methods:
  `read`/`write` × u8/i8/{u,i}{16,32,64} × Le/Be, f32/f64, plus `Bytes.has`. Out-of-bounds is
  `Option.None`, not a trap: `src[i]` is a programmer's claim about a position, but a decode at
  an offset that came out of the untrusted data is ordinary truncation. No cursor type — second-class
  refs mean a cursor can't hold the buffer, so it degrades to passing `(pos, src)` anyway.
  Migrated `std/zip` (13 header fields read at archive-supplied offsets with **no bounds check** —
  a truncated `.docx` killed the process from inside a function whose type promised `Result`) and
  `std/png`. Two audit details were stale: `examples/emulators/` has moved to its own repo, and
  the hand-rolling was worse inside `std/` than in `examples/`.*

- [ ] **No child-process env or cwd, and no `setenv` at all.** `Child.spawn(program, args,
  mergeStderr)` is the whole surface (`std/process.milo:109`) — no cwd, no env, no stdio
  redirection, no detached. And `setenv`/`putenv` appear nowhere in `std/`, so a program cannot
  mutate even its own environment. Go `exec.Cmd{Dir,Env}`, Rust `Command::env/current_dir`,
  Node `spawn(opts)`.

- [x] **`Duration` is read-only; no timers, tickers or timeouts.** *`Duration` is now i64
  nanoseconds (±292.47 years, documented range; construction/arithmetic past it traps like
  any other checked i64 overflow) with `+`/`-` via the Add/Sub traits, `==` via
  `@derive(Eq)`, `times`/`dividedBy`/`ratio`/`negated`/`abs`, `compare`/`isLess`/
  `isGreater`, eight constructors (`zero`/`nanos`/`micros`/`millis`/`secs`/`mins`/`hours`/
  `days`), `toNanos`…`toHours` plus `toSecsF64`/`toMillisF64`, Go-style `toString`
  ("1h30m0s", "1.5ms") and `Duration.parse` → `Option` (ns/us/µs/ms/s/m/h/d, fractions,
  sign; overflow is None, never an abort — it takes untrusted text). The three free
  `durationSecs`/`Millis`/`Micros` accessors are **removed** in favor of methods.
  New `std/timer`: `Timer.after`, `Ticker.every` (one-slot buffer, ticks dropped not
  queued, Drop cancels the task), `recvTimeout<T>`, `waitReadable`/`waitWritable`.
  All of it is a layer over the existing green task + Channel + Select timer arm — no new
  runtime machinery. Two things fixed on the way: a green `sleepMs` **busy-yielded** the
  whole span (it now parks on a select timer arm, so the sleeper is off the run queue), and
  `sleepMs` truncated its `usleep` arg to u32 (silently short-slept past ~71 min). Every
  `std/timer` entry point calls `ensureTimersLive()` first, which closes the trap
  `std/select` documents — a timeout on a main context that never spawned a green task used
  to be armed and inert.* Left out: monotonic clock, `sendTimeout`, `context.Context`-style
  cancellation (its own audit entry), `Instant` arithmetic.

  **Two hazards shipped with it — fix before anyone builds on this:**
  1. **`sleepFor`'s resolution depends on invisible global state.** With no scheduler it is a
     `usleep` honoring microseconds; once *anything* in the process has spawned a green task,
     sub-millisecond spans round **up to 1 ms**. So `sleepFor(Duration.micros(100))` is 100 µs
     or 1 ms depending on whether an unrelated library spawned a task — a 10× timing swing by
     action at a distance, which is precisely what "guides you to correct programs" forbids. It
     is only *documented*, the weakest mitigation. Real fix: sub-millisecond deadlines in the
     event loop (it stores epoch ms today), a scheduler change.
  2. **One green task per timer**, each with a 1 MB reserved stack. A server arming a
     per-request timeout at 10k rps creates 10k tasks and nothing at the call site warns. Go
     multiplexes every timer onto one heap. `recvTimeout`/`waitReadable` are task-free select
     arms and are the correct hot-path answer, but the API does not say so loudly enough. Real
     fix: a timer wheel on the scheduler.

  Also open: `sleepMs` and `sleepFor` are now two spellings of one act (kept to avoid churning
  a dozen examples, but it is exactly the convention debt Tier 5 complains about); `toString`
  emits `"us"` where Go emits `"µs"` (parse accepts both); a `Ticker` drops ticks under a slow
  receiver, so counting ticks under-counts elapsed time — observable only because the tick
  carries its `Instant`.

- [ ] **No cancellation.** No `context.Context` analogue. `select.onTimeout(ms)` exists but
  nothing propagates cancellation down a call tree.

- [ ] **No filesystem walk, glob, `mkdir -p`, `rm -rf`, or `copyFile`.** `readDir` is one level
  deep. `makeTempDir` exists but `makeTempFile` does not.

- [ ] **No HTTPS server.** TLS is client-side only (`fetch.TlsStream`); `http.serve` is
  plaintext. Also missing on the server: multipart/form-data, static file serving, body size
  limits, request timeouts, chunked response streaming.

- [ ] **Concurrency primitives are thin.** No `Once`/lazy statics. Atomics are `AtomicBool` and
  `AtomicI64` only — no `AtomicI32`, `AtomicU64`, `AtomicPtr`. (Mutex/RwLock are *deliberately*
  absent per the concurrency-simplification decision — not a gap, do not re-add.)

- [ ] **No BigInt / arbitrary-precision decimal.** Node and Go have both; Rust punts to crates.

- [ ] **Smaller absences:** HTML escaping, MIME type table, multipart parsing, zip *write*
  (read only today), cookie jar, `strconv` quote/unquote, `strconv.parseBool`.

---

## Tier 4 — container gaps

- [x] **`HashSet` is unusable as a set.** *Fixed by a new language feature rather than a set
  method: `@iter` on a struct field delegates `for x in wrapper` to that field, so `HashSet`
  enumerates through its backing `HashMap` with nothing allocated and no snapshot. A set could
  not have written a `next` method at all — the iterator would have to hold a reference into the
  set, and references are second-class. At most one `@iter` field per struct (two makes the loop
  ambiguous; `tests/errors/iterDelegateTwoFields.milo`). Plus union/intersect/difference,
  `fromVec`/`toVec`. Documented in `docs/language-reference.md` and `docs/grammar.ebnf`.*

  Original finding:
  ```
  for x in s      → error: cannot iterate over type 'HashSet_i64': no 'next' method found
  HashSet.new()   → error: 'HashSet' is generic — spell its type arguments
  ```
  Five methods total (`add`/`contains`/`len`/`remove`/`new`). No iteration, no
  union/intersect/difference, no `fromVec`/`toVec`. Rust `HashSet`, Node `Set` (with ES2025 set
  ops) and Go's `map[T]struct{}` idiom all enumerate. A set you cannot enumerate is a bloom
  filter. The turbofish half is `backlog.md` Tier 1 #5. Ref: `std/set.milo`.

- [x] **`HashMap` is missing `keys()`, `values()`, `entry`/`getOrInsert`, `withCapacity`,
  `retain`, and `clear()`** — `Vec` has `clear`, `HashMap` does not. Ref:
  `src/suggest.ts HASHMAP_MEMBERS`. *Shipped `keys`, `values`, `clear`, `clone`, `isEmpty`,
  `withCapacity`. Still missing: `retain`, and `entry`/`getOrInsert` — the latter's whole value
  is handing back a reference into the map that stays live across an insert, which second-class
  references forbid, so it needs a different shape (a `getOrInsertWith(k, f)` that returns a
  value, not a handle) before it can ship.*

- [x] **`for k, v in map` works but is undocumented.** *Documented in
  `docs/language-reference.md` §HashMap (new "Iteration" subsection). Probing it turned up a
  real codegen bug, now fixed: a **second** `for k, v in map` in the same function bound `v` to
  the key — the value store went through a hardcoded `%<name>.addr` while reads resolved to the
  uniqued `%<name>.N.addr`. Silent wrong values, no diagnostic. Fixture `mapIterTwoLoops.milo`.
  Also documented that iteration order is deliberately unstable run-to-run (per-process
  `getentropy` hash seed, HashDoS defense) — an entry-by-entry test of a map is a CI flake.*

- [x] **`Vec` gaps:** *Shipped `get`, `first`, `last`, `min`, `max`, `indexOf`, `position`,
  `extend`, `retain` (in place), `capacity`, `reserve`. Remaining and not shipped: `dedup`,
  `binarySearch`, `swapRemove`, `chunks`/`windows`, `zip`, `flatMap`, `resize`.* Original list:
  `extend`/`append`, `dedup`, `retain` (in place — `filter` allocates),
  `first`/`last`, `min`/`max` (**`sum` exists**, which makes the omission an asymmetry rather
  than a scope decision), `indexOf`/`position` (`find` returns the value, not the index),
  `binarySearch`, `swapRemove`, `chunks`/`windows`, `zip`, `flatMap`, `capacity`/`reserve`,
  `resize`. Ref: `src/suggest.ts VEC_MEMBERS`.

- [ ] **No lazy iterators.** `v.map(f).filter(g)` allocates two intermediate `Vec`s. Rust
  `Iterator`, Node generators and Go 1.23 `iter.Seq` all avoid it; it also blocks `rev()`,
  `take`, `skip` and infinite sequences. **Note the standing decision** — `backlog.md` Tier 2 #6
  records lazy/fusing adapters as *declined* (Graydon review #2: laziness pays only with
  aggressive inlining and drags associated types into the trait system). Left here as a measured
  cost, not a proposal; reopen only with allocation numbers.

- [x] **Slices do not print.** `print(v.slice(0,1))` → `<unprintable>` while `print(v)` →
  `[1, 3]`. Inconsistent with the container-printing work that just shipped. *Fixed — a slice
  now prints like the Vec it views. Fixture `printSlice.milo`.*

---

## Tier 5 — cleanup, convention debt

- [ ] **Five error conventions for one job.** `IoError` (fs, io) · `NetError` (net, fetch) ·
  bare `string` (unix, ws, zip, zstd, png, crypto, dl) · `Result<T>` defaulting to string
  (process, sqlite, toml, url, regex, arena) · `bool` (`sysinfo.setCwd`, `Jwt.verifyHS256`).
  Sharpest case: **`std/unix` and `std/net` do literally the same operations** —
  accept/connect/recv/send — with different error types. Pick the enum convention, retire
  bare-`string` errors.

- [ ] **The namespace-object migration is ~50% done.** Namespace-object: `Math`, `Path`, `Env`,
  `Json`, `DateTime`, `Base64`, `Crypto`, `Regex`, `Url`, `Zstd`, `Png`, … Free functions:
  `fs.readFile`, `sort.sortI64`, `strconv.parseInt`, `time.now`, `sysinfo.*`, `unicode.*`,
  `signal.*`, `log.*`, `testing.*`, `os.*`. Ref: `docs/stdlib-coherence-migration.md`.

- [ ] **Three modules ship both APIs at once.**
  - `std/arena` — 13 `Arena.method()` **and** 13 `arenaAlloc<T>(a, …)` free fns. Full
    duplication. (Blocked in part by the generic-static turbofish gap, `backlog.md` Tier 1 #5.)
  - `std/png` — `Png.encode` **and** `encodePng`.
  - `std/sqlite` — `Database`/`Statement` structs exist but the entire API is C-style free fns
    (`dbOpen`, `dbBindText`, `dbStep`, `dbFinalize`). Never migrated.

- [ ] **Hand-monomorphization where generics already exist.**

  | Module | Symptom | Superseded by |
  |---|---|---|
  | `std/fmt` | `fmt1`/`fmt2`/`fmt3`/`fmt4` | `$"…{x}…"` — probed, works |
  | `std/fmt` | `join`, `padLeft`, `padRight` | `Vec.join`, `str.padStart`/`padEnd` |
  | `std/sort` | `sortI32`/`sortI64`/`sortStrings`/`reverseI64` | `Vec.sort`/`sortBy`/`sortByKey` |
  | `std/testing` | `assertEqual`(i32)/`assertEqual64`/`assertStrEqual`/`assertBool` | nothing — needs one generic `assertEq` |
  | `std/math` | `maxI32`/`maxI64`/`maxF64`/`minI32`/… | nothing — needs a bounded generic |
  | `std/random`, `std/rng` | `shuffleI64` only | nothing — cannot shuffle `Vec<string>` at all |
  | `std/json` | `bool`/`boolAt`/`boolPath`/`childBoolAt`/`curBool` × 4 types ≈ 20 accessors | `Option.andThen` (Tier 1) |

  `std/fmt` is now ~100% redundant. `std/sort` is redundant except `sortStringsByFreq`.

- [ ] **`std/testing` is too thin to test with.** Six assertions, all hand-monomorphized. No
  generic `assertEq`, no subtests/table tests, no failure diffing, no benchmark harness.
  Compare Go `testing.T` (`t.Run`, benchmarks), Rust `assert_eq!` over any `Debug`, Node
  `node:test` `describe`/`it`.

- [x] **`std/log` has no levels, fields, or sinks.** *Now `Log` namespace object: `LogLevel`
  threshold (default `Info`), fluent structured fields (`Log.str(k,v).int(k,n).info(msg)`),
  text/JSON formats, `setSinkFd`/`setSinkPath`, `Logger.new(name)`. Old free functions removed,
  no alias. No `Mutex` re-added: a record renders once and lands in one `write(2)` with control
  bytes escaped, so concurrent records interleave whole — verified 600/600 across 3 concurrent
  tasks. Config mutation is documented startup-only; `setSinkFd` takes an fd whose lifetime the
  type system can't check (second-class refs), documented as the caller's obligation.* `logDebug`/`logInfo`/`logWarn`/`logError`
  and nothing else — no `setLevel`, no structured fields, no output redirection, no logger
  instances. Compare Go `log/slog`, Rust `log`/`tracing`.

- [x] **Encapsulation leaks.** *Landed: `std/fetch` public surface 34 → 29 (13 internals now
  file-private), `fetch.startsWith` deleted for the builtin, `std/zstd` down to `Zstd` + 3
  methods from 19 exports. `strEqNocase` and `hexDigit` were **not** builtin duplicates and
  stayed (offset-anchored compare; `-1` sentinel that `hex._hexVal` maps to `0`) — private now,
  with comments saying why. Nothing needed package-scoped `pub`, so #1b stayed unbuilt.*
  Original finding: `std/fetch` exports `hexDigit`, `startsWith`, `strEqNocase`,
  `schemeOffset`, `parseRawHeaders`, `parseStatus` as `pub` — and `fetch.startsWith` duplicates
  the builtin `string.startsWith`. `std/zstd` exports 15 internal structs (`BitCS`, `FseCTable`,
  `HufTableResult`, `Rev`, `Seq3`, …). Interacts with `backlog.md` Tier 2 #1b (package-scoped
  `pub`): several of these want package visibility, not private and not public.

- [x] **`std/ws` constants are functions.** *Replaced by `enum WsOpcode: i32`;
  `WsMessage.opcode` is now `WsOpcode`, not `u8`. The type change surfaced a real bug: reserved
  opcodes (3–7, 11–15) used to be handed to the caller as data frames, which RFC 6455 §5.2
  forbids — `recv()` now returns `Err("reserved opcode")`. Wire-level round-trip fixture locks
  the discriminants to the actual header byte.*

- [ ] **Duplicated functionality across modules.**
  - `sysinfo.cwd`/`setCwd` vs `fs.currentDir`/`changeDir` — and different error models
    (`bool` vs `Result<Unit, IoError>`).
  - `std/env` (`Env.get`, method-style) vs `std/environ` (`envVars()`, free fn).
  - `term.readKey` vs the whole `std/keys` decoder.
  - `fs.readFile` vs `io.File.openRead().readAll()`.

- [ ] **`std/argparse` gaps:** no subcommands, no choice/enum validation, no repeated flags
  (`Vec`), no f64 flag, and `getString` returns bare `string` (see Tier 1). Compare Go
  `flag`/cobra, Rust clap, Node commander.

- [x] **`Uuid` is a namespace with one function.** *Now a 16-byte Copy value type with `v4`,
  `v7` (RFC 9562 §6.2 monotonic-random, counter reseeds per millisecond), `parse -> Option<Uuid>`,
  `nil`, `toString`, `isNil`, `version`, `variant`, `timestampMs`, `Eq`. `Uuid.v4()` returns
  `Uuid` not `string` — breaking. Known bound: the v7 monotonic counter is unsynchronized global
  state, so concurrent green tasks can lose **ordering** (never uniqueness — 62 random bits
  remain); documented in-source and in the reference.*

---

## Method

- Module surface: `bun run src/main.ts api --module std/<m>` over every module (67 total,
  1003 signatures).
- Builtin surface: `src/suggest.ts` — `VEC_MEMBERS`, `HASHMAP_MEMBERS`, `STRING_MEMBERS`,
  `OPTION_MEMBERS`, `RESULT_MEMBERS` are the checker's own member tables and therefore
  authoritative.
- Behavioral claims (parseInt, parseF64, HashSet iteration, `for k, v in map`, string
  interpolation, slice printing, `Vec.find`) were probed against a live build, not read off
  the docs.
