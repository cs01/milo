# C FFI

Call any C library by declaring external functions.

```milo
extern fn puts(s: *u8): i32
extern fn printf(fmt: *u8, ...): i32
extern fn sqrt(x: f64): f64
extern fn malloc(size: u64): *u8
```

## Safe and unsafe calls

An extern call is not automatically unsafe. The compiler decides from the types:

**Safe** — no `unsafe` needed:

- every pointer parameter gets an auto-coerced argument (`string`→`*u8`, `[T;N]`→`*T`, matching `*T`→`*T`)
- a function-typed parameter gets a matching Milo function
- a by-value `extern struct` argument
- the return type is scalar, `void`, or a by-value `extern struct`

**Unsafe** — the return is a pointer (unknown provenance), or a parameter takes a raw `*T` that didn't come from coercion.

```milo
extern fn puts(s: *u8): i32
extern fn malloc(size: u64): *u8

fn main(): i32 {
    puts("Hello from C!")             // safe — string coerces to *u8, returns i32
    unsafe { let p = malloc(64) }     // unsafe — returns *u8
    return 0
}
```

`string.cstr()` and `vec.ptr()` hand out a data pointer without `unsafe` — the owner stays alive in the caller. `x.addrOf()` takes the address of any lvalue and does require `unsafe`.

## Linking a library

`@link` adds the `-l` flag, so the declaration and the link requirement live together:

```milo
@link("SDL2")
extern fn SDL_Init(flags: u32): i32
```

## Verifying declarations against C

An `extern fn` or `extern struct` is a **claim** about C, and C linkage has no mangling to check it against. A wrong parameter type, a wrong arity, or a field at the wrong offset links fine and corrupts silently at the ABI seam. `unsafe` does not help — it tracks provenance, not layout.

Milo verifies these claims at build time against the real headers.

### `@cSig` — check a function signature

```milo
@cSig("unistd.h", "long sysconf(int)")
extern fn sysconf(name: i32): i64
```

The compiler generates a throwaway C translation unit that includes the header, compiles it, and discards it. It checks two independent claims and reports which one broke:

1. the stated signature really is what the header declares (via `__builtin_types_compatible_p`)
2. the Milo return type's width and signedness match that C return type

```
error[c-decl]: a declaration does not match the C header it claims to describe
  sysconf: Milo declares a 4-byte return, C returns a different width
```

**Why you write the C signature instead of the compiler deriving it:** Milo's type system can't express C type identity. `i64` is a 64-bit integer, but C distinguishes `long` from `long long` — on macOS `int64_t` *is* `long long`, so a derived declaration would reject the correct `sysconf` above. The signature says which C type is meant.

Write it exactly as the header spells it, pointers included (`"ssize_t read(int, void *, size_t)"`) — that is what makes pointer-taking functions checkable at all.

**Parameter mapping is not checked.** Introspecting a C function type's parameters needs a C parser; only arity and the return type are verified.

### `@cLayout` — check a struct layout

The compiler believes a declared layout and computes field offsets from it, so a field that disagrees with the real header reads its neighbour and returns plausible garbage — no crash, no diagnostic. `@cLayout(cType, header)` compiles a translation unit of `_Static_assert`s against the real header instead:

```milo
@cLayout("struct timespec", "time.h")
extern struct Timespec {
    tv_sec: i64,
    tv_nsec: i64,
}
```

```
error[c-layout]: an extern struct's declared layout does not match the C header
  Timespec.tv_sec: Milo says offset 0, C header disagrees
```

Every field is checked for both its offset and its own size — offsets alone miss a wrong width on the last field, and elsewhere a too-narrow field can hide inside the next field's padding. Milo field names are used as the C field names. If the layout ever drifts from an OS update or a new architecture, the **build breaks** instead of the program lying.

Declaring only a **prefix** of a C struct is supported and common: total size is checked with `>=`, not `==`, so you can stop early and ignore trailing platform fields. Field *order* must still match from the start. Mark a field `@cOpaque` to exclude it — filler with no C counterpart.

### Finding what isn't verified

Both annotations are opt-in, so an unannotated `extern struct` looks exactly like a verified one. `--deny=unverified-extern` turns that into an error:

```
error: extern struct 'Stat' has no @cLayout — its layout is an unverified claim about C
```

It's off by default on purpose: an `extern struct` paired with a local `.c` file has no header to name, a legitimate shape `@cLayout` can't express. Turn it on for a project where every layout should be pinned to a real header. It only reports structs in the file being compiled — a struct inside a library you imported isn't yours to annotate.

