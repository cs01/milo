# std/https

## std/https

### `serveRouterTls`

```milo
pub fn serveRouterTls(port: u16?, certPath: &string, keyPath: &string, router: &Router): Result<Unit>
```

serveRouter over TLS — routes and Context-set headers behave exactly as in std/http.

### `serveTls`

```milo
pub fn serveTls(port: u16?, certPath: &string, keyPath: &string, handler: (&Request) => Response): Result<Unit>
```

Serve HTTPS on `port` (None = OS-chosen) with the PEM cert chain and private key at
`certPath`/`keyPath`. One request per connection, closed after the response — the same
contract as http.serve. Only returns on a fatal bind/listen error.
