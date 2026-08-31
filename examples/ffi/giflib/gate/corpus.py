#!/usr/bin/env python3
"""Generate the differential corpus: a hand-built seed set plus seeded mutations.

    python3 corpus.py <outdir> <n-mutants> [seed]

Two properties matter more than the corpus being large.

Determinism: the same arguments must produce byte-identical files, or a red gate cannot be
reproduced and therefore cannot be debugged. Everything here comes from one
`random.Random(seed)` consumed in a fixed order.

Reach: mutations wander, but they wander away from wherever the seeds start, so the seeds
have to plant a flag on each structural feature the decoder branches on. GIF87a and GIF89a,
interlaced and progressive, one image and several, a local colour map, a file with no global
map at all, and the four extension labels giflib names in its header. What the mutants then
add is the error paths, which no valid file reaches.

The pixel data uses the "uncompressed GIF" encoding: LZW minimum code size 7, a clear code
emitted before every literal so the table never grows and every code stays exactly 8 bits
wide. That makes the compressed stream byte-aligned and lets this file have no compressor in
it, while still being a stream the real LZW decoder has to run to get right.
"""

import os
import random
import sys

CLEAR = 0x80  # min code size 7 -> clear = 128, EOI = 129, both 8 bits wide
EOI = 0x81
MIN_CODE_SIZE = 7


def le16(n):
    return bytes([n & 0xFF, (n >> 8) & 0xFF])


def subBlocks(data):
    """Split a byte string into GIF sub-blocks, terminated by a zero-length block."""
    out = bytearray()
    i = 0
    while i < len(data):
        chunk = data[i : i + 255]
        out.append(len(chunk))
        out += chunk
        i += 255
    out.append(0)
    return bytes(out)


def lzwData(pixels):
    """Uncompressed-GIF LZW: clear, literal, clear, literal, ..., EOI."""
    stream = bytearray()
    for p in pixels:
        stream.append(CLEAR)
        stream.append(p & 0x7F)  # literals must stay below the clear code
    stream.append(CLEAR)
    stream.append(EOI)
    return bytes([MIN_CODE_SIZE]) + subBlocks(bytes(stream))


class BitWriter:
    def __init__(self):
        self.out = bytearray()
        self.acc = 0
        self.n = 0

    def put(self, code, width):
        self.acc |= code << self.n
        self.n += width
        while self.n >= 8:
            self.out.append(self.acc & 0xFF)
            self.acc >>= 8
            self.n -= 8

    def finish(self):
        if self.n:
            self.out.append(self.acc & 0xFF)
            self.acc = 0
            self.n = 0
        return bytes(self.out)


def lzwCompressed(pixels, minCodeSize):
    """A real GIF LZW encoder, so some of the corpus grows the decoder's dictionary.

    The uncompressed encoding above never lets the table past its first entry, which
    leaves the code-width bumps at 9, 10, 11 and 12 bits and the mid-stream clear
    unexercised. Those are where the CVE class in this library lives, so the corpus cannot
    afford to skip them.
    """
    clear = 1 << minCodeSize
    eoi = clear + 1
    w = BitWriter()

    # The width schedule mirrors giflib's reader exactly: it widens after reading a code
    # whose running counter has passed the current ceiling, not when the dictionary
    # reaches a size. Deriving it from the table size instead is off by one code and
    # produces a stream that decodes to something, just not to what was encoded.
    state = {}

    def reset():
        state["codeSize"] = minCodeSize + 1
        state["max"] = 1 << (minCodeSize + 1)
        state["running"] = eoi + 1

    def emit(code):
        w.put(code, state["codeSize"])
        state["running"] += 1
        if state["running"] > state["max"] and state["codeSize"] < 12:
            state["max"] <<= 1
            state["codeSize"] += 1

    reset()
    w.put(clear, state["codeSize"])
    reset()

    table = {(i,): i for i in range(clear)}
    nextCode = eoi + 1
    prefix = ()
    for p in pixels:
        cand = prefix + (p,)
        if cand in table:
            prefix = cand
            continue
        emit(table[prefix])
        if nextCode < 4095:
            table[cand] = nextCode
            nextCode += 1
        else:
            # Table full: the mid-stream clear, which is its own branch in the reader.
            w.put(clear, state["codeSize"])
            reset()
            table = {(i,): i for i in range(clear)}
            nextCode = eoi + 1
        prefix = (p,)
    if prefix:
        emit(table[prefix])
    emit(eoi)
    return bytes([minCodeSize]) + subBlocks(w.finish())


