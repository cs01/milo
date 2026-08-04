<!-- doc-meta
system: breaking-changes
purpose: source-level breaks users have to act on, with the migration and the reason a compat shim was impossible
key-files: std/platform.*.milo, std/os.milo, std/string.milo, std/strconv.milo, std/uuid.milo, std/ws.milo, std/fetch.milo, std/zstd.milo, std/base64.milo, std/base32.milo, std/hex.milo, std/csv.milo
update-when: a public stdlib name moves, is renamed, or changes signature
last-verified: 2026-08-03
-->

# Breaking changes

Source-level breaks, newest first. Milo is pre-1.0 and does not promise
compatibility, but every break belongs here with the migration spelled out.

## `std/json` integer reads are exact; bare literals are validated (2026-08-04)

**`Json.i64` / `i64At` / `i64Path` / `asI64` / `curInt` now answer `None` where they used
to answer a wrong number.** The parser accumulates every JSON number into an `f64` and
these read through it, so anything past 2^53 came back truncated
(`18446744073709551615` → `9223372036854775807`) and `1.5` came back as `1`. An integer
read now re-scans the literal's own source span and answers `Some` only for a literal that
is an integer and fits `i64`; fractional values, exponent forms (`1e2`) and out-of-range
values are `None`. Migration for callers that want the old leniency: read `f64` and cast —
`(doc.f64(k) ?? 0.0) as i64`. `std/jwt`'s `exp`/`nbf`/`iat` were migrated that way, because
RFC 7519 NumericDate permits a fraction. New: `Json.curUint(cur): Option<u64>` for values
above `i64::MAX`.

**`Json.parse` rejects malformed bare literals.** `true`/`false`/`null` were matched on
their first byte alone, so `nope` parsed as `null`, `trux` as `true` and `fals3` as
`false`. All three are now `Err`.

**A method literally named `json` no longer auto-stringifies a scalar argument.**
`ctx.json(42)` type-checked and then crashed codegen; it is now an ordinary type error —
write `ctx.json(n.toString())`. The same call site now also errors when the struct has a
field the built-in stringifier cannot serialize; it previously emitted `"tags":` with no
value at all, i.e. invalid JSON. Add `@derive(Json)` and the call routes through the
derived `toJson`.

**`@json` is now a reserved struct-field attribute** — it renames a field on the wire for
`@derive(Json)`, and is an error on a struct that does not derive it.

## `fs.isSymlink` now answers correctly on arm64 Linux (2026-08-04)

Not a source-level break — no signature changed — but the answer changed on one platform.

`isSymlink` tested the `S_IFLNK` bit at a fixed `st_mode` offset inside `struct stat`. That
offset is 24 on x86_64 and 16 on arm64, and `std/platform` splits by **OS only**, with no
arch axis — so on arm64 Linux it read a different field entirely and returned `false` for
every symlink. It now uses `readlink` (EINVAL on a non-link), which is arch- and
libc-independent. Code that accidentally relied on the always-false answer there will now
take the symlink branch.

`FileInfo.mode` / `lstatInfo(...).mode` still has the underlying offset bug and reads 0 on
arm64 Linux. Do not build on that field until the platform split grows an arch dimension.

## `Duration` accessors became methods, and `Duration` is now nanoseconds (2026-08-04)

`durationSecs(d)` / `durationMillis(d)` / `durationMicros(d)` are **removed**. They are
`d.toSecs()` / `d.toMillis()` / `d.toMicros()`, and they now have the siblings the
free-function shape could never grow: `toNanos`, `toMins`, `toHours`, `toSecsF64`,
`toMillisF64`. Three free functions in a flat namespace could not become nine.

The representation changed with them: `Duration` was `{ totalUsec: i64 }` and is now i64
**nanoseconds** — ±292.47 years at 1 ns resolution. The field is private (`_nanos`), so
code that read `d.totalUsec` fails to compile rather than silently reading a value 1000×
larger. Overflow past the range traps like any other checked i64 arithmetic;
`Duration.parse` returns `None` instead, because it takes untrusted text.

No compat shim is possible — the flat namespace has no place to put an old spelling — and
none is wanted: the old names were the only accessors, so every call site is a one-line
mechanical edit.

    // before
    let ms = durationMillis(since(start))
    print("took " + ms.toString() + "ms")

    // after
    print("took ", since(start).toString())        // "1.5s", "2m3.5s", "1h30m0s"
    let ms = since(start).toMillis()               // when you want the number

