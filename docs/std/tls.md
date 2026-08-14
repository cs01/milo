# std/tls

## std/tls

### `TlsConn.recv`

```milo
fn TlsConn.recv(self: &TlsConn): Result<string, NetError>
```

Read to EOF, as one string. For a request framed by the peer closing its write
half; an HTTP server wants recvOnce().

### `TlsConn.recvOnce`

```milo
fn TlsConn.recvOnce(self: &TlsConn): string
```

A single SSL_read of whatever has arrived. A server must answer while the client
still holds the connection open, so a read-to-EOF loop would deadlock; this
returns after one record — the TLS analogue of one read(2) on the socket.

### `TlsConn.send`

```milo
fn TlsConn.send(self: &TlsConn, data: &string): Result<i64, NetError>
```

Write `data` through the TLS record layer. Returns the byte count OpenSSL accepted.

### `TlsListener.accept`

```milo
fn TlsListener.accept(self: &TlsListener): Result<TlsConn, NetError>
```

Accept one connection and run the server handshake on it.

### `TlsListener.bind`

```milo
fn TlsListener.bind(port: u16, certPath: &string, keyPath: &string): Result<TlsListener, NetError>
```

Bind 0.0.0.0:port and serve `certPath` (PEM chain, leaf first) with `keyPath`.
Port 0 lets the OS pick — recover it with port().

### `TlsListener.port`

```milo
fn TlsListener.port(self: &TlsListener): i32
```

The bound port — how to learn what the OS picked after bind(0).
-1 if getsockname fails, mirroring getSockPort rather than reporting a
plausible-looking port number.
