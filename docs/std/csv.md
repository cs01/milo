# std/csv

## std/csv

### `Csv.parse`

```milo
fn Csv.parse(input: &string): Vec<Vec<string>>
```

_Undocumented._

### `Csv.stringify`

```milo
fn Csv.stringify(rows: &Vec<Vec<string>>): string
```

_Undocumented._

### `csvParse`

```milo
fn csvParse(input: &string): Vec<Vec<string>>
```

Parse a CSV string into a Vec of rows, each row a Vec of fields.

### `csvQuoteField`

```milo
fn csvQuoteField(val: &string): string
```

Quote a field if it contains commas, quotes, or newlines.

### `csvStringify`

```milo
fn csvStringify(rows: &Vec<Vec<string>>): string
```

Serialize rows to a CSV string.
