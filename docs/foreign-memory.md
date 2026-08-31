<!-- doc-meta
system: foreign-memory
purpose: how Milo reaches memory it did not allocate, and why that needs constructors rather than new reference kinds
key-files: std/foreign.milo, src/checker.ts, src/codegen.ts, docs/ownership-model.md, docs/residue-vs-rust.md
update-when: a foreign-memory primitive is added/changed, the nullable-extern-ref spelling changes, or the giflib differential gate moves
last-verified: 2026-08-30 (features 1 and 2 built and gated; feature 3 not yet built)
-->

# Foreign memory: reaching what Milo did not allocate

Every safety mechanism in this language works by **being the allocator**. `seal` consumes a
buffer and offers no mutating method. `Arena.freeze` consumes an arena and removes `free`.
`shatter` consumes a `Vec` and hands out owned windows. Each one removes an operation from
something it owns, and the move checker proves the removal.

At a C boundary you own nothing. C allocated the memory, C will free it, C may mutate it after
you return, and the layout is fixed by a header you do not control. Every mechanism above has
its precondition falsified at once. So today a Milo program crossing that boundary falls all
the way back to raw pointers, and every guarantee the five rewrite probes established
([rewrite-findings-html5ever](rewrite-findings-html5ever.md)) evaporates at the seam.

**That is the gap this document specifies. It is not a gap in the ownership model.** The three
features below add no new reference kind, no lifetime, and no rule. Each is a *constructor* or a
*spelling* for a type that already exists:

| Feature | New type? | What it actually is |
|---|---|---|
| `withRaw` / `withRawMut` | No — `&[T]` / `&mut [T]` already exist ([language-reference](language-reference.md) §Slices, L1484) | a constructor for them from `(ptr, len)` |
| `?&mut T` | No — `&mut T` params already exist | a nullable *spelling*, legal only in an extern signature |
| `adopt` | No — `Heap<T>`/`Vec<T>` already exist | the inverse of the shipped `forget` |

## Why this is worth building: the census

Measured against `google/giflib-rs`, Google's Rust rewrite of giflib 6.1.3 — a C-ABI drop-in
whose 9 business-logic modules are `#![forbid(unsafe_code)]` and whose ~49 real unsafe sites all
live in `src/ffi.rs`, `src/c_types.rs` and one line of `src/decoder.rs`.

| Kind | Sites | Example | Covered by |
|---|---|---|---|
| A. struct field `(ptr,count)` → shared slice | 6 | `c_types.rs:68` | `withRaw` |
| B. struct field `(ptr,count)` → mut slice | 7 | `c_types.rs:73` | `withRawMut` (but see *Free is not a view*) |
| C. caller `(ptr,len)` arg → shared slice | 12 | `ffi.rs:473` | `withRaw` |
| D. caller `(ptr,len)` arg → mut slice | 5 | `ffi.rs:286` | `withRawMut` |
| E. nullable incoming struct pointer, mutated | **0 unsafe sites, 39 safe fns** | `ffi.rs:214` | **`?&mut T`** |
| F. C fn-pointer transmute/store/call | 8 | `c_types.rs:427` | nothing yet — see *Not covered* |
| G. fd adoption | 7 | `ffi.rs:79` | nothing; inherently a trust assertion in Rust too |
| H. `unsafe impl Send` | 1 | `c_types.rs:400` | n/a — Milo's move-only tasks have no `Send` |
| I. owned buffer out through a raw field | 3 | `decoder.rs:531` | shipped: `.ptr()` + `forget` |
| J. whole-object ownership back from C | 0 unsafe sites, ~10 fns | `ffi.rs:194` | **`adopt`** |

Row E is the one that decides the design. **39 of giflib-rs's 57 exported functions are
`pub extern "C" fn` — safe, zero unsafe** — against 16 `pub unsafe extern "C" fn`. That is bought
entirely by writing `Option<&mut GifFileType>` in the signature, where Rust's niche optimization
makes it ABI-identical to `GifFileType*` with a compiler-enforced null check.

A body-level view constructor cannot reach row E. The entry point would still be spelled
`*GifFileType` and the null check would be convention. Milo would carry ~39 stereotyped unsafe
sites Rust does not have, for a total worse than the C-derived Rust port. On the one metric this
whole exercise is about, Milo would lose.

