# std/set

Hash set collection for unique values. Method-based on the `HashSet<T>` value.

```milo
from "std/set" import { HashSet }
```

## Types

### HashSet

```milo
struct HashSet<T>
```

An unordered collection of unique values.

## Constructor

### `HashSet<T>.new`

```milo
fn new(): HashSet<T>
```

Empty hash set. Generic statics take a turbofish: `HashSet<string>.new()`.

## Methods

### `s.add`

```milo
fn add(self: &mut HashSet<T>, val: T): void
```

Inserts `val`. No-op if already present.

### `s.contains`

```milo
fn contains(self: &HashSet<T>, val: T): bool
```

True if the set contains `val`.

### `s.remove`

```milo
fn remove(self: &mut HashSet<T>, val: T): void
```

Removes `val` if present.

### `s.len`

```milo
fn len(self: &HashSet<T>): i64
```

Number of elements.

## Example

```milo
var seen = HashSet<string>.new()
seen.add("alice")
seen.add("bob")
seen.add("alice")  // no-op
print(intToString(seen.len()))  // 2
```
