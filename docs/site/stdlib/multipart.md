# std/multipart

Parsing `multipart/form-data` request bodies (RFC 7578) — the format a browser
posts a file upload with.

```milo
from "std/multipart" import { Multipart, Part, Limits, MultipartError }
```

Every byte of a multipart body is attacker-controlled: the boundary, the number
of parts, each part's headers, the declared content type, and the filename. The
parser is written on that assumption.

## Parsing

```milo
fn Multipart.parse(body: &string, contentType: &string): Result<Vec<Part>, MultipartError>
fn Multipart.parseWithLimits(body: &string, contentType: &string, limits: &Limits): Result<Vec<Part>, MultipartError>
fn Multipart.boundary(contentType: &string): Option<string>
fn Multipart.field(parts: &Vec<Part>, name: &string): Option<string>
```

```milo
match Multipart.parse(ctx.req.body, contentType) {
    Result.Ok(parts) => {
        for i in 0..parts.len {
            print(parts[i].name)
        }
    }
    Result.Err(e) => {
        print("bad upload: " + e.message())
    }
}
```

Parts come back in order and duplicate field names are kept — a form with several
checkboxes of one name is normal, so `field` answers the first. The preamble
before the first delimiter and the epilogue after the closing one are discarded,
as RFC 2046 requires.

## Limits

```milo
struct Limits {
    maxParts: i64,        // default 256
    maxPartBytes: i64,    // default 8 MiB
    maxHeaderBytes: i64,  // default 16 KiB
}
```

`Multipart.parse` applies `Limits.new()` rather than making you remember to.
Crossing a limit is an error naming it, never a truncated-but-plausible parse.

```milo
var limits = Limits.new()
limits.maxPartBytes = 65536
let parts = Multipart.parseWithLimits(body, contentType, limits)?
```

The body must already be in memory: this is not a streaming parser, so bounding
how much you read off the socket before calling in is still yours to do.

## The filename is the client's, not yours

```milo
struct Part {
    name: string,
    filename: Option<string>,   // raw, untrusted
    contentType: string,        // a claim, not a measurement
    body: string,
}

fn Part.isFile(self: &Self): bool
fn Part.safeFilename(self: &Self): Option<string>
```

`Part.filename` is exactly what the client sent. It can be `../../etc/passwd`,
`.`, a name with a NUL or a newline in it, or 4 KB long. `safeFilename` is the
only thing here you may join onto a path:

```milo
let name = match parts[i].safeFilename() {
    Option.Some(n) => n,
    Option.None => generateOwnName(),
}
```

It rejects rather than repairs. Everything up to the last `/` or `\` is dropped,
and the remainder must then be non-empty, at most 255 bytes, not `.` or `..`,
free of C0 controls, DEL and the bytes Windows treats specially (`: * ? " < > |`),
not end in a space or a dot (Windows strips those, which is how `evil.php.`
defeats an extension check), and not be a reserved device name such as `CON` or
`LPT1` — those resolve in every directory on Windows.

It does not make the *content* safe, does not stop you overwriting an existing
file of the same name, and does not constrain the extension. `Part.contentType`
is a claim by the client: do not decide how to handle a file from it, and do not
echo it back as the `Content-Type` of a download.

## Errors

`MultipartError` names what failed, with a byte offset into the body for
per-part failures: `NotMultipart`, `MissingBoundary`, `InvalidBoundary`,
`NoOpeningDelimiter`, `Unterminated(at)`, `MalformedHeader(at)`,
`NotFormData(at)`, `MissingName(at)`, `TooManyParts(limit)`,
`PartTooLarge(limit)`, `HeadersTooLarge(limit)`. `e.message()` renders any of
them.
