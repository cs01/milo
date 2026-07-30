# std/url

URL parsing and manipulation.

```milo
from "std/url" import { Url }
```

## Types

### Url

```milo
struct Url {
    scheme: string,
    host: string,
    port: i32,
    path: string,
    query: string,
    fragment: string,
    raw: string,
}
```

A parsed URL with its components.

## Functions

### Url.parse

```milo
fn Url.parse(input: string): Result<Url>
```

Parses a URL string into its components.

### urlQueryGet

```milo
fn urlQueryGet(url: &Url, key: &string): Option<string>
```

Extracts a query parameter value by key.

### urlString

```milo
fn urlString(url: &Url): string
```

Reconstructs the URL as a string.

## Example

```milo
let url = Url.parse("https://example.com:8080/api?name=milo&v=1#top")!
print(url.scheme)  // https
print(url.host)    // example.com
print(url.port)    // 8080

match urlQueryGet(&url, &"name") {
    Some(val) => print(val)  // milo
    None => {}
}
```
