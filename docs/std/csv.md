# std/csv

## std/csv

### `Csv.parse`

```milo
fn Csv.parse(input: &string): Result<Vec<Vec<string>>>
```

Parse CSV text into rows of fields. Errs on an unterminated quoted field, a
bare '"' inside an unquoted field, or text after a field's closing quote.
Ragged row widths are accepted — see the module comment for why.

### `Csv.stringify`

```milo
fn Csv.stringify(rows: &Vec<Vec<string>>): string
```

Serialize rows to CSV, quoting any field containing ',', '"', CR or LF.
