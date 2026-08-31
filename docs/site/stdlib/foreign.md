# std/foreign

`withRaw` turns a `(pointer, length)` pair from C into a real `&[T]`, for as long as one closure call, and never a moment longer. `adopt` does the other half: it turns a pointer to a Milo allocation back into an owned `Heap<T>` whose drop frees it.

Every other safety mechanism in Milo works by being the allocator. `seal` consumes a buffer and offers no mutating method; `Arena.freeze` consumes an arena and removes `free`; `shatter` consumes a `Vec` and hands out disjoint owned windows. At a C boundary all three preconditions are false at once: C allocated the memory, C will free it, C may write it after you return. Without this module a program crossing that seam falls back to raw pointer arithmetic and loses every guarantee at exactly the place it needs one.

What is missing there turns out to be small. The slice type already exists and is already checked. Nothing here adds a reference kind, a lifetime, or a rule. These are *constructors* for a type the language shipped with.

```milo
from "std/foreign" import { withRaw, withRawMut, adopt, adoptSlice }
```

## Quick start

```milo
from "std/foreign" import { withRaw }
from "std/os" import { malloc, free }

pub fn main(): i32 {
    unsafe {
        let p = malloc(24) as *i64
        p[0] = 10
        p[1] = 20
        p[2] = 30

        let total = withRaw(p, 3, (xs: &[i64]): i64 => xs.sum())
        print(total!)                // 60, read through a real slice, no copy

        free(p as *u8)               // the view never owned this; you still do
    }
    return 0
}
```

## Why a closure and not a returned view

`fn view(p: *T, len: i64): &[T]` is the signature you want and the one the language forbids. References in Milo are second-class: parameters only, never returned, never stored (see [Ownership & references](/language/ownership)). The rule binds harder here than anywhere else, because the compiler has no idea how long a C allocation lives, so a returned view would be a promise nobody can keep.

A closure parameter is a second-class reference in the one position the rule allows, and the view provably dies with the call. It is the shipped `arenaWith` shape aimed at foreign memory instead of an arena, which is why it needs no new rule.

The view cannot be smuggled out through the closure's return type either. `Option<&[T]>` and `Vec<&T>` are storage holding a reference, and the checker rejects both:

```milo skip
// does not compile: cannot return a reference stored inside 'Option'
withRaw(p, 1, (xs: &[i64]): Option<&[i64]> => Option.Some(xs))
```

## The three answers

| Input | Result | `f` called? |
|---|---|---|
| null `p` | `Option.None` | no |
| negative `len` | `Option.None` | no |
| non-null `p`, `len == 0` | `Option.Some(f(<empty slice>))` | yes |

The null path is in the *return type* so it cannot be forgotten. A variant returning a bare `R` would push the test back to convention, which is the thing being fixed. A negative length takes the same path deliberately: the alternative is a view whose length field is nonsense, and every later bounds check would read as satisfied.

`len == 0` over a non-null pointer is defined, not a special case: the closure runs and sees an empty slice.

## Writing through the view

`withRawMut` gives `&mut [T]`. The writes land in the original memory, because the slice is a view and not a copy:

```milo
from "std/foreign" import { withRawMut }
from "std/os" import { malloc, free }

pub fn main(): i32 {
    unsafe {
        let p = malloc(24) as *i64
        withRawMut(p, 3, (xs: &mut [i64]): i64 => {
            xs[0] = 5
            xs[1] = 6
            xs[2] = 7
            return 0
        })
        print(p[0], " ", p[1], " ", p[2])     // 5 6 7
        free(p as *u8)
    }
    return 0
}
```

What this does **not** cover is a C `(ptr, count)` pair whose owner reallocates or frees on append. That is not a view of anything stable, and no view primitive in any language makes it safe. Keep those on `realloc`/`free` inside `unsafe`.

## The view never owns the memory

The slice is built with capacity 0, the same marker every non-owning slice in the language already carries. Three things hold it there: a value typed `&[T]` gets no drop glue at all, the read-only slice method set has no `push`/`insert`/`extend`/`reserve` so nothing can reach a reallocating path, and capacity 0 is what `extend` reads when deciding whether to free a source buffer. Freeing the buffer yourself after the call is correct and is not a double free.

## What `unsafe` is carrying

