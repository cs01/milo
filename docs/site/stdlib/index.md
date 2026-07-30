# Standard Library

Import modules with `from "std/<name>" import { symbols }`.

Most utilities are **namespaced**: call a static on the namespace (`Path.join`, `Json.parse`,
`Math.sqrt`) or a method on the value (`s.trim()`, `dt.format()`).

## I/O & Filesystem

| Module | What it provides |
|--------|-----------------|
| [`std/io`](io) | `readStdin`, `writeStdout`, `File.openRead`/`.openWrite`/`.openAppend`, `f.readAll()`, `f.writeAll()`, RAII file handles |
| [`std/fs`](fs) | `readFile`, `readLines`, `readDir`, `fileInfo`, `isDir`/`isFile`, `pathExists`, `writeFile` |
| [`std/path`](path) | `Path.join`, `Path.basename`, `Path.dirname`, `Path.ext`, `Path.stem` |
| [`std/env`](env) | `Env.get`, `Env.getOr` |

## Networking

| Module | What it provides |
|--------|-----------------|
| [`std/net`](net) | TCP, DNS, `fetch` with TLS |
| [`std/http`](http) | HTTP server with Hono-style router, context, middleware |

## Data

| Module | What it provides |
|--------|-----------------|
| [`std/json`](json) | Zero-copy JSON parser — `Json.parse`, keyed accessors (`.str()`, `.i64()`, `.f64()`, `.bool()`), `Json.stringify` |
| [`std/arena`](arena) | Generational arena for cyclic/graph data with safe `Handle<T>` |
| [`std/set`](set) | `HashSet<T>` — `s.add`, `s.contains`, `s.remove` |

## CLI & System

| Module | What it provides |
|--------|-----------------|
| [`std/argparse`](argparse) | CLI argument parsing with typed getters and `--help` generation |
| [`std/args`](args) | Raw CLI arguments — `args()`, `getFlag`, `hasFlag` |
| [`std/process`](process) | Command execution, `Process.spawn`/`.wait()`/`.signal()`, `run`, `capture` |
| [`std/signal`](signal) | POSIX signal handling — `onSignal`, `ignoreSignal` |

## Data Formats

| Module | What it provides |
|--------|-----------------|
| [`std/csv`](csv) | CSV parsing with header support — `Csv.parse`, `Csv.stringify` |
| [`std/toml`](toml) | TOML config parsing — `Toml.parse`, then `.str()`, `.i64()`, `.table()` |
| [`std/base64`](base64) | Base64 encode/decode — `Base64.encode`, `Base64.decode` |
| [`std/hex`](hex) | Hex encode/decode — `Hex.encode`, `Hex.decode` |

## Date, Time & IDs

| Module | What it provides |
|--------|-----------------|
| [`std/time`](time) | Wall clock, monotonic timing, sleep |
| [`std/datetime`](datetime) | Date/time — `DateTime.now`/`.fromEpoch`, then `dt.format()`, `weekdayName` |
| [`std/uuid`](uuid) | UUID v4 generation — `Uuid.v4` |

## Concurrency

| Module | What it provides |
|--------|-----------------|
| `std/runtime` | `Task.spawn`, `Promise` / `Promise.blocking`, green scheduler |
| [`std/sync`](sync) | `Channel`, `WaitGroup`, `AtomicI64`, `AtomicBool` — all method-based |

## Database & Network

| Module | What it provides |
|--------|-----------------|
| [`std/sqlite`](sqlite) | SQLite3 bindings — `dbOpen`, `dbQuery`, `dbExec`, prepared statements |
| [`std/url`](url) | URL parsing — `Url.parse`, then `u.queryGet`, `u.toString` |

## Strings & Formatting

| Module | What it provides |
|--------|-----------------|
| [`std/string`](string) | String **methods** — `s.contains`, `s.split`, `s.replace`, `s.trim`, case conversion |
| [`std/fmt`](fmt) | Template formatting (`fmt1`–`fmt4`), `padLeft`/`padRight`, `join` |
| [`std/strconv`](strconv) | `parseInt`, `parseFloat`, radix conversions, `formatFloat` |
| [`std/unicode`](unicode) | Character classification — `isDigit`, `isAlpha`, `toLowerChar` |

## Math & Random

