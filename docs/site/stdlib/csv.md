# std/csv

CSV parsing and stringification.

```milo
from "std/csv" import { Csv }
```

## Functions

### Csv.parse

```milo
fn Csv.parse(input: &string): Vec<Vec<string>>
```

Parses a CSV string into a 2D vector of strings (rows of fields).

```milo
let rows = Csv.parse(&data)
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