Both functions are declared `@unsafe`, so calling one requires an `unsafe` block. The obligation is precise, and it is the whole content of the word here: **`p` addresses `len` initialized, correctly aligned `T`, and nothing else writes them while `f` runs.**

Neither Milo nor Rust proves that. Rust's `slice::from_raw_parts_mut` carries an identical unchecked no-alias clause. Both languages record it in the contract of one reviewed primitive, which is what this module is.

Note why the attribute has to exist: every other unsafe rule in the language triggers on an *operation* (a deref, a pointer cast). `withRaw`'s body is nothing but a null test and a slice construction, both individually checkable, and `withRaw(v.ptr(), 1000000, f)` would still be safe-looking Milo. `@unsafe` puts the obligation where the knowledge is.

## Taking ownership back: `adopt`

`withRaw` borrows. `adopt` owns.

`forget(x)` is the give direction, and it has shipped for a long time: it ends a value's ownership without running its drop, for the seam where ownership leaves through a pointer the checker cannot see. Nothing took it back. So a library that allocated a struct in Milo, handed C the pointer, and later got it returned had no way to free it, which is the shape of every C-ABI close or destroy entry point.

`adopt(p)` is that return trip. The `Heap<T>` it hands back is owned in full: it drops at the end of its scope, that drop frees the allocation, and the move checker treats it exactly as it treats a `Heap<T>` from `Heap(value)`. `adoptSlice(p, len)` does the same for a contiguous run, handing back a `Vec<T>` that reads, iterates and grows.

```milo
from "std/foreign" import { adopt }

struct Thing {
    n: i64,
}

@externalLinkage
pub fn closeThing(p: *Thing): i32 {
    unsafe {
        match adopt(p) {
            Option.Some(thing) => {
                print((*thing).n)
                return 0            // thing drops here, freeing the allocation
            }
            Option.None => {
                return -1           // p was null; there is nothing to free
            }
        }
    }
}
```

The answers match `withRaw`'s: `Option.None` iff `p` is null, and for `adoptSlice` also when `len` is negative. `len == 0` over a non-null pointer is an owned, empty `Vec` that still frees `p` when it drops.

The allocator underneath is plain libc `malloc`/`free` (`Heap(v)` is one `malloc` and a store, every `Vec` buffer goes through one `malloc`, and the drop glue calls `free`), so the round trip is symmetric. A pointer Milo allocated can go to C's `free`, and a pointer C `malloc`'d can be adopted, provided it really is a `T`.

### What `unsafe` is carrying here

`adopt` is `@unsafe` for a sharper reason than `withRaw` is. The caller asserts that `p` came from a Milo allocation of a `T` with this exact layout, that nothing else aliases it, and that **it has not been adopted before**. Adopting the same pointer twice hands out two owners of one allocation, and the second drop is a double free. There is no runtime tag that could catch it: a pointer that never passed through Milo's own bookkeeping cannot carry one.

`forget` needs no `unsafe` because leaking is safe. `adopt` does, because un-leaking is not.

### What it does not reach

An `extern struct` whose fields are raw pointers owns none of them. A raw pointer has no drop glue, so dropping an adopted `Heap<T>` frees **the struct and nothing it points at**. That is correct: it is what makes the layout an ABI match. But a C-shaped object graph still needs an explicit teardown that walks the raw fields and frees them before the adopted box drops.

There is also no clean way yet to get the pointer *out* of a `Heap<T>` for the give direction: `Vec` has `.ptr()`, `Heap` has no equivalent, and `h.addrOf()` is the address of the slot rather than the box.

## API

| Function | Description |
|---|---|
| `withRaw<T, R>(p: *T, len: i64, f: (&[T]) => R): Option<R>` | Call `f` with a read-only view of `len` elements at `p` |
| `withRawMut<T, R>(p: *T, len: i64, f: (&mut [T]) => R): Option<R>` | The same, with a mutable view; writes land in the original memory |
| `adopt<T>(p: *T): Option<Heap<T>>` | Take ownership of a Milo allocation back through a raw pointer; the result's drop frees it |
| `adoptSlice<T>(p: *T, len: i64): Option<Vec<T>>` | The same for `len` contiguous elements, handing back an owned `Vec<T>` |

## See also

- [std/seal](/stdlib/seal): zero-copy over a buffer you *do* own
- [std/shard](/stdlib/shard): disjoint owned windows into one `Vec`
- [Ownership & references](/language/ownership): why references are second-class
