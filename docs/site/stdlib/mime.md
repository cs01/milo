# std/mime

Filename extension to media type, for serving static files.

```milo
from "std/mime" import { Mime }
```

A lookup table, nothing more. It reads the extension and answers what that
extension conventionally means; it never opens the file and never sniffs the
bytes. A `.png` full of HTML is still `image/png` here.

```milo
fn Mime.fromExtension(ext: &string): Option<string>   // "html" / ".HTML" -> text/html
fn Mime.fromPath(path: &string): Option<string>       // "/a/index.html"  -> text/html
fn Mime.contentType(path: &string): Option<string>    // adds "; charset=utf-8" for text
fn Mime.isTextual(mediaType: &string): bool
```

## Serving a file

`contentType` is the one to send, because it appends `; charset=utf-8` to textual
types. That is not decoration: a `text/html` response with no declared charset
lets the browser guess, and a guess an attacker can steer (classically UTF-7)
turns escaped output back into markup.

```milo
let ct = match Mime.contentType(path) {
    Option.Some(t) => t,
    Option.None => "application/octet-stream",
}
```

Unknown extensions are `Option.None` rather than a built-in default, because the
safe default depends on what you are serving — a static-site server and an upload
bucket want different answers, and only the caller knows which it is.

## Uploads

Do not label an upload with the type its filename claims. That is how a stored
`.html` gets served back as `text/html` and runs as your origin. Decide the type
of untrusted content from your own policy, or serve it from a separate origin
with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`.

## Details

`fromExtension` accepts the extension with or without a leading dot and in any
case. `fromPath` takes the text after the last `.` in the last path segment, so
`/etc/conf.d/app` and `/home/u/.htaccess` have no extension — a leading dot marks
a hidden file, and a dot in a parent directory belongs to that directory.

`.ts` answers `video/mp2t`, matching the registry and every other server, rather
than quietly disagreeing with them about TypeScript source.

`isTextual` accepts a bare type or a full header value; parameters after the
first `;` are ignored.
