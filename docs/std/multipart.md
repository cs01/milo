# std/multipart

## std/multipart

### `Limits.new`

```milo
fn Limits.new(): Limits
```

The defaults: 256 parts, 8 MiB per part body, 16 KiB per part header
block. Sized for an ordinary form post; raise maxPartBytes deliberately
if you accept large uploads, and lower it if you do not.

### `Multipart.boundary`

```milo
fn Multipart.boundary(contentType: &string): Option<string>
```

The `boundary` parameter of `contentType`, or None when it is absent or
not a legal boundary.

A probe: it deliberately does not distinguish "no boundary" from "illegal
boundary", because a caller that only wants to know whether a request is
parseable cannot act on the difference. `parse` reports them separately.

### `Multipart.field`

```milo
fn Multipart.field(parts: &Vec<Part>, name: &string): Option<string>
```

The body of the first part named `name`, or None if there is none.

Returns an owned copy. File parts are included: this asks about the field
name, not about whether the value came from a file input.

### `Multipart.parse`

```milo
fn Multipart.parse(body: &string, contentType: &string): Result<Vec<Part>, MultipartError>
```

Parse `body` as the multipart entity described by the `Content-Type`
header value `contentType`, under `Limits.new()`.

Parts come back in the order they appeared; duplicate field names are
kept, because a form with several checkboxes of one name is normal. The
preamble before the first delimiter and the epilogue after the closing
one are discarded, as RFC 2046 requires.

### `Multipart.parseWithLimits`

```milo
fn Multipart.parseWithLimits(body: &string, contentType: &string, limits: &Limits): Result<Vec<Part>, MultipartError>
```

Parse as `parse` does, under caller-chosen limits.

### `MultipartError.message`

```milo
fn MultipartError.message(self: &MultipartError): string
```

_Undocumented._

### `Part.isFile`

```milo
fn Part.isFile(self: &Part): bool
```

Whether the client sent this part as a file upload (it carried a
`filename` parameter). An empty filename still counts as a file — that
is what browsers send for an empty <input type="file">.

### `Part.safeFilename`

```milo
fn Part.safeFilename(self: &Part): Option<string>
```

The client's filename reduced to something safe to use as a single path
component, or None when nothing safe is left.

Rejects, rather than repairs: everything up to the last '/' or '\' is
dropped (so "../../etc/passwd" and "C:\evil\x.txt" become "passwd" and
"x.txt"), and the remainder must then be non-empty, at most 255 bytes,
not "." or "..", free of C0 controls, DEL and the bytes Windows treats
specially (`: * ? " < > |`), not end in a space or a dot (Windows strips
those, which is how "evil.php." defeats an extension check), and not be a
Windows reserved device name such as CON or LPT1 — those are devices on
every drive and in every directory.

What this is not: it does not make the *content* safe, does not stop a
caller from overwriting an existing file of the same name, and does not
constrain the extension. Join it onto a directory you chose, and prefer
a name you generated over one an uploader picked.