## 1. `withRaw` / `withRawMut`: a view over foreign memory (**BUILT**)

```milo
// std/foreign
@unsafe fn withRaw<T, R>(p: *T, len: i64, f: (&[T]) => R): Option<R>
@unsafe fn withRawMut<T, R>(p: *T, len: i64, f: (&mut [T]) => R): Option<R>
```

Semantics:

- Returns `Option.None` **iff `p` is null**, and `f` is not called. The null path is in the
  return type, so it cannot be forgotten. A variant returning bare `R` would push the null test
  back to convention, which is the thing being fixed.
- `len == 0` with a non-null `p` calls `f` with an empty slice. Defined, not a special case.
- The caller asserts, and this is the whole content of the `unsafe`: `p` addresses `len`
  initialized, correctly aligned `T`, and nothing else writes them for the duration of `f`.
- The view cannot escape. It is a second-class `&[T]`/`&mut [T]` in parameter position, and
  `nestedRef` (`src/checker.ts:1070`) already rejects smuggling it out through `R` as storage —
  the same walk that stops `Option<&[T]>` escaping a freeze.

Why a closure rather than a returned view: returning one is what the axiom forbids. This is the
shipped `arenaWith` / `arenaModifyMut` shape (`std/arena.milo:274`) aimed at foreign memory
instead of an arena, which is why it needs no new rule.

**The aliasing assertion is not a Milo weakness.** Rust's `slice::from_raw_parts_mut` carries an
identical unchecked no-alias clause. Neither language proves it; both record it in the contract
of one reviewed primitive. State it in the doc comment and be done.

**Free is not a view (kind B).** 6 of the 7 kind-B sites in giflib-rs mint a `CSliceRefMut` whose
`clear()`/`add()` **frees or reallocs and writes the count back** (`c_types.rs:79`, the `Drop`
impl). No view primitive covers that, in any language. In Milo it stays `extern free`/`realloc`
inside `unsafe`, which Milo already has. Do not claim `withRawMut` covers kind B whole.

### What the build actually needed

Shipped in `std/foreign.milo`, with fixtures `tests/fixtures/withRaw*.milo` and rejections
`tests/errors/withRaw*.milo`, `tests/errors/rawSliceOutsideForeign.milo`. Six things the
spec above did not anticipate:

**`cap = 0`, matching every other slice constructor, but it is not what does the work.**
Read out of the emitters rather than guessed. `emitDropValue` runs no drop glue at all for a
value typed `&[T]`, because `needsDrop` is false for `array`; that is what stops a free at
scope exit, and note that the `vec` arm it skips frees on a non-null data pointer without
consulting cap. `emitVecEnsureCapacity` likewise frees the old buffer on non-null, cap
unread; a slice never reaches it because `SLICE_COMBINATORS` has no `push`/`insert`/
`extend`/`reserve`. The one emitter that reads cap to decide a free is `genVecExtend`, which
frees its source when `srcCap > 0`, so `cap = len` would have handed `v.extend(view)` the C
buffer to free, and `cap = 0` is right for exactly that reason.

The honest consequence: cap is **not observable from Milo today**. `xs.capacity()` is not on
the slice method set and `dst.extend(xs)` is rejected by the checker, so flipping this
constant to `len` leaves all seven new tests and the ASan sweep green (confirmed by doing
it). The value is correct and consistent; the gate on it does not exist yet, and saying so
is better than implying a test covers it.

**`nestedRef` already fired, unchanged.** `Option<&[T]>` and `Vec<&T>` returned from the
closure are both rejected, via `errorIfRefReturn` on the monomorphized `Option<R>`. The
message names the mangled instance, which is ugly, but the user's own source gets a second,
better-placed error ("cannot return a view of 'xs'") from the same attempt.

**`@unsafe fn` had to be added; it did not exist.** The spec writes `@unsafe fn withRaw`, but
the language had `unsafe` only as a block and had no way to say "calling this needs one".
Without it, `withRaw(v.ptr(), 1000000, f)` is safe-looking Milo: every operation in the body
is individually checkable and the length is still a lie. Now an entry in `src/attributes.ts`,
one arm in the checker's fn-attribute validation, and a `requireUnsafeCall` on both the
generic and non-generic call paths. `fnDecls` also had to start recording a decl that has no
contracts, which it previously skipped.

