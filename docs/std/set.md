# std/set

## std/set

### `HashSet.add`

```milo
fn HashSet.add(self: &mut HashSet<T>, val: T): void
```

Add a value to the set.

### `HashSet.contains`

```milo
fn HashSet.contains(self: &HashSet<T>, val: T): bool
```

Check if the set contains a value.

### `HashSet.len`

```milo
fn HashSet.len(self: &HashSet<T>): i64
```

Number of elements in the set.

### `HashSet.new`

```milo
fn HashSet.new(): HashSet<T>
```

Create an empty HashSet.

### `HashSet.remove`

```milo
fn HashSet.remove(self: &mut HashSet<T>, val: T): void
```

Remove a value from the set.