def palette(colors):
    out = bytearray()
    for r, g, b in colors:
        out += bytes([r, g, b])
    return bytes(out)


PAL4 = [(0, 0, 0), (255, 0, 0), (0, 255, 0), (0, 0, 255)]
PAL8 = PAL4 + [(255, 255, 0), (0, 255, 255), (255, 0, 255), (255, 255, 255)]


def screen(w, h, gct, bg=0, aspect=0, res=7, sort=False):
    """gct is None for a file with no global colour map."""
    packed = ((res - 1) & 7) << 4
    if gct is None:
        return le16(w) + le16(h) + bytes([packed, bg, aspect])
    size = 0
    while (2 << size) < len(gct):
        size += 1
    packed |= 0x80 | (size & 7)
    if sort:
        packed |= 0x08
    entries = 2 << size
    tbl = palette(gct) + bytes(3 * (entries - len(gct)))
    return le16(w) + le16(h) + bytes([packed, bg, aspect]) + tbl


def imageDesc(left, top, w, h, lct=None, interlace=False):
    packed = 0
    tbl = b""
    if lct is not None:
        size = 0
        while (2 << size) < len(lct):
            size += 1
        packed |= 0x80 | size
        n = 2 << size
        tbl = palette(lct) + bytes(3 * (n - len(lct)))
    if interlace:
        packed |= 0x40
    return b"\x2c" + le16(left) + le16(top) + le16(w) + le16(h) + bytes([packed]) + tbl


def image(left, top, w, h, pixels, lct=None, interlace=False):
    return imageDesc(left, top, w, h, lct, interlace) + lzwData(pixels)


def imageC(left, top, w, h, pixels, minCodeSize, lct=None, interlace=False):
    """Same, but with the real compressor, so the dictionary actually grows."""
    return imageDesc(left, top, w, h, lct, interlace) + lzwCompressed(pixels, minCodeSize)


PAL256 = [((i * 7) % 256, (i * 13) % 256, (i * 29) % 256) for i in range(256)]


def ext(label, blocks):
    return b"\x21" + bytes([label]) + subBlocks(blocks)


def ramp(w, h, mod=4):
    return bytes([(x + y) % mod for y in range(h) for x in range(w)])