**The two functions are ordinary Milo, over one compiler intrinsic.** Making the whole of
`withRaw` an intrinsic would have left `std/foreign.milo` with nothing in it. Instead the
compiler provides `rawSlice(p, len)` / `rawSliceMut(p, len)` (checker + `RawSlice` HIR node +
about twenty lines of codegen), and the null test, the negative-length test and the `Option`
wrapping are written in Milo where they can be read. The intrinsic is restricted BY FILE to
`std/foreign.milo`: elsewhere the name is an ordinary undefined function, so it is not a
general escape hatch, and the closure form remains the only way to obtain a foreign view.

**A closure could not take a slice at all before this.** `closureParamTy` asked LLVM for
`%Vec` while the prologue and every call site spoke `ptr`, and an indirect call has no callee
signature to disagree with, so it miscompiled silently rather than erroring. Fixed in
`genClosure` and `genClosureCall`. `(&[T]) => R` is the shape this whole feature is built on,
so nothing here would have worked.

**Generic inference dropped array and pointer wrappers.** `fn f<T>(p: *T)` bound T to `*i64`
and `fn f<T>(v: &[T])` bound T to `Vec<i64>`, both reporting a mismatch from inside the body
against a type the program never wrote. Three sites: the direct-match arm of generic call
inference, `inferTypeParamsFromHint`, and `substituteMiloType`, which kept `isRef` and `isPtr`
across substitution but not `isArray`. `withRaw<T, R>(p: *T, ..., f: (&[T]) => R)` needs all
three to be right at once.

**Not attempted, and worth naming:** nothing here validates alignment, and nothing gives the
view a brand. Both are as stated in the sections above.

## 2. `?&mut T` — nullable extern reference (**BUILT**)

```milo
@externalLinkage fn DGifGetScreenDesc(gif: ?&mut GifFileType): i32 {
    let g = gif else { return GIF_ERROR }   // g: &mut GifFileType
    g.SWidth = ...
}
```

- **ABI: exactly `T*`.** One pointer; null is the absent case. No tag, no wrapper.
- Legal **only** in `extern` / `@externalLinkage` function signatures. It is not a general type:
  it cannot name a local, a struct field, a `Vec` element, or a closure parameter.
- Desugars at the signature seam to: raw pointer parameter, compiler-inserted null test, and a
  binding that is an ordinary second-class `&mut T` inside the body. Unwrapped with the existing
  `let`-else / `match` syntax.

**`?&mut T` is not `Option<&mut T>`, and that distinction is the point.** `Option<&mut T>` is an
enum with a reference payload, and `nestedRef` correctly rejects it as storage — it is the same
escape `Vec<&T>` had. Rust reaches row E with a *value* type because its lifetimes make the
escape checkable; Milo cannot copy that and must not try. Signature-level sugar reaches the same
39 functions while leaving the axiom untouched, because the reference only ever exists in
parameter position, which is precisely what the one rule permits.

This is a case where the axiom **forces the better design**: the C contract for
`DGifGetScreenDesc(GifFileType *)` is "valid for the duration of this call," which is the
definition of a second-class reference. `&'a` over-promises — it can name a lifetime longer than
the call, and `ffi.rs` then has 28 sites where a human must not do that.

### What the build actually needed

Shipped as a parser spelling plus one checker rule and one HIR node, with fixtures
`tests/fixtures/nullableExternRef*.milo` and `tests/fixtures/cSigNullableRef.milo`, twelve
rejections in `tests/errors/nullableRef*.milo` and `letElseNotNullableRef.milo`, an IR-shape
assertion in `tests/abi.test.ts` and a C consumer in `tests/header.test.ts`. Six things the
spec above did not anticipate:

**`?` did not collide with the propagate operator, and the reason is worth writing down.**
The two live in different grammars. `?` is postfix in expression position (`v?`) and postfix
in type position (`T?` = `Option<T>`); this feature is the only PREFIX use, and no other type
may begin with `?`. So `parseType` takes it with one arm at the top and no lookahead. The one
place the collision was real is the formatter, which is token-based and had a single "never
space before `?`" rule covering both postfix uses; it printed `gif:?&mut GifFileType`.

