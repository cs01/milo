# std/sync

## std/sync

### `AtomicBool.clone`

```milo
fn AtomicBool.clone(self: &AtomicBool): AtomicBool
```

Share this atomic with another owner; freed when the last owner drops.

### `AtomicBool.load`

```milo
fn AtomicBool.load(self: &AtomicBool): bool
```

_Undocumented._

### `AtomicBool.new`

```milo
fn AtomicBool.new(initial: bool): AtomicBool
```

_Undocumented._

### `AtomicBool.store`

```milo
fn AtomicBool.store(self: &AtomicBool, val: bool): void
```

_Undocumented._

### `AtomicBool.swap`

```milo
fn AtomicBool.swap(self: &AtomicBool, val: bool): bool
```

_Undocumented._

### `AtomicI64.add`

```milo
fn AtomicI64.add(self: &AtomicI64, val: i64): i64
```

_Undocumented._

### `AtomicI64.cas`

```milo
fn AtomicI64.cas(self: &AtomicI64, expected: i64, desired: i64): i64
```

_Undocumented._

### `AtomicI64.clone`

```milo
fn AtomicI64.clone(self: &AtomicI64): AtomicI64
```

Share this atomic with another owner (e.g. a spawned task). Each clone must be
dropped exactly once; the underlying storage is freed when the last owner drops.

### `AtomicI64.load`

```milo
fn AtomicI64.load(self: &AtomicI64): i64
```

_Undocumented._

### `AtomicI64.new`

```milo
fn AtomicI64.new(initial: i64): AtomicI64
```

_Undocumented._

### `AtomicI64.store`

```milo
fn AtomicI64.store(self: &AtomicI64, val: i64): void
```

_Undocumented._

### `AtomicI64.sub`

```milo
fn AtomicI64.sub(self: &AtomicI64, val: i64): i64
```

_Undocumented._

### `Channel.clone`

```milo
fn Channel.clone(self: &Channel): Channel<T>
```

Share this channel with another owner (a spawned producer/consumer). Each clone
must be dropped exactly once; the queue is torn down when the last owner drops.
send/recv take &Self, so a handle only needs cloning when moved into a task while
the parent still uses it.

### `Channel.close`

```milo
fn Channel.close(self: &Channel): void
```

Signal no more values will be sent. Pending items are still delivered.

### `Channel.len`

```milo
fn Channel.len(self: &Channel): i64
```

_Undocumented._

### `Channel.new`

```milo
fn Channel.new(capacity: i64): Result<Channel<T>>
```

_Undocumented._

### `Channel.next`

```milo
fn Channel.next(self: &mut Channel): Option<T>
```

Iterator protocol — enables `for val in channel { ... }`
Uses match, not let-else: std must stay within the subset milo-self parses
(src-milo has no let-else yet), or self-host can't compile std.

### `Channel.rawPtr`

```milo
fn Channel.rawPtr(self: &Channel): *u8
```

Raw ChannelInner pointer, for std/select arm hooks (channelArm*).

### `Channel.recv`

```milo
fn Channel.recv(self: &Channel): Result<T>
```

_Undocumented._

### `Channel.send`

```milo
fn Channel.send(self: &Channel, val: T): Result<i32>
```

_Undocumented._

### `Channel.tryRecv`

```milo
fn Channel.tryRecv(self: &Channel): Option<T>
```

_Undocumented._

### `Channel.trySend`

```milo
fn Channel.trySend(self: &Channel, val: T): bool
```

_Undocumented._

### `ChannelHandle.retain`

```milo
fn ChannelHandle.retain(self: &ChannelHandle): ChannelHandle
```

_Undocumented._

### `WaitGroup.add`

```milo
fn WaitGroup.add(self: &WaitGroup, n: i64): void
```

_Undocumented._

### `WaitGroup.clone`

```milo
fn WaitGroup.clone(self: &WaitGroup): WaitGroup
```

Share this WaitGroup with another owner (e.g. a worker task); freed when the
last owner drops. add/done/wait take &Self, so most uses need no clone.

### `WaitGroup.done`

```milo
fn WaitGroup.done(self: &WaitGroup): void
```

_Undocumented._

### `WaitGroup.new`

```milo
fn WaitGroup.new(): WaitGroup
```

_Undocumented._

### `WaitGroup.wait`

```milo
fn WaitGroup.wait(self: &WaitGroup): void
```

_Undocumented._