def seeds():
    """Ordered so the file names are stable across runs and across Python versions."""
    out = []

    # GIF87a, progressive, one image, global map. The baseline every mutant drifts from.
    out.append(("s01_87a_basic.gif",
                b"GIF87a" + screen(6, 5, PAL4) + image(0, 0, 6, 5, ramp(6, 5)) + b"\x3b"))

    # GIF89a with the same content: the version stamp is its own branch in the reader.
    out.append(("s02_89a_basic.gif",
                b"GIF89a" + screen(6, 5, PAL4) + image(0, 0, 6, 5, ramp(6, 5)) + b"\x3b"))

    # Interlaced. giflib reorders the rows on slurp, so the raster hash catches a wrong
    # pass table even when every byte of the stream decoded correctly.
    out.append(("s03_interlace.gif",
                b"GIF89a" + screen(8, 8, PAL8)
                + image(0, 0, 8, 8, ramp(8, 8, 8), interlace=True) + b"\x3b"))

    # Interlaced with a height that does not divide by 8: the last passes are short.
    out.append(("s04_interlace_odd.gif",
                b"GIF89a" + screen(5, 11, PAL8)
                + image(0, 0, 5, 11, ramp(5, 11, 8), interlace=True) + b"\x3b"))

    # Three images with offsets, so ImageCount and per-image geometry both move.
    out.append(("s05_multi.gif",
                b"GIF89a" + screen(10, 10, PAL4)
                + image(0, 0, 4, 4, ramp(4, 4))
                + image(2, 3, 5, 2, ramp(5, 2))
                + image(6, 6, 3, 3, ramp(3, 3)) + b"\x3b"))

    # Local colour map on the second image only.
    out.append(("s06_local_map.gif",
                b"GIF89a" + screen(8, 4, PAL4)
                + image(0, 0, 4, 4, ramp(4, 4))
                + image(4, 0, 4, 4, ramp(4, 4), lct=PAL8) + b"\x3b"))

    # No global colour map: SColorMap must come back NULL, not an empty one.
    out.append(("s07_no_global.gif",
                b"GIF89a" + screen(4, 4, None)
                + image(0, 0, 4, 4, ramp(4, 4), lct=PAL4) + b"\x3b"))

    # No global map and no local map either, which is malformed but decodable.
    out.append(("s08_no_map_at_all.gif",
                b"GIF89a" + screen(4, 4, None) + image(0, 0, 4, 4, ramp(4, 4)) + b"\x3b"))

    # Graphics control extension, the one giflib attaches to the image that follows.
    out.append(("s09_gce.gif",
                b"GIF89a" + screen(4, 4, PAL4)
                + ext(0xF9, bytes([0x05, 0x0A, 0x00, 0x02]))
                + image(0, 0, 4, 4, ramp(4, 4)) + b"\x3b"))

    # Comment before the image and another after it: the trailing one lands on the file's
    # own extension list rather than on a SavedImage.
    out.append(("s10_comment.gif",
                b"GIF89a" + screen(4, 4, PAL4)
                + ext(0xFE, b"a comment")
                + image(0, 0, 4, 4, ramp(4, 4))
                + ext(0xFE, b"trailing") + b"\x3b"))

    # Application extension: 11-byte identifier block then data blocks, the NETSCAPE loop.
    out.append(("s11_application.gif",
                b"GIF89a" + screen(4, 4, PAL4)
                + b"\x21\xff\x0bNETSCAPE2.0\x03\x01\x05\x00\x00"
                + image(0, 0, 4, 4, ramp(4, 4)) + b"\x3b"))

    # Plain text extension: a 12-byte header block then the text.
    out.append(("s12_plaintext.gif",
                b"GIF89a" + screen(16, 16, PAL4)
                + ext(0x01, bytes([0, 0, 0, 0, 16, 0, 16, 0, 8, 8, 1, 0]) + b"hi")
                + image(0, 0, 4, 4, ramp(4, 4)) + b"\x3b"))

    # Every extension label at once, plus a continuation sub-block long enough to be split.
    out.append(("s13_all_ext.gif",
                b"GIF89a" + screen(8, 8, PAL8)
                + ext(0xF9, bytes([0x09, 0x64, 0x00, 0x01]))
                + ext(0xFE, bytes(300))
                + b"\x21\xff\x0bXMP DataXMP" + subBlocks(b"payload")
                + ext(0x01, bytes([1, 0, 2, 0, 8, 0, 8, 0, 6, 6, 2, 3]) + b"plain")
                + image(0, 0, 8, 8, ramp(8, 8, 8), interlace=True)
                + ext(0xF9, bytes([0x00, 0x00, 0x00, 0x00]))
                + image(0, 0, 8, 8, ramp(8, 8, 8), lct=PAL4) + b"\x3b"))

    # A sub-block of exactly 255 bytes: C keeps the block cursor in a GifByteType and rolls
    # it over, which the port has to reproduce rather than trap on.
    pixels = ramp(127, 4)
    out.append(("s14_full_subblock.gif",
                b"GIF89a" + screen(127, 4, PAL4)
                + image(0, 0, 127, 4, pixels) + b"\x3b"))

    # A larger raster, so the LZW loop runs long enough for a table bug to show up.
    out.append(("s15_large.gif",
                b"GIF89a" + screen(64, 40, PAL8)
                + image(0, 0, 64, 40, ramp(64, 40, 8)) + b"\x3b"))

    # Non-zero background, sort flag and aspect byte: fields that are pure passthrough and
    # therefore the ones most likely to be quietly dropped.
    out.append(("s16_fields.gif",
                b"GIF89a" + screen(9, 7, PAL8, bg=5, aspect=49, res=4, sort=True)
                + image(1, 2, 3, 3, ramp(3, 3)) + b"\x3b"))

    # A 1x1 image, the smallest thing the decoder can be asked for.
    out.append(("s17_tiny.gif",
                b"GIF87a" + screen(1, 1, PAL4) + image(0, 0, 1, 1, b"\x02") + b"\x3b"))

    # From here the pixel data is really LZW-compressed. Everything above keeps the
    # dictionary pinned at its first entry, so without these the reader's code-width bumps
    # and its mid-stream clear are never executed at all.

    # A gradient over 256 colours: the table grows steadily through 9 and 10 bits.
    grad = bytes([(x * 3 + y * 5) % 256 for y in range(64) for x in range(64)])
    out.append(("s18_lzw_gradient.gif",
                b"GIF89a" + screen(64, 64, PAL256)
                + imageC(0, 0, 64, 64, grad, 8) + b"\x3b"))

    # Deliberately incompressible, so the dictionary reaches 4095 and the encoder has to
    # emit a mid-stream clear, which the reader has to notice and reset on.
    noise = bytearray()
    v = 12345
    for _ in range(128 * 128):
        v = (v * 1103515245 + 12345) & 0x7FFFFFFF
        noise.append((v >> 16) & 0xFF)
    out.append(("s19_lzw_noise.gif",
                b"GIF89a" + screen(128, 128, PAL256)
                + imageC(0, 0, 128, 128, bytes(noise), 8) + b"\x3b"))

    # Long runs of one colour with a 4-colour palette: minimum code size 2, so the width
    # climbs from 3 bits, and the dictionary entries get long.
    runs = bytes([0] * 900 + [1, 2, 3] * 100 + [2] * 600)
    out.append(("s20_lzw_runs.gif",
                b"GIF89a" + screen(60, 30, PAL4)
                + imageC(0, 0, 60, 30, runs, 2) + b"\x3b"))

    # Compressed and interlaced at once: the pass table walks the raster in a different
    # order than the codes arrive in. The pixels are handed over in raster order, so the
    # decoded picture is scrambled; what is being compared is the ordering, not the art.
    out.append(("s21_lzw_interlace.gif",
                b"GIF89a" + screen(48, 48, PAL256)
                + imageC(0, 0, 48, 48,
                         bytes([(x ^ y) % 256 for y in range(48) for x in range(48)]), 8,
                         interlace=True) + b"\x3b"))

    return out


