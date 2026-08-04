# std/csv

CSV parsing and stringification.

```milo
from "std/csv" import { Csv }
```

## Functions

### Csv.parse

```milo
fn Csv.parse(input: &string): Result<Vec<Vec<string>>>
```

Parses a CSV string into a 2D vector of strings (rows of fields).

Strict about quoting, because every quoting mistake silently moves the field boundaries. An unterminated quoted field, a bare `"` inside an unquoted field, and text after a field's closing quote are each an `Err` naming the byte offset.

Ragged row widths are **not** an error. A ragged file still parsed unambiguously; the width a caller expects is schema policy, and this parser has no header or schema concept to check it against. Indexing past a short row is a bounds check, which fails loudly on its own.

A lone `\r` outside a quoted field is dropped, so CRLF files parse; inside a quoted field it is data and is kept.

```milo
let rows = Csv.parse(data)!
for row in rows {
    let name = row[0]
    let age = row[1]
    print(name + " is " + age)
}
```

### Csv.stringify

```milo
fn Csv.stringify(rows: &Vec<Vec<string>>): string
```

Serializes a 2D vector of strings back into CSV format.
