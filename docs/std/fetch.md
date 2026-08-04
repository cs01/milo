# std/fetch

## std/fetch

### `buildRequest`

```milo
pub fn buildRequest(host: &string, path: &string, opts: &FetchOptions): string
```

Serialize a request. HTTP does not require Accept or User-Agent, but real
servers reject requests without them: Overpass 406s an Accept-less client, and
several public APIs 403 an anonymous one. Both are only supplied when the
caller has not set their own, so an explicit header always wins.

### `fetch`

```milo
pub fn fetch(url: &string): Result<Response, NetError>
```

_Undocumented._

### `fetchDelete`

```milo
pub fn fetchDelete(url: &string): Result<Response, NetError>
```

_Undocumented._

### `fetchForm`

```milo
pub fn fetchForm(url: &string, body: &string): Result<Response, NetError>
```

POST an application/x-www-form-urlencoded body — build it with formEncode, or
hand-roll it with urlEncode. Several APIs that nominally accept a raw body
(Overpass, most OAuth token endpoints) only accept this content type.

### `fetchPatch`

```milo
pub fn fetchPatch(url: &string, body: &string): Result<Response, NetError>
```

_Undocumented._

### `fetchPost`

```milo
pub fn fetchPost(url: &string, body: &string): Result<Response, NetError>
```

_Undocumented._

### `fetchPut`

```milo
pub fn fetchPut(url: &string, body: &string): Result<Response, NetError>
```

_Undocumented._

### `fetchWith`

```milo
pub fn fetchWith(url: &string, opts: FetchOptions): Result<Response, NetError>
```

_Undocumented._

### `findHeader`

```milo
pub fn findHeader(headers: &string, name: &string): Option<string>
```

Value of `name` in a CRLF-joined header block, or None if it is not there.
A header sent with no value (`Accept:`) is present: Some("").

### `formEncode`

```milo
pub fn formEncode(fields: &Vec<FormField>): string
```

Build an application/x-www-form-urlencoded body. Both halves of every pair are
percent-encoded, so a value containing '&' or '=' can't split the body into
extra fields.

### `isHttps`

```milo
pub fn isHttps(url: &string): bool
```

_Undocumented._

### `parseHost`

```milo
pub fn parseHost(url: &string): string
```

_Undocumented._

### `parsePath`

```milo
pub fn parsePath(url: &string): string
```

_Undocumented._

### `parsePort`

```milo
pub fn parsePort(url: &string): u16
```

_Undocumented._

### `parseResponse`

```milo
pub fn parseResponse(raw: string): Response
```

_Undocumented._

### `Response.header`

```milo
fn Response.header(self: &Response, name: &string): Option<string>
```

Value of response header `name` (case-insensitive), or None if the
response did not carry it. A header sent with an empty value is Some("").

### `Response.json`

```milo
fn Response.json(self: &Response): Json
```

Parse the response body as JSON.

### `Response.ok`

```milo
fn Response.ok(self: &Response): bool
```

Return true if the status code is 2xx (success).

### `Response.text`

```milo
fn Response.text(self: &Response): string
```

Return the response body as a string.

### `TlsStream.connect`

```milo
fn TlsStream.connect(ip: u32, port: u16, hostname: &string): Result<TlsStream, NetError>
```

_Undocumented._

### `TlsStream.incoming`

```milo
fn TlsStream.incoming(self: &TlsStream): Channel<string>
```

Stream decrypted inbound bytes as an iterable channel, pumped on a green
task — the uniform async-read API, TLS variant. Uses the SSL-aware read
(parks on WANT_READ) rather than the raw-fd fdChannel. `for chunk in
tls.incoming()`; the channel closes at EOF / on SSL error.
LIFETIME: keep this TlsStream alive while consuming — the detached pump
reads through its SSL handle; dropping it frees that state under the pump.

### `TlsStream.recv`

```milo
fn TlsStream.recv(self: &TlsStream): Result<string, NetError>
```

Read everything until the peer closes, as one string (blocks to EOF).
Prefer `incoming()` for streaming/incremental consumption.

### `TlsStream.send`

```milo
fn TlsStream.send(self: &TlsStream, data: &string): Result<i64, NetError>
```

_Undocumented._

### `urlEncode`

```milo
pub fn urlEncode(s: &string): string
```

Percent-encode one component of a URL query or an
application/x-www-form-urlencoded body. Everything outside RFC 3986's
unreserved set becomes %XX, space included: `%20` decodes back to a space in
both a query string and a form body, whereas `+` only does in the latter.