**The placement rule is enforced in the PARSER, not the checker,** which is the opposite of
this repo's usual instruction to catch semantics in `checker.ts`. `parseType` takes an
`allowNullableRef` flag that is true only at the top level of a parameter type in an
`extern` / `@externalLinkage` signature; every recursive call leaves it false. That makes
`Vec<?&mut T>`, `(?&mut T) => R`, `[?&mut T; 2]`, a field, a local, a type alias and a return
type all one error with one message, and — more usefully — it means the flag can never reach
any later stage in a position the ownership model does not already permit a `&mut T`. There
is no defensive case for it anywhere in `checker.ts`, `lower.ts`, `codegen.ts`, `csig.ts` or
`headergen.ts`.

**It is not a new `TypeKind`; it is a `ptr`.** `typeFromAst` maps `?&mut T` to
`{tag: "ptr", inner: T}`, because that IS the ABI claim the spelling makes. What keeps it
from being an ordinary raw pointer is not the type but the BINDING: `VarInfo.nullableRef`
records the reference the unwrap will produce, and `checkIdentExpr` rejects every read of a
binding that carries it. One gate covers passing it on, storing it, a field access and
`Option.Some(p)`, because all four reach `checkIdentExpr`. The consequence worth having is
that `@cSig`'s pointee-width guard and `headergen`'s `T *` both worked with no change:
`sizeof(*(struct utsname *)0) >= <milo size>` is emitted for a `?&mut Utsname` exactly as it
is for a `*Utsname`, and `build-lib` declares `int32_t point_bump(Point* p);`.

**`match` was NOT built, deliberately.** The spec offers `let`-else *or* `match` as the
spellings. A `match` over a nullable extern reference would need `Option.Some(g)` /
`Option.None` patterns, which is precisely the `Option<&mut T>` mental model the section
above says must not exist — the user would be writing the enum the design refuses to build.
`let g = p else { … }` names no enum and no variant, so it is the only spelling, and
`match gif { … }` gets the ordinary "must be unwrapped" diagnostic pointing at it.

**A second live unwrap of the same `?&mut T` is rejected,** which the spec does not mention
and which the axiom requires: two `let`s would hand the body two `&mut T` aliasing one
object. It reuses the existing borrow plumbing (`VarInfo.borrowed` plus `freezes`, released
by `popScope`), so it is scoped rather than function-wide: unwrapping once in each arm of an
`if` is accepted. A shared `?&T` has nothing to exclude and is not restricted.

**`let NAME = value else { … }` had to be added to the parser at all.** The existing let-else
required a pattern (`let Enum.Variant(b) = v else`), disambiguated by the `.` after the first
identifier, so the bare-identifier form was a syntax error. It is now an `LetElseStmt` with a
`bindName` and a placeholder wildcard pattern, which is what let every Stmt walker in
`safety.ts`, `visibility.ts`, `wcet.ts`, `verify.ts` and `mangle.ts` keep working untouched.
On anything that is not a nullable extern reference it is a checker error that names the
enum form.

### Gate honesty

Three deliberate breaks, and what each reddened:

| Break | Result |
|---|---|
| make the null test never fire (`icmp eq ptr %p, inttoptr (i64 1 to ptr)`), so null takes the non-null path | 2 red: `nullableExternRefNull`, `nullableExternRefShared` |
| let `parseType` accept `?&` everywhere (`allowNullableRef` ignored) | 5 red: `nullableRefOutsideExtern`, `nullableRefAsReturn`, `nullableRefInStructField`, `nullableRefInClosureParam`, `nullableRefTypeArg` |
| drop the `checkIdentExpr` rejection | 3 red: `nullableRefNotUnwrapped`, `nullableRefIntoOption`, `nullableRefPassedOn` |
| make `typeFromAst` map `?&mut T` to a `ref` instead of a `ptr` (the parameter becomes a by-value struct) | 2 red: `tests/abi.test.ts` on both linux-x64 and macos-arm64 — and the whole fixture lane stays GREEN, which is the point of pinning the ABI outside it |

And one thing to be honest about: the fixture lane cannot see the ABI. A wrapper struct, a
tag word or a second hidden argument would all still run correctly from Milo, because Milo
compiles both sides. That is why the ABI claim is pinned twice outside it — on the emitted
IR for both targets (`tests/abi.test.ts`) and by a C program that declares
`int32_t point_bump(Point*)` itself, links the Milo `.a`, and calls it with `&p` and with
`NULL` (`tests/header.test.ts`).

## 3. `adopt` — the inverse of `forget`