Both checks are skipped for bare-metal targets, which are freestanding and cross-compiled — the host's headers aren't the ones the program runs against. On a cross-compile with a sysroot (`MILO_WINDOWS_SDK`), they *do* run, against the target's headers.

## Platform-specific declarations

There is no `#[cfg]` or `#ifdef`. Two mechanisms, for two different situations.

**A C declaration that differs by platform** goes in a filename split. The resolver picks the arm matching the target OS:

```
std/platform.darwin.milo
std/platform.linux.milo
std/platform.windows.milo
```

The filename states which C library is being described, so the claim inside it is unconditionally true — Windows spells POSIX `read` as `_read` and returns `int` where POSIX returns `ssize_t`, which is two declarations in two files, not one annotation with an escape hatch. Every arm must export the *same* surface: a name only some platforms can provide still has to exist on all of them, failing loudly (a link error naming the symbol, or an explicit abort) rather than returning a plausible-looking value.

**Application code that has no such split** branches on `@targetOs()`, a compile-time constant that is `"darwin"`, `"linux"`, or `"windows"`:

```milo
let devNull = if @targetOs() == "windows" { "NUL" } else { "/dev/null" }
```

Both arms are type-checked, but the compiler folds the condition and keeps only the taken arm — the other is never lowered or code-generated. So the dead branch may reference symbols that exist on no other platform:

```milo
// Declared everywhere, linked only on Windows. The dead branch is folded out
// before codegen elsewhere, so the reference never reaches the linker there.
extern fn startWinsock(): void

fn main(): i32 {
    if @targetOs() == "windows" {
        startWinsock()
    }
    return 0
}
```

The fold triggers on any statically-known condition — `@targetOs()` compared with a string literal, and `!`/`&&`/`||` over such comparisons.

## Opaque foreign types

`extern type` declares a type with no known size or layout. It can only exist behind a pointer:

```milo
extern type sqlite3
extern type sqlite3_stmt

extern fn sqlite3_open(path: *u8, db: **sqlite3): i32
extern fn sqlite3_close(db: *sqlite3): i32
```

Using one by value is a compile error. `*sqlite3` is a distinct type from `*sqlite3_stmt` and from `*u8`, so handle mixups are caught at compile time.

## Structs by value

An `extern struct` may cross the C ABI by value, as an argument and as a return value. The compiler classifies each struct per the platform ABI (AAPCS64 on ARM64, System V on x86-64): small structs are coerced into registers, homogeneous-float structs go in SIMD/SSE registers, larger ones pass indirectly (`byval`) and return through a hidden pointer (`sret`). The lowering matches what clang emits.

```milo
extern struct Vec2 { x: f64, y: f64 }

extern fn vec2_add(a: Vec2, b: Vec2): Vec2

fn main(): i32 {
    let c = vec2_add(Vec2 { x: 1.0, y: 2.0 }, Vec2 { x: 3.0, y: 4.0 })
    print(c.x)      // safe — no unsafe needed
    return 0
}
```

Only an `extern struct` may cross by value, and its fields must be C-representable: integers, floats, `bool`, pointers, nested extern structs, and fixed arrays of those. `string`, `Vec`, and enums are rejected — every extern struct is plain-old-data, so passing one leaves the original usable. Not supported (pass `&T` instead): a struct in a variadic position, an `enum` crossing the ABI, a function-pointer parameter that itself passes a struct by value, and struct-by-value on bare-metal ARM.

## Typed function pointers

Extern functions can declare function-typed parameters. Passing a matching Milo function needs no cast:

```milo
extern fn qsort(base: *u8, num: i64, size: i64, cmp: (*u8, *u8) => i32): void

fn cmpI32(a: *u8, b: *u8): i32 {
    unsafe { return *(a as *i32) - *(b as *i32) }
}

fn main(): i32 {
    var arr: [i32; 5] = [50, 10, 99, 30, 70]
    unsafe { qsort(arr[0].addrOf() as *u8, 5, 4, cmpI32) }
    return 0
}
```

## Calling Milo from C

`build-lib` writes a companion C header next to the archive:

```bash
milo build-lib mathlib.milo -o libmathlib.a    # also writes libmathlib.h
milo emit-obj mathlib.milo --emit-header       # writes mathlib.h next to mathlib.o
```

The header declares the exported functions and the extern structs; opaque `extern type` declarations become forward `typedef struct X X;`. Anything without a stable C spelling — a `Vec`, `String`, or enum in a signature — is emitted as a `/* skipped: ... */` comment, so the header stays valid and the gap stays visible.
