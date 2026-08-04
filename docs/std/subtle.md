# std/subtle

## std/subtle

### `constantTimeEq`

```milo
pub fn constantTimeEq(a: &string, b: &string): bool
```

Byte-for-byte equality whose running time depends only on the *lengths* of the
inputs, never on their contents: every byte of both buffers is read and folded
into one accumulator, with no early exit.

Lengths are treated as public — a length mismatch returns false immediately,
because MAC and digest lengths are fixed by the algorithm and known to the
attacker anyway. Do not use this to compare values whose length is itself the
secret.