New in the same change: `Duration` construction (`Duration.zero/nanos/micros/millis/secs/
mins/hours/days`), `Duration.parse` (Go-style `"1h30m"`, `"-1.5h"`, `"300ms"`, `"7d"` →
`Option<Duration>`), `+`/`-`/`==`, `times`/`dividedBy`/`ratio`/`negated`/`abs`,
`compare`/`isLess`/`isGreater`, `toString`, `sleepFor`, `ensureTimersLive`, and the new
module `std/timer` (`Timer`, `Ticker`, `recvTimeout`, `waitReadable`/`waitWritable`). No
other existing name changed.

Behavioral change, not source-level: a green `sleepMs` used to busy-yield for the whole
span and now parks on a select timer arm, so other green tasks get the CPU; and `sleepMs`
no longer truncates its argument to `u32` (sleeps past ~71 minutes used to silently
return early).

## `Jwt.verifyHS256` returns the validated claims, not a bool (2026-08-03)

`Jwt.verifyHS256(token, secret) -> bool` checked the signature and nothing else: no
`exp`, no `nbf`, no `aud`, and no way to read the payload at all. Every caller writing
`if Jwt.verifyHS256(…)` accepted tokens that expired years ago. `httpmw.verifyBearer`
inherited the same hole.

Verification now returns `Result<JwtClaims, JwtError>` and validates the registered
time claims (`exp`, `nbf`, `iat`) with 60 s of clock-skew leeway. The `alg` header must
equal the algorithm the *verifier* asked for, so `alg: none` and algorithm confusion are
`JwtError.UnsupportedAlg` rather than a success. Signature comparison moved to
`std/subtle`'s `constantTimeEq` over the raw MAC, and a non-canonical base64url
signature — same MAC bytes, different token text — is rejected instead of accepted.

There is no compat shim: the point of the break is that `if verify(...)` must stop
compiling. `.isOk()` is a caller who saw the claims and chose to discard them; the old
spelling was a caller who never knew there were claims.

```milo
// before
if Jwt.verifyHS256(token, secret) {
    handle(request)                      // token may have expired in 2021
}
if verifyBearer(ctx, secret) { … }

// after
match Jwt.verifyHS256(token, secret) {
    Result.Ok(claims) => { handle(request, claims.subject()) }
    Result.Err(e) => { log(jwtErrorMessage(e)) }   // Expired vs BadSignature vs WrongAudience
}
if verifyBearer(ctx, secret).isOk() { … }          // when the claims genuinely are not needed

// audience, issuer, a fixed clock, or a mandatory exp
let claims = JwtVerifier.new(JwtAlg.HS256, secret)
    .audience("api.example")
    .issuer("auth.example")
    .requireExpiry()
    .verify(token)?
```

`httpmw.verifyBearer` returns the same `Result`, and now distinguishes "no
Authorization header" from "an Authorization header that is not a Bearer token".

New in the same change: `std/subtle` (`constantTimeEq`), `std/sha512` (`Sha512`,
`Sha384`), `std/hkdf` (RFC 5869), `std/pbkdf2` (RFC 8018), `Hmac.sha384Bytes` /
`.sha512Bytes` / `.sha512`, `Jwt.signHS384` / `.signHS512` / `.verifyHS384` /
`.verifyHS512`, and `Totp.verify`. No existing name in those modules changed, and
HS256 token output is byte-identical to before.

## HTTP, fetch and argparse lookups return `Option<string>` (2026-08-03)

"Absent" and "present with an empty value" were the same value (`""`) across the
whole HTTP stack, so `?q=` was indistinguishable from no `?q=`, and a
`Cookie: session=` from no cookie at all. `std/env` already answered this with
`Option`; now the rest of the stdlib gives the same answer. Affects
`Context.query/param/header/cookie`, `fetch.findHeader`, `Response.header` and
`ParsedArgs.getString`.

`fetch.hasHeader` is **removed** — it existed only to work around `findHeader`
returning `""` for both cases, and is now exactly `findHeader(...).isSome()`.

`findHeader` also no longer misses a value-less header at the very end of a block
(`"A: b\r\nX-Empty:"` used to report absent).

