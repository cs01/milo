<!-- doc-meta
system: stdlib-coherence-migration
purpose: old free-fn -> namespace/method migration map for the stdlib coherence overhaul (no backcompat)
key-files: std/*.milo, src/checker.ts, src/lower.ts, src/lsp.ts
update-when: a stdlib module gains/renames a namespace, or a deferred item (P7 regroup, toInt/toFloat, http typed errors, fmt builtin) lands
last-verified: 2026-07-30
-->

# stdlib coherence — API migration

The standard library moved to one mental model: **everything is a method call** — either
on a value (`s.trim()`, `dt.format()`) or on a namespace struct (`Json.parse()`, `Math.sqrt()`).
Free utility functions with a `modulePrefix` (`base64Encode`, `mathSqrt`, `jsonParse`, …) are gone;
their bodies live on as non-`pub` backends behind the namespace. There is **no backcompat** — code
built against the old free functions must migrate.

Import the namespace, then call statics on it:

```milo
from "std/crypto" import { Crypto }
from "std/encoding/json" import { Json }   // path unchanged today; see "Deferred" below

let h = Sha256.hash(input)     // was: sha256(input)
let d = Json.parse(text)!      // was: jsonParse(text)!
```

## Migration map

| Module (`from "std/…"`) | Old free fn | New |
|---|---|---|
| string | `strTrim(s)`, `strSplit(s,x)`, … | `s.trim()`, `s.split(x)` (methods) |
| io / fs | `readFile` from `std/io` | `readFile` from **`std/fs`** (moved); `writeStr`→`writeStdout` |
| datetime | `dateTimeNow()`, `dateTimeLocalNow()` | `DateTime.now()`, `DateTime.localNow()` |
| datetime | `dateTimeFormat(dt)`, `dateTimeFormatTime(dt)` | `dt.format()`, `dt.formatTime()` (instance) |
| json | `jsonParse`, `jsonObj`, `jsonArr` | `Json.parse`, `Json.obj`, `Json.arr` |
| math | `mathSqrt`, `mathPow`, `mathFloor`, … | `Math.sqrt`, `Math.pow`, `Math.floor`, … |
| set (HashSet) | `setAdd(s,x)`, `setContains(s,x)` | `s.add(x)`, `s.contains(x)`; `HashSet<T>.new()` |
| base64 / hex / base32 | `base64Encode`, `hexEncode`, `base32Encode` | `Base64.encode`, `Hex.encode`, `Base32.encode` |
| sha256 / sha1 | `sha256(x)`, `sha1Bytes(x)` | `Sha256.hash(x)`, `Sha1.bytes(x)` |
| hmac | `hmacSha256(k,m)`, `hmacSha1Bytes(k,m)` | `Hmac.sha256(k,m)`, `Hmac.sha1Bytes(k,m)` |
| jwt | `jwtSignHS256`, `jwtVerifyHS256` | `Jwt.signHS256`, `Jwt.verifyHS256` |
| totp | `hotp(...)`, `totp(...)` | `Totp.hotp(...)`, `Totp.generate(...)` |
| uuid | `uuidV4()` | `Uuid.v4()` |
| checksum | `crc32(x)`, `adler32(x)` | `Checksum.crc32(x)`, `Checksum.adler32(x)` |
| xxhash | `xxh64(x,seed)`, `xxh64Hex(...)` | `Xxhash.hash64(...)`, `Xxhash.hex64(...)` |
| crypto (platform) | `sha256`, `md5`, `aesGcmEncrypt`, … | `Crypto.sha256`, `Crypto.md5`, `Crypto.aesGcmEncrypt`, … |
| toml / url | `tomlParse(s)`, `urlParse(s)` | `Toml.parse(s)`, `Url.parse(s)` (statics on the data struct; getters stay instance) |
| csv | `csvParse`, `csvStringify` | `Csv.parse`, `Csv.stringify` |
| env | `getEnv`, `getEnvOr` | `Env.get`, `Env.getOr` |
| path | `pathJoin`, `pathBasename`, `pathExt`, … | `Path.join`, `Path.basename`, `Path.ext`, … |
| random (platform) | `randInt`, `randFloat`, `randBytes`, … | `Random.int`, `Random.float`, `Random.bytes`, … |
| ansi | `cursorTo`, `ansiReset`, `clearScreen`, … | `Ansi.cursorTo`, `Ansi.reset`, `Ansi.clearScreen`, … |
| color | `red(s)`, `bold(s)`, `gray(s)`, … | `Color.red(s)`, `Color.bold(s)`, `Color.gray(s)`, … |
| deflate / inflate | `gzipCompress`, `gzipDecompress`, `deflate` | `Deflate.gzip`, `Inflate.gzip`, `Deflate.raw` |
| zip / zstd / png | `zipRead`, `zstdCompress`, `decodePng` | `Zip.read`, `Zstd.compress`, `Png.decode` |

Instance ops stay instance methods — never pulled onto a namespace: `s.trim()`, `dt.format()`,
`j.str("k")`, `set.add(x)`, `u.queryGet("k")`.

## Editor support

Autocomplete covers both forms: member completion (`s.tr`→`trim`) and namespace static
completion (`Json.pa`→`parse`). Preconditions are checked at static-method call sites too
(`Math.sqrt(-1)` is a compile error).

## Deferred (tracked follow-ups)

- **P7 subdir regroup** — physically moving files into `text/ encoding/ crypto/ compress/ net/ …`
  and rewriting every import path. The resolver maps `std/x` → `std/x.milo` directly, so this is
  a repo-wide import-path rewrite (std + examples + tests + downstream repos); no API/behavior change.
- **net/http typed errors** — `Result<T>` → `Result<T, HttpError/NetError>`.
- **`fmt` → builtin** — collapse the `fmt` family into the compiler.
