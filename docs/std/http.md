# std/http

## std/http

### `Context.cookie`

```milo
fn Context.cookie(self: &Context, name: &string): string
```

_Undocumented._

### `Context.deleteCookie`

```milo
fn Context.deleteCookie(self: &mut Context, name: string): void
```

_Undocumented._

### `Context.header`

```milo
fn Context.header(self: &Context, name: &string): string
```

_Undocumented._

### `Context.html`

```milo
fn Context.html(self: &Context, body: string): Response
```

_Undocumented._

### `Context.json`

```milo
fn Context.json(self: &Context, body: string): Response
```

_Undocumented._

### `Context.param`

```milo
fn Context.param(self: &Context, name: &string): string
```

_Undocumented._

### `Context.query`

```milo
fn Context.query(self: &Context, name: &string): string
```

_Undocumented._

### `Context.redirect`

```milo
fn Context.redirect(self: &Context, url: string): Response
```

_Undocumented._

### `Context.setCookie`

```milo
fn Context.setCookie(self: &mut Context, name: string, value: string): void
```

_Undocumented._

### `Context.setCookieWithOptions`

```milo
fn Context.setCookieWithOptions(self: &mut Context, name: string, value: string, options: string): void
```

_Undocumented._

### `Context.setHeader`

```milo
fn Context.setHeader(self: &mut Context, name: string, value: string): void
```

_Undocumented._

### `Context.setStatus`

```milo
fn Context.setStatus(self: &mut Context, code: i32): void
```

_Undocumented._

### `Context.text`

```milo
fn Context.text(self: &Context, body: string): Response
```

_Undocumented._

### `Router.addRoute`

```milo
fn Router.addRoute(self: &mut Router, method: string, pattern: string, h: (&mut Context) => Response): void
```

_Undocumented._

### `Router.all`

```milo
fn Router.all(self: &mut Router, pattern: string, h: (&mut Context) => Response): void
```

_Undocumented._

### `Router.delete`

```milo
fn Router.delete(self: &mut Router, pattern: string, h: (&mut Context) => Response): void
```

_Undocumented._

### `Router.get`

```milo
fn Router.get(self: &mut Router, pattern: string, h: (&mut Context) => Response): void
```

_Undocumented._

### `Router.handle`

```milo
fn Router.handle(self: &Router, req: Request): HandledResponse
```

_Undocumented._

### `Router.new`

```milo
fn Router.new(): Router
```

_Undocumented._

### `Router.post`

```milo
fn Router.post(self: &mut Router, pattern: string, h: (&mut Context) => Response): void
```

_Undocumented._

### `Router.put`

```milo
fn Router.put(self: &mut Router, pattern: string, h: (&mut Context) => Response): void
```

_Undocumented._

### `Router.use`

```milo
fn Router.use(self: &mut Router, mw: (&mut Context, (&mut Context) => Response) => Response): void
```

_Undocumented._

### `serve`

```milo
pub fn serve(port: u16?, handler: (&Request) => Response): Result<Unit>
```

_Undocumented._

### `serveRouter`

```milo
pub fn serveRouter(port: u16?, router: &Router): Result<Unit>
```

Start an HTTP server using a Router (headers from Context are sent on the wire).

### `statusText`

```milo
pub fn statusText(status: i32): string
```

_Undocumented._
