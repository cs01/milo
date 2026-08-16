# std/arena

## std/arena

### `Arena.alloc`

```milo
fn Arena.alloc(self: &mut Arena, val: T): Handle<T>
```

Move `val` into a free slot and return a Handle<T> naming it. Reuses a
slot from the free list when one exists, otherwise grows the arena.

### `Arena.clear`

```milo
fn Arena.clear(self: &mut Arena)
```

Drop every value and release the backing storage. The arena takes a fresh
identity, so every handle ever issued before this point is now stale.
The only operation that returns memory to the allocator.

### `Arena.free`

```milo
fn Arena.free(self: &mut Arena, h: Handle<T>): bool
```

Logically delete the slot: drop the value, bump the slot's generation so
every outstanding handle to it goes stale, and offer the index for reuse.
False if `h` was already stale — so a double free is a no-op, not a fault.
Does NOT shrink the arena, and does not chase handles held INSIDE the
freed value; a cyclic graph still needs a sweep you write.

### `Arena.get`

```milo
fn Arena.get(self: &Arena, h: Handle<T>): Option<T>
```

A COPY of the value at `h`, or None if `h` is stale.

This copies the whole T out of the slot every call — reading one field of
a large T clones the rest with it. To read without copying, use the free
function arenaWith(self, h, f), which lends `&T` to a closure:

    let n = arenaWith(a, h, (v: &Node): i64 => v.edges.len)

It has no method form because a method with its own type parameter (the
closure's return type) cannot infer it at the call site today.

### `Arena.handles`

```milo
fn Arena.handles(self: &Arena): Vec<Handle<T>>
```

A snapshot Vec of every currently live handle — the enumeration shape a
collector sweeps. Frees after this call invalidate entries in the Vec;
allocs after it do not appear in it.

### `Arena.len`

```milo
fn Arena.len(self: &Arena): i64
```

Live entries, not slots: freed slots awaiting reuse are excluded, so this
can be far below the arena's actual footprint.

### `Arena.modify`

```milo
fn Arena.modify(self: &mut Arena, h: Handle<T>, f: (T) => T): bool
```

Update the slot by mapping its value through `f`. False (and `f` not
called) if `h` is stale. Moves T out and back, so prefer modifyMut when T
is large or you touch only a field or two.

### `Arena.modifyMut`

```milo
fn Arena.modifyMut(self: &mut Arena, h: Handle<T>, f: (&mut T) => void): bool
```

Mutate the live value in place through `&mut T`. No copy in, no copy out.
False (and `f` not called) if `h` is stale. This is the write counterpart
to arenaWith and the right default for large T.

### `Arena.new`

```milo
fn Arena.new(): Arena<T>
```

A new empty arena with a fresh identity. Spell the type argument
(`Arena<Node>.new()`); a bare `Arena.new()` cannot infer T.

### `Arena.set`

```milo
fn Arena.set(self: &mut Arena, h: Handle<T>, val: T): bool
```

Replace the value at `h`. False (and no write) if `h` is stale.

### `Arena.valid`

```milo
fn Arena.valid(self: &Arena, h: Handle<T>): bool
```

Whether `h` still names a live value in THIS arena — identity and
generation both checked. A handle from another arena reads as invalid.

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