Note `unwrapOr` is Copy-only, so the collapse spelling is `??`, not `.unwrapOr("")`.

```milo
// before
let q = ctx.query("q")
if q.len == 0 { return badRequest() }
let out = args.getString("output")
if !hasHeader(hdrs, "Accept") { … }

// after
let Option.Some(q) = ctx.query("q") else { return badRequest() }  // absent
if q.len == 0 { return badRequest() }                             // present but empty
let out = args.getString("output") ?? ""
if findHeader(hdrs, "Accept").isNone() { … }
```

`ParsedArgs.getString` is `None` when the name was never declared, or was declared
with no default and not supplied; `--flag ""` is `Some("")`, and a declared default
comes back as `Some(default)`. `has(name)` still answers "was it on the command line".

## `std/zip` and `std/png` report corrupt input instead of aborting (2026-08-03)

A truncated or corrupt archive/image previously ran a header read off the end of the
buffer and hit the bounds-check abort. Both now return `Result.Err` ("zip: truncated
archive", "png: truncated chunk"). Code that relied on the process dying on malformed
input must handle the `Err` arm.

No public name changed — `Zip.read` and `Png.decode` already returned `Result`; they
just could not reach the `Err` arm for this class of input.

## `std/log` — namespace object, levels, fields, sinks (2026-08-03)

The four free functions are replaced by the `Log` namespace object. Logging is
now filtered (default threshold `Info`, so debug records need an explicit
`setLevel`), can carry structured fields, and can be redirected off stderr.

```milo
// before
from "std/log" import { logDebug, logInfo, logWarn, logError }
logInfo("server starting")
logDebug("trace info")            // always printed

// after
from "std/log" import { Log, LogLevel }
Log.info("server starting")
Log.setLevel(LogLevel.Debug)      // debug is below the default threshold
Log.debug("trace info")
Log.str("path", p).int("bytes", n).warn("upload retried")
```

`logDebug`/`logInfo`/`logWarn`/`logError` are removed with no alias: two
spellings for one operation is the coherence defect this change exists to fix.

Also new: `Log.setLevel`/`level`/`isEnabled`, `Log.setFormat(LogFormat.Json)`,
`Log.setTimestamps(false)`, `Log.setSinkFd(fd)`, `Log.setSinkPath(path)`, and
`Logger.new(name)` for per-subsystem tagging. Records now carry an ISO-8601 UTC
timestamp by default; the old format printed a bare epoch-seconds integer.

Configure at startup, before spawning tasks: the config globals are single-word
and unsynchronized, and `setSinkPath` can close a descriptor under an in-flight
write. Records themselves never tear — each renders once and reaches the sink in
one `write(2)`, with control bytes escaped so a newline cannot fake a boundary.

## `Base64.decode`, `Base32.decode`, `Hex.decode`, `Csv.parse` return `Result` (2026-08-03)

All four silently produced plausible output from malformed input: a bad character
decoded as bit pattern 0, a wrong length truncated the payload, an unterminated CSV
quote swallowed the rest of the file into one field. A corrupt auth header became a
real-looking string with no signal. They are now fallible and report the byte offset.

`Hex`'s `pub _hexVal` (which mapped any non-digit to 0) is removed; it is now a
private helper returning -1.

```milo
// before
let bytes = Base64.decode(header)
let rows  = Csv.parse(text)

// after — propagate
let bytes = Base64.decode(header)?
let rows  = Csv.parse(text)?
// or abort at the decode site
let bytes = Base64.decode(header)!
```

`Base32.decode` is now strict RFC 4648. The old tolerance for whitespace, `-` and
missing padding — the "secret pasted from an authenticator app" case — moved to
`Base32.decodeLoose`, which still rejects non-alphabet bytes:

```milo
// before
let key = Base32.decode("JBSW Y3DP EHPK 3PXP")
// after
let key = Base32.decodeLoose("JBSW Y3DP EHPK 3PXP")!
```

`Base64.decode` no longer accepts whitespace or newlines. MIME/PEM-wrapped base64
must be unwrapped by the caller — previously it "worked" only by decoding `\n` as
symbol 0 and producing corrupt bytes.

New: `Base64.urlDecode` — the inverse of `Base64.urlEncode`, which had none.

## `s.parseInt()` / `s.parseF64()` return `Option` (2026-08-03)

| Before | After |
|---|---|
| `let n: i64 = s.parseInt()` | `let Option.Some(n) = s.parseInt() else { … }` |
| `let x: f64 = s.parseF64()` | `let x = s.parseF64().unwrapOr(0.0)` |

`match` and `?` work too. The compiler names the fix in the hint on the type
mismatch, so the migration is mechanical.

No compat shim was possible: the break IS the fix. The old builtins returned a
bare `i64`/`f64` and answered `0` for garbage — `"42x".parseInt()` was `42`,
`"abc".parseF64()` was `0` and indistinguishable from parsing the string `"0"`.
Meanwhile `std/strconv.parseInt` returned `Option<i64>` off a second, stricter
implementation, so the language shipped two parsers with opposite failure models
and the total-*looking* spelling was the lossy one. There is one parser now:
`std/string.strParseInt` / `strParseF64` back the builtins, and
`strconv.parseInt` / `parseFloat` are named aliases for them.

Three behaviour changes ride along. `parseInt` rejects out-of-range input
(`"9223372036854775808"` → `None`) instead of wrapping or trapping.
`strconv.parseIntRadix` now validates every digit against the base:
`parseIntRadix("zz", 16)` was `Some(0)`, now `None`. And `enum Option` / `enum
Result` are now rejected outright — *"'Option' is a builtin enum and cannot be
redeclared"*. Redeclaring one used to be allowed but never rebound the `T?`/`!`/
`??`/`?` sugar; now that prelude signatures name `Option`, it also broke `std`
three files away. Delete the declaration, or rename it if you meant a different
type.

## `Uuid.v4()` returns a `Uuid`, not a `string` (2026-08-03)

`std/uuid` grew a real value type: `Uuid` is 16 bytes (Copy, no heap), with
`Uuid.v4()`, `Uuid.v7()`, `Uuid.parse()`, `Uuid.nil()`, `toString()`, `isNil()`,
`version()`, `variant()`, `timestampMs()`, and `Eq`. Migration: append
`.toString()` where a string was wanted (`Uuid.v4().toString()`).

No compat shim was possible under the one-spelling rule: a `Uuid.v4(): string`
alongside `Uuid.v4(): Uuid` cannot coexist, and keeping the string spelling for
v4 while v7 returned a value would make the module's two constructors disagree
about what a UUID is. The private `uuidV4()` free function is gone with it.

## `std/ws` opcodes are an enum, not six functions (2026-08-03)

`WS_CONTINUATION()`, `WS_TEXT()`, `WS_BINARY()`, `WS_CLOSE()`, `WS_PING()` and
`WS_PONG()` are gone. They were zero-argument functions returning a `u8` —
constants faked with a call, in a language that has integer-repr enums.

| Before | After |
|---|---|
| `WS_CONTINUATION()` | `WsOpcode.Continuation` |
| `WS_TEXT()` | `WsOpcode.Text` |
| `WS_BINARY()` | `WsOpcode.Binary` |
| `WS_CLOSE()` | `WsOpcode.Close` |
| `WS_PING()` | `WsOpcode.Ping` |
| `WS_PONG()` | `WsOpcode.Pong` |

`WsMessage.opcode` is now a `WsOpcode` rather than a `u8`. Compare it against a
variant (`msg.opcode == WsOpcode.Text`) or `match` on it; `msg.opcode as i32`
still gives the RFC 6455 wire nibble, and `WsOpcode.tryFrom(n)` is the partial
reverse.

**Behaviour change.** `WsConn.recv()` now returns `Err("reserved opcode")` when
a frame carries an opcode with no variant (3–7, 11–15). Previously those were
handed to the caller as if they were data frames, which RFC 6455 §5.2 forbids —
the type change is what forced the case to be considered at all.

**Why no shim.** A `u8` opcode and a `WsOpcode` opcode cannot both be the type
of `WsMessage.opcode`, and Milo's flat namespace has no deprecation attribute
for a function name. Hard break.

**Failure mode if you miss one.** A build error: `'WS_TEXT' not found in
'std/ws'`, or a type mismatch on the comparison. Nothing silently keeps working.

## `std/fetch` and `std/zstd` internals are file-private (2026-08-03)

Both modules were exporting their implementation. They now export only their API.

`std/fetch` no longer exports `startsWith` (deleted — use the builtin
`s.startsWith(prefix)` method), nor `strEqNocase`, `hexDigit`, `parseStatus`,
`parseRawHeaders`, `parseBody`, `decodeChunked`, `schemeOffset`, `httpDo`,
`httpsDo`, `doFetch`, `SSL_VERIFY_PEER`, `X509_V_OK`. Migration: `doFetch(url,
opts)` is `fetchWith(url, opts)`; raw responses still parse via `parseResponse`,
requests still serialize via `buildRequest`, and `findHeader`/`hasHeader`/
`isHttps`/`parseHost`/`parsePort`/`parsePath`/`urlEncode`/`formEncode` are
unchanged. The rest were bytes-level steps of those, with no standalone contract.

`std/zstd` no longer exports `BitCS`, `BlockResult`, `FseCTable`, `FseHdr`,
`FseTable`, `HufTable`, `HufTableResult`, `LzResult`, `Rev`, `Seq`, `Seq3`,
`SeqCodes`, `StreamPlan`, `ZDec`, `ZstdHeader` — FSE/Huffman coder state, not an
API. `Zstd.compress` / `.compressRaw` / `.decompress` are the whole module.

No compat shim was possible: `pub` is the only visibility knob, so re-exporting
these would be the bug this change fixes.

## Shadowing is rejected (2026-08-01)

A binding may no longer reuse a name already in scope in the same function —
nested block, loop binding, and match binding included. Migration: rename the
inner binding (`for si in 0..shots.len`), or prefix it with `_` if nothing reads
it.

No compat shim was possible: the old behaviour was not merely permissive, it was
wrong. Codegen's locals map is keyed by name with no scope, so a shadowing
binding leaked past its scope — `let row = 5; for row in nums { … }; print(row)`
printed the LAST ELEMENT, and mutated a `let` to do it. When the types differed
the same leak emitted invalid LLVM IR. Blast radius across std, tests and
examples was one file (`examples/games/flight/shot.milo`).

## Stdlib API coherence migrations (2026-07-30)

Several APIs now have one supported spelling that follows the standard-library
design rules:

| Before | After |
|---|---|
| `newParser(name, description)` | `ArgParser.new(name, description)` |
| `regexNew(pattern)` | `Regex.compile(pattern)` |
| `regexNewFlags(pattern, flags)` | `Regex.compileFlags(pattern, flags)` |
| `regexMatch(re, input)` | `re.isMatch(input)` |
| `regexFind(re, input)` | `re.find(input)` |
| `regexFindAll(re, input)` | `re.findAll(input)` |
| `arenaNew(capacity)` from `std/mem` | `Arena.new(capacity)` |
| `poolNew(size, count)` | `Pool.new(size, count)` |
| `charIsDigit`, `charIsAlpha`, and related byte helpers | `asciiIsDigit`, `asciiIsAlpha`, and the `asciiIs*` family |
| `toLowerChar`, `toUpperChar` | `asciiToLower`, `asciiToUpper` |

String `indexOf`, `indexOfFrom`, and `lastIndexOf` now return `Option<i64>`
rather than the `-1` sentinel. Use `if let Option.Some(index)`, `!` when presence
is already established, or `??` for an intentional fallback.

Regex compilation now returns `Result<Regex>` rather than `Option<Regex>`;
`Option<RegexMatch>` remains the ordinary no-match result. This separates an
invalid expression from a valid expression that happens not to match.

The old aliases were removed rather than retaining two permanent ways to spell
one operation. `milo api` now shows public types and their methods, excludes
file-private and `@internal` plumbing, and resolves the host platform arm under
the importable module name (for example, `std/regex` rather than
`std/regex.linux`).

## Filesystem operations report failures consistently (2026-07-30)

**What changed.** `std/fs` no longer encodes failed metadata and size probes as
zero-filled records or `-1`: `fileInfo`, `lstatInfo`, and `fileSizePath` return
`Option`. `readDir` returns `Result<Vec<DirEntry>, IoError>`, so a failed read is
distinct from a successful empty directory. Convenience predicates remain
simple booleans. Commands such as `removeFile`, `makeDir`,
`renameFile`, `setMode`, `syncFd`, and `changeDir` now return
`Result<Unit, IoError>` instead of a success boolean that was always true.

`Unit` is auto-imported from the prelude and has one value, `Unit {}`. It is the
success payload for a fallible command that produces no data.

**Migration.** Handle or propagate filesystem errors explicitly:

```milo
let entries = readDir(path)!
if isDir(path) { ... }
removeFile(path)?
```

Code that matched `Result.Ok(true)` from a command now matches
`Result.Ok(_unit)`. Use `fileInfo(path)` when absence is meaningful and an
open/read operation when the exact failure reason matters.

**Why there is no compatibility shim.** The old return values erased the exact
information the new contract preserves. Keeping differently named lossy copies
would leave two filesystem mental models permanently.

## Private by default, `pub` to export (2026-07-23)

**What changed.** Top-level declarations are now **file-private by default**.
Previously every declaration was visible everywhere; now a name is visible only
inside the file that declares it unless it is marked `pub`. Referencing a
non-`pub` declaration from a different file is a compile error. `pub` applies to
`fn`, `struct`, `enum`, `trait`, `type`, `interface`, and globals (`let`, `var`,
`thread_local`).

This is a prerequisite for packages: without a private/public boundary, every
internal helper is somebody's dependency and no library can change anything
without breaking consumers.

**Migration.** Mechanical — mark the public surface of each multi-file project
`pub`. A name used only within its own file needs nothing. A name referenced from
another file gets a `pub` prefix on its declaration:

```milo
fn parse(s: string): Doc { ... }        // before
pub fn parse(s: string): Doc { ... }    // after — if another file imports it
```

Single-file programs are unaffected: nothing crosses a file boundary, so nothing
needs `pub`. Examples and tests are leaves (nothing imports them) and need no
annotation.

**Why there is no compatibility shim.** The break is the point — the old behavior
(everything public) is exactly what the new default removes. There is no setting
that restores it without defeating the feature.

**Failure mode if you miss one.** A compile error naming the private declaration
and the file it lives in, at the cross-file reference site. Nothing silently
resolves to a different symbol.

## `std/os` → `std/platform` (Windows port)

**What moved.** The syscall-shaped bindings that need a per-OS implementation
left `std/os` (and `std/dl`) for the platform split
(`std/platform.darwin.milo`, `std/platform.linux.milo`,
`std/platform.windows.milo`):

- `pipe`
- `mmap`, `munmap`, `mprotect`
- `gettimeofday`, `usleep`
- the 17 `pthread_*` bindings (mutex, condvar, thread create/join)
- `read`, `write`, `open`, `close`, `lseek`, `access`, `getpid`
- `dlopen`, `dlsym`, `dlclose`, `dlerror` (were in `std/dl`)

The fd calls moved because their C shape differs, not just their spelling: the
UCRT declares `int _read(int, void *, unsigned int)` where POSIX has
`ssize_t read(int, void *, size_t)`. Declaring the POSIX widths linked on Windows
(the oldnames shim resolves the symbol) and then miscompiled — a 64-bit return
declared over a 32-bit C `int` return reads undefined high bits, so `-1` could
surface as a large positive `i64`. The rule this establishes: **when a C
declaration differs by platform, it belongs in the platform split, not in a
conditional annotation.** The file name states which C library is described, so
the claim in it is unconditionally true and needs no OS qualifier.

**Migration.** Change the import path; the names and signatures are unchanged:

```milo
from "std/os" import { pipe }        // before
from "std/platform" import { pipe }  // after
```

**Why there is no compatibility shim.** Milo has a flat namespace and no
re-export: a module cannot forward a name it does not define, and defining
`pipe` in both `std/os` and `std/platform` is a duplicate-symbol error, not a
shadow. So the choice was a hard break or two names that can never coexist.
Hard break.

**Why the move at all.** Windows has no `pipe`, no `mmap`, no `pthread_*`. The
platform split is the only conditional-compilation mechanism in the language —
the filename suffix *is* the mechanism, there is no `#[cfg]` — so anything with
a per-OS body has to live there. Leaving them in `std/os` would have meant
`std/os` itself becoming POSIX-only, which is the same break with worse
ergonomics.

**Failure mode if you miss one.** A build error naming the symbol and the
module it is no longer in — `error[import]: 1:1: 'pipe' not found in 'std/os'`.
Nothing silently resolves to a different symbol.
