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
