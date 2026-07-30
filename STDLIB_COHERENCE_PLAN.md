# stdlib coherence overhaul — plan

No backcompat. Nobody uses Milo yet. Goal: one mental model, method-first, typed errors, subdir grouping.
Branch `stdlib-coherence` off main. Gate every phase: `bun test tests/run.test.ts` green + commit. Then merge to main + update siblings (emulators, milojs, yaml).

## DECISION 2026-07-30: namespace-object model (imported)

Everything is `Receiver.method()`. Utility modules become **namespace structs** imported once:
`from "std/crypto" import { Crypto }` → `Crypto.sha256()`. `Json.parse()`, `Math.sqrt()`, `Base64.encode()`.
Mechanism: `pub struct N {}` + `impl N { fn foo(...) {...} }` (static, no self). Verified works, zero compiler change.
- Kills the last free-function category AND the prefix tax (Crypto.encode vs Base64.encode can't collide).
- Instance ops stay instance methods (`s.trim()`, `dt.format()`, `j.str(k)`) — do NOT pull them onto a namespace.
- Namespaces are IMPORTED, not global (Milo explicit-deps ethos). Maybe bless a tiny prelude set later.
- LSP TODO: `Namespace.` static-method completion (only builtin-type member completion done so far).
- P3/P4/P6 now PRODUCE namespace types instead of free fns.

## Mental model (the invariants)

1. **Methods on the receiver.** Any op with a natural receiver = method.
   - `s.trim()`, `s.contains(x)`, `s.split(sep)`, `s.toInt(): Option<i64>`, `s.toLower()`
   - `v.join(sep)`, `v.sort()`, `v.contains(x)` (needs Phase 0 compiler feature)
   - `dt.format()`, `j.str("k")`, `set.add(x)`
   - Free fn ONLY when no receiver: `fetch(url)`, module constructors below.
   - Kills all `str*`/`vecJoin`/`dateTime*`/`set*` prefixes.

2. **Constructors.** `Type.new(...)` canonical; `Type.verb(...)` named alt.
   - `File.openRead/openWrite`, `TcpStream.connect`, `TcpListener.bind`, `Json.parse`, `DateTime.now/fromEpoch`, `Instant.now`, `ArgParser.new`.
   - Kill free `newX` / `xNew<T>()` / lowercase factories (`jsonObj`, `dateTimeNow`, `setNew`).

3. **Errors.**
   - Fallible IO/net/syscall/detailed-parse → `Result<T, DomainError>` with a real enum. NO bare `Result<T>`.
   - Simple absence / lenient parse → `Option<T>`.
   - Total/pure → value; domain violation → `requires` trap (math).
   - Kill silent sentinels: `readDir` empty-on-error, `strParseInt`→0. Make them Result/Option.

4. **Builders:** one style — `&mut self` mutating chain. Convert JsonObj consuming builder.

5. **No duplicates:** one name per op. Delete `writeStr` (keep stdout writer), `fmt.join` (→`v.join`), `string.trim` (→`s.trim`), raw libm `pub` externs (keep `math.*`), `strParseInt` (→`s.toInt`), `crypto.sha256/sha1` OpenSSL dups vs pure-Milo (decide per-perf; default keep pure-Milo, crypto keeps only aes + md5).

## Taxonomy (subdirs; dir≠module via rename where they collide)

```
text/      string strconv unicode cstr regex csv keys fmt ansi color
encoding/  json toml base64 base32 hex
crypto/    sha1 sha256 hmac jwt totp uuid checksum xxhash cipher(<-crypto, aes/md5 only)
compress/  deflate inflate zip zstd
image/     png
net/       net http httpmw fetch ws url
io/        io fs
time/      time datetime
async/     runtime event sync select pool arena mem
sys/       os platform environ sysinfo process pty signal unix dl env args argparse testing tty(<-term) random log
math/      math sort set smt
```
Platform arms keep suffix at new path: `crypto/cipher.darwin.milo` etc. Resolver needs NO change (verified).
prelude imports become method-based → prelude shrinks (string ops are methods now, no import needed... but methods on builtin need the impl in scope — verify impl visibility rules).

## Phases (each: implement → `bun test tests/run.test.ts` → commit)

P0 (compiler impl-on-builtin) — DROPPED. Not needed: string/primitive `impl` works; Vec/HashMap/string
common methods already builtin (lowered to non-pub str* backend); HashSet is a user struct.

- **P1 text — DONE (9d102538).** str* string ops are now methods-only publicly: kept as *non-pub* lowering
  backend in std/string.milo, stripped `pub`. Removed str*/vecJoin/trim from prelude (methods need no import).
  Deleted bare `trim` dup. Added `indexOfFrom` method (checker+lower). LSP: member completion for builtin
  string/vec/map methods (`s.tr`→trim). Codemod rewrote 9 call-site files. 617 fixtures + 23 LSP green.
  DEFERRED to later: strconv strict-parse fold (`s.toInt(): Option`), char helpers → `impl u8`, fmt family.
- **P2 io/fs:** move readFile/readLines→fs; dedup writeStr/writeStdout (stdout writer); unify fs return types (Result<_,IoError>); readDir→Result.
- **P3 json — DONE (93765f6a).** Json namespace: `Json.parse/parseJsonc/obj/arr` statics; jsonParse/jsoncParse/jsonObj/jsonArr
  now private backend. LSP: namespace static-method completion (`Json.pa`→parse) — generalizes to all namespaces.
  DEFERRED: `Result<T>`→typed `JsonError`; hide internal parser fns (jsonParseValue etc still pub); jsonStringify (builtin)→Json.stringify; JsonObj consuming→&mut builder.
- **P5 datetime — DONE (c95644cb).** DateTime.now/fromEpoch/localNow statics + dt.format/formatDate/formatTime methods.
- **P4 net/http:** http `Result<T>`→typed `HttpError`/`NetError`; constructor cleanup; fetch→`Http.get` namespace? audit.
- **P6 namespaces + collections/misc:** Crypto/Math/Base64/Hex/Toml namespaces; set free-fns→HashSet methods; strconv fold into string methods (`s.toInt():Option`); fmt family→builtin; constructor sweep newX→Type.new; un-pub libm externs; crypto/sha dedup. (Each module = same codemod pattern: wrap pub fns in `struct N{}`+impl statics, non-pub backend, codemod calls+imports.)
- **P7 regroup:** physical file moves into subdirs + import-path codemod across std+examples+tests. LAST (module set final). Green.
- **P8 verify:** full `bun test`; build a sample of examples per domain; formatter+LSP updated (definition-of-done).
- **P9 merge+siblings:** merge to main; apply codemods to emulators/milojs/yaml, build/test each.

## Open risks
- Method resolution on builtin generics (P0) — codegen monomorphization interplay; may be nontrivial.
- Method-first arg-reorder codemod for 279 str* sites — nested calls need care; script + spot-verify, suite is the net.
- impl-in-scope visibility: does a method impl on `string` in std/text/string.milo apply everywhere it's used, or must it be imported? Determines prelude story.
