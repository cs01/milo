# std/arena

## std/arena

### `Arena.alloc`

```milo
fn Arena.alloc(self: &mut Arena, val: T): Handle<T>
```

_Undocumented._

### `Arena.clear`

```milo
fn Arena.clear(self: &mut Arena)
```

_Undocumented._

### `Arena.free`

```milo
fn Arena.free(self: &mut Arena, h: Handle<T>): bool
```

_Undocumented._

### `Arena.get`

```milo
fn Arena.get(self: &Arena, h: Handle<T>): Option<T>
```

_Undocumented._

### `Arena.handles`

```milo
fn Arena.handles(self: &Arena): Vec<Handle<T>>
```

_Undocumented._

### `Arena.len`

```milo
fn Arena.len(self: &Arena): i64
```

_Undocumented._

### `Arena.modify`

```milo
fn Arena.modify(self: &mut Arena, h: Handle<T>, f: (T) => T): bool
```

_Undocumented._

### `Arena.modifyMut`

```milo
fn Arena.modifyMut(self: &mut Arena, h: Handle<T>, f: (&mut T) => void): bool
```

_Undocumented._

### `Arena.new`

```milo
fn Arena.new(): Arena<T>
```

_Undocumented._

### `Arena.set`

```milo
fn Arena.set(self: &mut Arena, h: Handle<T>, val: T): bool
```

_Undocumented._

### `Arena.valid`

```milo
fn Arena.valid(self: &Arena, h: Handle<T>): bool
```

_Undocumented._

### `arenaAlloc`

```milo
pub fn arenaAlloc<T>(a: &mut Arena<T>, val: T): Handle<T>
```

Insert a value and return a handle to it.

### `arenaClear`

```milo
pub fn arenaClear<T>(a: &mut Arena<T>)
```

Drop every value and release the backing storage in one go. Per-slot free()
recycles a slot but never shrinks the arena, so a long-lived arena sits at its
peak footprint forever; clear is the bulk-reset escape from that.

Every outstanding handle goes stale because the arena takes a fresh identity —
a pre-clear handle fails the arenaId check outright. Restarting generations at
1 on a recycled Vec would otherwise let an old handle alias a new value.

### `arenaFree`

```milo
pub fn arenaFree<T>(a: &mut Arena<T>, h: Handle<T>): bool
```

Free a slot, bumping its generation so stale handles are detected. A slot at
maximum generation is retired rather than wrapped back onto an old handle.

### `arenaGet`

```milo
pub fn arenaGet<T>(a: &Arena<T>, h: Handle<T>): Option<T>
```

Get a copy of the value at a handle. Returns None if the handle is stale.
Returns by value, not &T, because second-class refs cannot be stored in
Option<_>. For large T, prefer arenaModify to avoid the copy churn.

### `arenaHandles`

```milo
pub fn arenaHandles<T>(arena: &Arena<T>): Vec<Handle<T>>
```

Snapshot every currently live handle. The returned handles remain ordinary
generational capabilities: later frees invalidate them, while later allocs do
not appear in this already-produced Vec. This is the safe enumeration shape
for collectors because no element reference survives into caller code.

### `arenaLen`

```milo
pub fn arenaLen<T>(a: &Arena<T>): i64
```

Number of live entries.

### `arenaModify`

```milo
pub fn arenaModify<T>(a: &mut Arena<T>, h: Handle<T>, f: (T) => T): bool
```

In-place update via closure. Avoids the manual get/modify/set dance and
is the recommended way to mutate a single field of an arena value.
Returns false if the handle is stale (closure not invoked).

### `arenaModifyMut`

```milo
pub fn arenaModifyMut<T>(a: &mut Arena<T>, h: Handle<T>, f: (&mut T) => void): bool
```

In-place mutate via &mut borrow — no copy in, no copy out, no full-struct
rewrite. Mutate fields of the live value directly inside f. Returns false
(f not called) if the handle is stale. Preferred over arenaModify when T is
large or you only touch a field or two.

### `arenaNew`

```milo
pub fn arenaNew<T>(): Arena<T>
```

Create a new empty arena.

### `arenaSet`

```milo
pub fn arenaSet<T>(a: &mut Arena<T>, h: Handle<T>, val: T): bool
```

Overwrite the value at a handle. Returns false if the handle is stale.

### `arenaValid`

```milo
pub fn arenaValid<T>(a: &Arena<T>, h: Handle<T>): bool
```

Check whether a handle is still valid.

### `arenaWith`

```milo
pub fn arenaWith<T, R>(a: &Arena<T>, h: Handle<T>, f: (&T) => R): Option<R>
```

Read via borrow — no copy. The &T flows into `f` as a second-class ref:
valid only inside the closure, never stored or returned. Returns None (and
does not call f) if the handle is stale. This is the zero-copy alternative
to arenaGet for large T — read just the field(s) you need inside f.