| Module | What it provides |
|--------|-----------------|
| [`std/math`](math) | `Math.abs`, `Math.min`, `Math.max`, `Math.pow`, `Math.sqrt`, `Math.log`, trig |
| [`std/random`](random) | `Random.int`, `Random.float`, `Random.range`, `Random.shuffleI64` |

## Utilities

| Module | What it provides |
|--------|-----------------|
| [`std/color`](color) | SGR text styling — `Color.red`, `Color.green`, `Color.bold`, etc. |
| [`std/regex`](regex) | Regular expression matching — `regexNew`, `regexMatch`, `regexFind` |
| [`std/sort`](sort) | Sorting for Vec — `sortI32`, `sortI64`, `sortStrings` |
| [`std/testing`](testing) | `assert`, `assertEqual`, `assertStrEqual` |
| [`std/log`](log) | Leveled logging to stderr — `logDebug`, `logInfo`, `logWarn`, `logError` |
| [`std/mem`](mem) | `mmapAnon`, `mmapFile`, bump-allocator arena |

## Cryptography

OpenSSL-backed hashing plus pure-Milo hashing, MAC, and token modules (no C codec dependency; constant-time and WCET-analyzable).

| Module | What it provides |
|--------|-----------------|
| [`std/crypto`](crypto) | `Crypto.sha256`, `Crypto.sha1`, `Crypto.md5`, and `Crypto.aesGcmEncrypt`/`.aesGcmDecrypt` (128/256-bit AES-GCM) |
| [`std/sha256`](sha256) | Pure-Milo SHA-256 — `Sha256.hash`, `Sha256.bytes` |
| [`std/sha1`](sha1) | Pure-Milo SHA-1 — `Sha1.hash`, `Sha1.bytes` |
| [`std/hmac`](hmac) | HMAC-SHA256 / HMAC-SHA1 — `Hmac.sha256`, `Hmac.sha1Bytes` |
| [`std/jwt`](jwt) | JWT sign/verify (HS256) — `Jwt.signHS256`, `Jwt.verifyHS256` |
| [`std/totp`](totp) | RFC 6238 TOTP / RFC 4226 HOTP one-time passwords — `Totp.generate`, `Totp.hotp` |
| [`std/base32`](base32) | Base32 encode/decode (RFC 4648) — `Base32.encode`, `Base32.decode` |

## Compression

Pure-Milo DEFLATE (RFC 1951) and the gzip / zlib / zip containers built on it.

| Module | What it provides |
|--------|-----------------|
| [`std/deflate`](deflate) | Compress — `Deflate.raw`, `Deflate.gzip`, `Deflate.zlib` |
| [`std/inflate`](inflate) | Decompress — `Inflate.raw`, `Inflate.gzip`, `Inflate.zlib` |
| [`std/zip`](zip) | Read ZIP archives — `Zip.read` (`.zip`/`.jar`/`.epub`/`.docx`) |

## HTTP Server Example

```milo
from "std/http" import { Context, Response, Router, serveRouter }

fn homeHandler(ctx: &mut Context): Response {
    return ctx.html("<h1>Hello!</h1>")
}

fn jsonHandler(ctx: &mut Context): Response {
    let name = ctx.query("name")
    return ctx.json($"\{\"hello\": \"{name}\"}")
}

fn main(): i32 {
    var r: Router = Router.new()
    r.get("/", homeHandler)
    r.get("/api", jsonHandler)
    serveRouter(8080, r)
    return 0
}
```

## Arena Example

For cyclic data (graphs, doubly-linked lists), use `std/arena`. Nodes reference each other via `Handle<T>` — typed indices — instead of pointers:

```milo
from "std/arena" import { Arena, Handle, arenaNew, arenaAlloc, arenaModify }

struct DLNode {
    value: i64,
    prev: Option<Handle<DLNode>>,
    next: Option<Handle<DLNode>>,
}

fn main(): i32 {
    var arena: Arena<DLNode> = arenaNew()
    let a = arenaAlloc(arena, DLNode { value: 1, prev: Option.None, next: Option.None })
    let b = arenaAlloc(arena, DLNode { value: 2, prev: Option.Some(a), next: Option.None })
    arenaModify(arena, a, (n: DLNode) => {
        var updated = n
        updated.next = Option.Some(b)
        return updated
    })
    return 0
}
```