```milo
@unsafe fn adopt<T>(p: *T): Option<Heap<T>>
@unsafe fn adoptSlice<T>(p: *T, len: i64): Option<Vec<T>>
```

`forget(x)` (shipped, `language-reference.md:402`) releases ownership through a raw pointer the
checker cannot see. Nothing takes it back. Kind J needs the return trip: `DGifCloseFile` receives
a `GifFileType*` that Milo allocated, and must run its drop so nested owned fields are freed —
giflib-rs does this **safely** via `Option<Box<GifFileType>>` (`ffi.rs:194`).

Caller asserts: `p` came from a Milo allocation of the matching type, is unaliased, and has not
been adopted before. `Option.None` iff null.

Implementation note to settle during the build: Milo's `Heap<T>`/`Vec<T>` allocator must be
`malloc`-compatible for the give direction to be sound, since C calls `free` on what
`decoder.rs:531`-shaped code hands out. `std/seal.milo` already declares `malloc`/`free` externs
directly; confirm rather than assume.

## Not covered by any of the three

- **Kind F — C function pointers.** Milo can call through a raw fn pointer today, but untyped:
  `Task.spawnRaw(fnPtr: *u8, …)` with the address obtained by `memcpy`
  (`std/runtime.milo:443-463`). giflib needs to *store* `InputFunc`/`OutputFunc` in a C struct and
  call them. Typed extern fn-pointer values are a separate feature. 8 sites.
- **Kind G — fd adoption.** A pure trust assertion. `unsafe` in Rust too. Not a gap.
- **Reentrancy.** giflib calls back into C while Milo holds a view over C memory; that callback
  may free or realloc it. `decoder.rs:98` takes `self as *mut GifFileType` while `&mut self` is
  live and hands it to the callback — aliasing UB in Rust, carried entirely by the `ReadCallback`
  unsafe contract (`c_types.rs:408`). **Identical hazard, identical remedy, no win to either
  side.** Do not claim one.
- **No brand on a foreign view.** A `Span` gets `_bufferId` because `seal` mints it; a pointer
  that never passed through Milo cannot be tagged. Second-class refs shrink this to nearly
  nothing — the view dies at the end of `f`, so there is no window in which two views coexist to
  be confused — but it does not vanish.

## The gate

A spec with no falsifier is a wish. The gate for this work is a **differential against C**, the
same oracle Google used at 30M GIFs, run at a scale one machine can reach.

giflib-rs itself ships **no tests and no benches** — 12 `.rs` files, and its CI runs
`cargo test --locked` against a repo with zero test files. The `c_library_from_rust_signatures_test`
that `lib.rs:52` names is Google-internal, as are the corpus and the differential fuzzer. So the
oracle has to be built, not borrowed.

1. Build C giflib 6.1.3 and the Milo port as two `.so`s exporting the same symbols. `@cLayout`
   and `@cSig` verify every struct layout and signature against the real `gif_lib.h` at build
   time — the checked equivalent of what `build.rs` does with `bindgen`.
2. One C driver, linked twice: `DGifOpenFileName` → `DGifSlurp` → walk `SavedImages` → emit a
   canonical digest (dimensions, palette, raster bytes, extension blocks, error code).
3. Diff the digests byte-for-byte over a GIF corpus, seeded and then mutated, fuzzer-style.
   giflib-rs is available as a third voice where C and Milo disagree.
4. **Gate honesty check** (the routine that pays off most and is run least): corrupt one entry in
   the Milo LZW table and confirm the differential goes red. A gate that reports "0 checked" and
   exits 0 forever is worse than no gate.

Known-divergence list to encode up front, from giflib-rs's own README — these are deliberate
improvements over C, so the digest must treat them as expected, not as failures: `GifFile->Error`
set on invalid dimensions where C leaves it 0; write-failure return codes C ignores; OOM
behaviour.

## See also

- [ownership-model](ownership-model.md) — the one rule, and why no lifetimes
- [residue-vs-rust](residue-vs-rust.md) — the three residues; this doc is the fourth thing that
  looked like a residue and was not
- [rewrite-findings-html5ever](rewrite-findings-html5ever.md) — the five probes and the
  `arenaWith` shape this reuses
- [memory-safety-vs-rust](memory-safety-vs-rust.md) — the threat matrix a giflib probe would add
  a real-CVE row to (CVE-2026-26740)
