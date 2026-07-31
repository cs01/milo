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
| Contracts: `requires` / `ensures` / `invariant` | runtime, unstable | [compile time](/language/safety), for linear arithmetic | Milo ahead |
| Reference stored in a struct | compile time | can't express | Rust ahead |
| Zero-copy view tied to its buffer | compile time | can't express | Rust ahead |

The two Rust-ahead rows are the same trade: no lifetimes, so a view can't be tied
to the buffer it points into — own the buffer and carry an offset instead. That
cost lands on one shape only — an acyclic borrow into stable storage, which is
exactly what `'a` exists for. It does not land on cyclic data: a lifetime cannot
describe a cycle either, so Rust reaches for the same generational handles
there, which is why that row is even. See [Ownership](/language/ownership) and
[Patterns Without Lifetimes](/language/patterns) for what to write instead.

Second-class references — you cannot store one in a struct or a collection, and
the only thing you can return is a view of a receiver's own data — mean nothing
in the heap is ever aliased, which keeps both the mental model and the compiler
drastically simpler.

## What large Rust codebases actually do

The rows above are a claim about a language. The more interesting question is what
people write when they have lifetimes available and a real system to ship. Two
large Rust codebases, counted directly:

| | [Bun](https://github.com/oven-sh/bun) `src/` | [Linux](https://github.com/torvalds/linux) `rust/` |
|---|---|---|
| Rust LOC | 1,036,969 | 152,140 |
| Types carrying a lifetime param | 767 | 119 |
| `Rc<` / `Arc<` (+ kernel `ARef<`) | 159 | 144 + 123 |
| `unsafe` | 13,915 | 3,453 |

*(Counted 2026-07-30 with `rg`; Bun at `10ff028898`, Linux at `master`. Reproduce:
`rg -o "^\s*(pub(\([^)]*\))? )?(struct|enum) \w+<'" -g '*.rs'`.)*

Two things stand out.

**Lifetime-carrying types are rare, and thin where they exist.** Both sit near
0.8 per thousand lines. Bun's AST — the hottest data structure in a bundler, the
exact place `'a` is supposed to pay off — is 20,153 lines with **8** lifetime-carrying
types, because the AST is arena-allocated (`bun_alloc::Arena`, recycled per thread)
and nodes refer to each other by index. That is the arena-plus-handle pattern
Milo makes the default, hand-built in a language that offered the alternative.

**Runtime-checked lookup is not a concession — it is kernel idiom.** A file
descriptor is an integer index into a per-process table, validated on every use.
In the kernel's own Rust that is literally:

```rust
// rust/kernel/fs/file.rs
pub fn fget(fd: u32) -> Result<ARef<LocalFile>, BadFdError>
```

A stale or bogus index returns an error, at runtime — which is what
`arena.get(h)` returning `Option<&T>` on a dead handle does. There are 395
`-> Option<...>` returns across the kernel's Rust tree, plus its own `XArray` and
`IDR` index-to-object maps. What kernels forbid is not the check but the
*unrecoverable* failure: Rust-for-Linux bans panics, makes every allocation
fallible, and requires the caller to handle every lookup. Rust's panicking `Vec`
index is the thing that had to go; Milo's checked handle is the thing that stayed.

Where the evidence cuts the other way, it is worth saying plainly: the kernel
carries roughly **eleven times** Bun's density of refcounted shared ownership
(1.8 vs 0.15 per thousand lines), because kernel objects — files, inodes, devices
— are refcounted by design in the C they mirror. Value semantics fights that
model harder than lifetimes ever did. See
[Kernel feasibility](https://github.com/milo-language/milo/blob/main/docs/kernel-feasibility.md)
for the honest gap list.
