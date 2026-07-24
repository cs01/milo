# Annotations and Compiler Builtins

`@` marks something the compiler handles, not the runtime. It is the whole mechanism —
there is no preprocessor, no `#[cfg]`, no macro system. Everything spelled with an `@`
is one of the seven constructs below.

| Construct | Goes on | What it does |
|---|---|---|
| `@embedFile(path)` | expression | Inlines a file's contents as a string at compile time |
| `@targetOs()` | expression | The OS being compiled for, as a string |
| `@derive(Eq)` | struct | Generates field-by-field `==` and `!=` |
| `@link(lib)` | `extern fn` | Links against a native library |
| `@export` | `fn` | Forces external linkage |
| `@cSig(header, sig)` | `extern fn` | Verifies the signature against a C header |
| `@cLayout(cType, header)` | `extern struct` | Verifies field offsets against a C header |
| `@cOpaque` | struct field | Marks filler with no C counterpart, so `@cLayout` skips it |

Two of these are **builtins** — they appear where a value does, and evaluate while
compiling. The rest are **attributes** — they sit above a declaration.

An unknown attribute is an error, never a silent no-op. So is an attribute on the wrong
kind of declaration: `@cLayout` on a non-extern struct, `@link` on a regular `fn`, or
`@export` on an `extern fn` (which declares a function defined elsewhere, so there is
nothing there to export).

## Compile-time builtins

Both builtins also work without the `@`, but warn (`bare-embedfile`, `bare-targetos`) —
the sigil is what tells a reader the call never happens at runtime.

### `@embedFile(path)`

```milo
let html = @embedFile("index.html")
```

The argument must be a string literal, and the path resolves relative to the file
containing the call. Contents are read as raw bytes, so binary assets embed intact.

### `@targetOs()`

A constant that is `"darwin"`, `"linux"`, or `"windows"`:

```milo
let devNull = if @targetOs() == "windows" { "NUL" } else { "/dev/null" }
```

Both arms of the `if` are type-checked, but the compiler evaluates the condition and
keeps only the taken arm — the other is never lowered or code-generated. That means the
dead branch may reference symbols that exist on no other platform, such as a Windows-only
extern, without breaking the build anywhere else. The fold triggers on any statically
known condition: `@targetOs()` compared with a string literal, and `!`, `&&`, `||` over
such comparisons.

For a *C declaration* that differs by platform, prefer the stdlib filename split over
`@targetOs()` — see [C FFI](./ffi#platform-specific-declarations).

## Code generation

### `@derive(Eq)`

```milo
@derive(Eq)
struct Point { x: i32, y: i32 }

print(Point { x: 1, y: 2 } == Point { x: 1, y: 2 })   // true
```

`Eq` is the only derivable trait. Every field must itself implement `Eq`. Other
operators are implemented by hand — see [Traits](./traits) for overloading `Add`, `Sub`,
`Mul`, and `Div`.

## Linkage

### `@link(lib)`

Adds the `-l` flag, so the declaration and its link requirement stay together:

```milo
@link("SDL2")
extern fn SDL_Init(flags: u32): i32
```

### `@export`

Forces external linkage on a function the compiler would otherwise see as unreachable
and drop. Needed when the only caller is outside the program — a `dlopen`'d library
resolving a symbol back against this executable, for instance, which no reachability
analysis can see.

```milo
@export
pub fn pluginEntry(): i32 { return 7 }
```

## Verifying claims about C

`extern` declarations are claims about a C library, and C linkage has no mangling to
check them against — a wrong return width or a field at the wrong offset links fine and
corrupts silently. These three annotations make the **build** check the claim against the
real headers.

```milo
@cSig("unistd.h", "long sysconf(int)")
extern fn sysconf(name: i32): i64

@cLayout("struct timespec", "time.h")
extern struct Timespec {
    tv_sec: i64,
    tv_nsec: i64,
}
```

The full rules — what is and isn't checked, prefix structs, `@cOpaque`, cross-compiles,
and `--deny=unverified-extern` for finding declarations nobody annotated — are in
[C FFI](./ffi#verifying-declarations-against-c).

Note that the C checks run when a program is actually built (`milo build`, `milo run`,
`milo build-lib`). `milo emit-ir` stops before that step and does not run them.

## Not annotations

Contract clauses — `requires`, `ensures`, `invariant` — are ordinary keywords in the
declaration, not `@` annotations, because they are type-checked expressions rather than
instructions to the compiler. See [Contracts & Safety](./safety).

Next: [C FFI →](./ffi)
