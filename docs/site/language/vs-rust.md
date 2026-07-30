# Memory Safety vs Rust

Where each language catches a problem. Every row is a probe built [in both
languages](https://github.com/milo-language/milo/tree/main/rust-comparison) or
kept as a Milo regression fixture. `unsafe` and FFI are trust boundaries in both.

| | Rust | Milo | |
|---|---|---|---|
| Use-after-move, double free | compile time | compile time | even |
| Use-after-free, owned data | compile time | compile time | even |
| Returning a reference to a local | compile time | compile time | even |
| Null dereference | can't express | can't express | even |
| Iterator invalidation | compile time | compile time | even |
| `&mut` aliasing `&` | compile time | compile time | even |
| Out-of-bounds index | runtime | runtime | even |
| Divide by zero, `INT_MIN / -1` | runtime | runtime | even |
| Use-after-free through cyclic data | runtime | runtime | even |
| Integer overflow | runtime, debug builds only | runtime, every build | Milo ahead |
| Contracts: `requires` / `ensures` / `invariant` | runtime, unstable | compile time | Milo ahead |
| Reference stored in a struct | compile time | can't express | Rust ahead |
| Zero-copy view tied to its buffer | compile time | can't express | Rust ahead |

The two Rust-ahead rows are the same trade: no lifetimes, so a view can't be tied
to the buffer it points into — own the buffer and carry an offset instead. See
[Ownership](/language/ownership).

Milo's prover decides linear integer arithmetic; bitwise operations, collection
lengths, and recursion come back `unknown` and fall back to runtime asserts. See
[Contracts & Safety](/language/safety).
