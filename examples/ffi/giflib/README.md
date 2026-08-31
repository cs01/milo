# giflib decode, in Milo

An ABI-compatible drop-in for the decode half of [giflib](http://giflib.sourceforge.net/)
6.1.3: build it as a static library, link a C program against it *instead of* `-lgif`, and
`DGifOpenFileName` / `DGifSlurp` / `DGifCloseFile` behave as the C library does, down to
the error codes and the bytes in `SavedImages[i].RasterBits`.

It exists to answer one question with a number rather than an opinion: **how much `unsafe`
does Milo need at a real C boundary?** The comparison is Google's
`giflib-rs`, a Rust rewrite of the same library whose 9 business-logic modules are
`#![forbid(unsafe_code)]` and whose comparable decode surface carries about 26 unsafe
sites. See [docs/foreign-memory.md](../../../docs/foreign-memory.md) for the census that
motivated the three FFI primitives this port is built on.

**This port has 5.** All five are in `gif.milo`; `gifdec.milo` and `gifabi.milo` contain
none.

## Layout

| File | What it is | `unsafe` |
|---|---|---|
| `gifabi.milo` | the six C structs and the header's `#define`s, each pinned by `@cLayout` / `@cValue` | 0 |
| `gifdec.milo` | the decoder: reader, screen descriptor, LZW, interlace, extensions | 0 |
| `gif.milo` | the three C entry points, and the only code that knows a pointer exists | 5 |
| `gate/` | the differential: `driver.c`, `corpus.py`, `gate.sh` | n/a, it is C and python |

The split is the point. `gifdec.milo` cannot be wrong about memory because it never names
any: the sub-block buffer, the LZW prefix/suffix/stack tables and the raster are `Vec`s
with bounds checks. The CVE class this library is known for (a code index walking off
`Prefix[]`) is a panic here, not a read of whatever followed the array.

## Why so little unsafe

The ownership shape does the work, not the primitives:

* **Milo owns every buffer C reads.** `v.ptr()` is safe to call and the `Vec` stays alive
  in the caller, so a filled `Vec` is a stable C array for as long as it lives. `CStore`
  is the set of those `Vec`s and it lives in the private state, so `DGifCloseFile` frees
  the entire object graph by dropping one value: no walk over C's structs, no `free` of
  our own, and nothing to get wrong on an error path.
* **Exactly one allocation crosses as an owned thing:** the `GifFileType` C is handed and
  hands back. `forget` on the way out, `adopt` on the way back.
* **`?&mut GifFileType`** is the whole null check in `DGifSlurp`; the body never sees a
  pointer. That check is not free ceremony: the real library segfaults on
  `DGifSlurp(NULL)` (it writes `GifFile->ExtensionBlocks` before looking), and this port
  answers `GIF_ERROR`. Every other NULL-argument case matches C exactly, including
  leaving a caller's `int` untouched where C does.

The five sites: minting a null pointer (`nullOf`), casting the state pointer to `void *`
(`boxState`), `adoptSlice` on the way back in (`takeState`), reading `Private` through the
raw `GifFileType*` in close, and `adopt` on that pointer.

`DGifCloseFile` takes a raw `*GifFileType` rather than `?&mut GifFileType` deliberately:
it consumes the object, and `adopt` already puts the null case in its return type, the
same place `?&mut` would have put it.

## Build and gate

```sh
sh build.sh                        # -> /tmp/giflib-milo/libgifmilo.a, and nothing else
sh build.sh <outdir> <workdir>     # ...then build both drivers in <workdir> and gate
```

The one-command form does the whole thing: it compiles `gate/driver.c` twice, once against
`-lgif` and once against the `.a` it just built, generates the corpus with `gate/corpus.py`,
runs the edge set, and runs `gate/gate.sh`. It exits nonzero if either gate is red. Knobs:
`GIF_INCLUDE` (default `/opt/homebrew/include`), `GIF_LIBDIR` (`/opt/homebrew/lib`),
`GIF_MUTANTS` (3000) and `GIF_SEED` (20260831). One run takes about 13 seconds.

`GIF_INCLUDE` must hold the real `gif_lib.h`: that is what `@cLayout` and `@cValue` compile
their guards against. Without it they SKIP, announced on stderr, and the ABI claims in
`gifabi.milo` go unchecked. So `build.sh` promotes the skip warning to a hard failure. An
unverified layout must not look like a verified one.

The oracle is a differential, because for an ABI drop-in nothing else is honest: one C
driver linked twice, emitting a canonical digest (dimensions, palettes, raster hash,
extension blocks, error codes, the close return) diffed byte-for-byte along with stderr and
the exit code. The corpus is generated rather than checked in, from a seed, so a red run is
reproducible from the number in the log rather than from thousands of files in git. As of
this writing:

```
corpus: 21 seeds + 3000 mutants = 3021 files (seed 20260831)
EDGE GREEN 10/10
GATE GREEN 3021/3021
```

The 21 seeds exist to plant a flag on each thing the reader branches on, because mutations
wander away from wherever they start: GIF87a and GIF89a, interlaced and progressive, one
image and several, a local colour map, no global colour map at all, and the extension labels
0xf9, 0xfe, 0xff, 0x01 and the 0x00 continuation. Four of them carry really LZW-compressed
pixel data rather than the uncompressed-GIF trick the rest use, because the trick pins the
dictionary at its first entry and would leave the code-width bumps at 9, 10, 11 and 12 bits
and the mid-stream clear entirely unexecuted. That is where this library's CVE class lives.

What the 3021 inputs reach, counted from C's own digests rather than assumed: 1224 files
slurp cleanly and 1469 fail, 328 fail at open. 256 carry an interlaced image, 205 more than
one image, 190 a local colour map and 289 no global map. Extension functions 0xf9, 0x01,
0xfe, 0x00 and 0xff appear in 204 to 230 files each, and mutation invents a dozen other
label bytes. Error codes reached: 102, 103, 105, 107, 112, 113, the errSilent no-code case
on 3 slurps, and the "C leaves `*Error` untouched" case on 187 opens. `D_GIF_ERR_DATA_TOO_BIG`
is reachable from `DGifGetLine` but not from `DGifSlurp`, which always asks for exactly the
declared pixel count; C has the same property.

What the corpus never reaches is a file that does not exist and a directory, and what it
reaches only by accident is a well-formed file with no image descriptor at all (105 lands on
2 of 3021, at the mercy of the seed). So `build.sh` generates eight tiny inputs for those
cases first and diffs them the same way (`EDGE GREEN 10/10`), which pins them regardless of
`GIF_SEED`.

**Both gates were checked for honesty rather than assumed to work**, and they catch different
things:

| Perturbation | Result |
|---|---|
| add 1 to entry 300 of the LZW suffix table | `GATE RED 128/3021`, edge set still green |
| write `D_GIF_ERR_NO_SCRN_DSCR` where C writes nothing | `EDGE RED` on `stamp_only.gif`, `GATE RED 187/3021` |
| publish the decoded document only on a successful slurp | `GATE RED 360/3021` |
| append the SavedImage before decoding, as `DGifGetImageDesc` does | `GATE RED 1105/3021` |
| run `gate.sh` against an empty directory | exit 1, `corpus is empty, nothing was compared` |

That last row is the one a differential harness fails silently without: a gate that walks a
directory it cannot read, compares nothing and reports green keeps reporting green forever.

51 inputs (the 21 seeds plus 30 mutants, i.e. error paths) also run clean under
`leaks -atExit`, with the same malloc node count as the C library on every one.

## Where C's behaviour is surprising, and copied anyway

The differential is the reason these are right rather than reasonable. Each one is a place
where the obvious implementation, or `giflib-rs`'s, disagrees with the installed C library:

* **`SColorResolution` is `(((Buf[0] & 0x70) + 1) >> 4) + 1`**, not the spec's
  `((Buf[0] >> 4) & 7) + 1`. C's precedence quirk is what every decoded GIF in the world
  actually carries.
* **The background colour is not clamped** to the screen colour map. C ends
  `DGifGetScreenDesc` with a comment saying there is no such check; `giflib-rs` added one.
* **Three failures return `GIF_ERROR` without recording an error code.** A screen
  descriptor that fails inside `DGifOpenFileName` leaves `*Error` untouched (`giflib-rs`
  reports `D_GIF_ERR_NO_SCRN_DSCR`, which the gate catches on 187 of 3021 inputs); a stack
  pointer past `LZ_MAX_CODE` and an image with degenerate dimensions both leave
  `GifFile->Error` at 0. `errSilent` is that answer, and the caller writes nothing for it.
* **A failed `DGifSlurp` still hands back everything it decoded.** C writes straight into
  the caller's `GifFileType`, so `GIF_ERROR` comes with the images that did decode and with
  the extension run that was pending when it gave up, left on the file rather than on an
  image. Publishing only on success is the obvious implementation and is wrong on 360 of
  3021 inputs. The complementary trap is to conclude from that that C appends each
  `SavedImage` up front the way `DGifGetImageDesc` does; it does not, and one restructure
  along those lines measured `GATE RED 1105/3021`. Neither number needs the port to check
  the underlying claim: link twelve lines against `-lgif`, slurp a single-image GIF
  truncated inside its LZW data, and the real library answers `ImageCount=0` (the image is
  appended only once it has fully decoded), while a multi-image file truncated in its
  SECOND image still answers `ImageCount=1` with a non-null `RasterBits` (the first one
  survives the failure). Both readings look right from the C source alone, which is the
  argument for the differential.
* **The LZW block cursor wraps.** C increments a `GifByteType` in `Buf[1]`; a 255-byte
  sub-block rolls it over to 0. Milo traps on overflow by default, so the increment is
  masked to 8 bits explicitly.

## Scope, and what is not here

Decode from a filename, and nothing else: no encoder, no quantizer, no font. `DGifOpen` /
`DGifOpenFileHandle` are absent because they take a C function pointer to call back
through, and Milo has no typed extern fn-pointer values yet: kind F in
[docs/foreign-memory.md](../../../docs/foreign-memory.md), the one census row none of the
three new primitives reach.

`tests/examples.test.ts` does not compile this directory: it walks entry points with a
`main()`, and this is a library. `sh build.sh /tmp/gifout /tmp/gifwork` is what keeps it
honest, and it needs the real libgif installed, so it is a local gate rather than a CI one.