def mutate(rng, data):
    """One of: flip a few bytes, truncate, splice a run, or extend with junk."""
    kind = rng.randrange(4)
    b = bytearray(data)
    if len(b) == 0:
        return bytes(b)
    if kind == 0:
        for _ in range(rng.randrange(1, 5)):
            i = rng.randrange(len(b))
            b[i] ^= rng.randrange(1, 256)
    elif kind == 1:
        # Truncation is what reaches the "ran off the end" error codes.
        b = b[: rng.randrange(0, len(b))]
    elif kind == 2:
        i = rng.randrange(len(b))
        n = rng.randrange(1, 9)
        for k in range(n):
            if i + k < len(b):
                b[i + k] = rng.randrange(256)
    else:
        b += bytes(rng.randrange(256) for _ in range(rng.randrange(1, 33)))
    return bytes(b)


def main():
    if len(sys.argv) < 3:
        print("usage: corpus.py <outdir> <n-mutants> [seed]", file=sys.stderr)
        return 2
    outdir = sys.argv[1]
    n = int(sys.argv[2])
    seed = int(sys.argv[3]) if len(sys.argv) > 3 else 20260831

    os.makedirs(outdir, exist_ok=True)
    base = seeds()
    for name, data in base:
        with open(os.path.join(outdir, name), "wb") as f:
            f.write(data)

    rng = random.Random(seed)
    width = max(5, len(str(max(1, n - 1))))
    for i in range(n):
        srcName, srcData = base[rng.randrange(len(base))]
        data = mutate(rng, srcData)
        # A second round on some of them, so the corpus is not only one-edit-from-valid.
        if rng.randrange(3) == 0:
            data = mutate(rng, data)
        with open(os.path.join(outdir, "m%0*d.gif" % (width, i)), "wb") as f:
            f.write(data)

    print("corpus: %d seeds + %d mutants = %d files (seed %d)"
          % (len(base), n, len(base) + n, seed))
    return 0


if __name__ == "__main__":
    sys.exit(main())
