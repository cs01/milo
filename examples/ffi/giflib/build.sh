#!/bin/sh
# Build the Milo giflib decode port as a C static library, and optionally run the
# differential gate against the real libgif.
#
# With no second argument this builds the library and stops. With a work directory it also
# compiles the two drivers, generates the corpus, and runs both gates in it.
#
#   sh build.sh [outdir] [workdir]
#
# --allow=adopt-raw-fields: the close path adopts the GifFileType box, whose SavedImages and
# ExtensionBlocks pointers are BORROWED - the arrays they address are Milo Vecs owned by the
# CStore, freed one line earlier - so the lint's default reading (free what they address
# first) does not apply here. The warning is correct for a struct that owns its pointers.
#
# CPATH is what lets @cLayout/@cValue read the real gif_lib.h. WITHOUT it the guards do
# not fail: they SKIP, announced on stderr, and the ABI claims in gifabi.milo go
# unchecked, which is the one thing this build must not do quietly. So the skip warning
# is promoted to a hard failure here.
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
MILO_ROOT=$(cd "$HERE/../../.." && pwd)
OUT=${1:-/tmp/giflib-milo}
WORK=${2:-}

# Where gif_lib.h lives. Homebrew on Apple Silicon by default; override for another prefix.
: "${GIF_INCLUDE:=/opt/homebrew/include}"
if [ ! -f "$GIF_INCLUDE/gif_lib.h" ]; then
    echo "no gif_lib.h under $GIF_INCLUDE; set GIF_INCLUDE to the directory holding it" >&2
    exit 1
fi

mkdir -p "$OUT"
LIB="$OUT/libgifmilo.a"

log=$(CPATH="$GIF_INCLUDE" "$MILO_ROOT/milo" build-lib "$HERE/gif.milo" \
        -o "$LIB" --deny=unverified-extern --allow=adopt-raw-fields 2>&1)
echo "$log"
case "$log" in
    *"guards for 'gif_lib.h' skipped"*)
        echo "REFUSING: the @cLayout guards did not run, so the ABI is unverified" >&2
        exit 1 ;;
esac
echo "built $LIB"

[ -n "$WORK" ] || exit 0

# The gate: one C driver, compiled twice from gate/driver.c, once against the real libgif and
# once against this port, diffed over the corpus. See docs/foreign-memory.md for why a
# differential is the only honest oracle for an ABI drop-in.
: "${GIF_LIBDIR:=/opt/homebrew/lib}"
: "${GIF_MUTANTS:=3000}"
: "${GIF_SEED:=20260831}"

mkdir -p "$WORK"
WORK=$(cd "$WORK" && pwd)

clang -O1 -I"$GIF_INCLUDE" -o "$WORK/driver_c" "$HERE/gate/driver.c" \
    -L"$GIF_LIBDIR" -lgif
clang -O1 -I"$GIF_INCLUDE" -o "$WORK/driver_milo" "$HERE/gate/driver.c" "$LIB"

# The corpus is generated rather than checked in: it is a function of a seed, so a red run
# is reproducible from the number in the log without carrying thousands of files in git.
rm -rf "$WORK/corpus"
python3 "$HERE/gate/corpus.py" "$WORK/corpus" "$GIF_MUTANTS" "$GIF_SEED"

# Error codes no valid-ish file reaches, because every file the corpus generates exists and
# most of them still have an image descriptor. Generated rather than checked in, so the list
# is readable as the cases it claims to cover.
EDGE="$WORK/edge"
rm -rf "$EDGE"
mkdir -p "$EDGE"
python3 - "$EDGE" <<'PYEOF'
import sys, os
d = sys.argv[1]
def w(n, b): open(os.path.join(d, n), 'wb').write(b)
hdr = b'GIF87a' + bytes([4,0, 4,0, 0x80, 0, 0]) + bytes([0,0,0, 255,255,255])
w('trailer_only.gif', hdr + b'\x3b')                 # no image descriptor -> 105
w('empty.gif', b'')                                  # -> 102 at open
w('short.gif', b'GIF')                               # short stamp -> 102
w('stamp_only.gif', b'GIF89a')                       # screen desc fails -> no code at all
w('notgif.gif', b'PNG89a' + bytes(7))                # -> 103
w('no_trailer.gif', hdr)                             # runs off the end -> 102
w('bad_record.gif', hdr + b'\x99')                   # -> 107
w('zerodim.gif', hdr + b'\x2c' + bytes(8) + b'\x00\x02\x00\x3b')  # degenerate dims -> no code
PYEOF

# Past this point a nonzero exit is data, not a failure to abort on: both gates report
# their own verdict and this script forwards it.
set +e

edgefail=0
edgen=0
for f in "$EDGE"/*.gif "$EDGE" /no/such/file.gif; do
    edgen=$((edgen + 1))
    a=$("$WORK/driver_c" "$f" 2>&1); ar=$?
    b=$("$WORK/driver_milo" "$f" 2>&1); br=$?
    if [ "$a" != "$b" ] || [ "$ar" != "$br" ]; then
        echo "EDGE RED $f"; echo "  C: $a"; echo "  milo: $b"; edgefail=1
    fi
done
if [ "$edgefail" = 0 ]; then
    echo "EDGE GREEN $edgen/$edgen (error codes the corpus cannot reach, plus a directory and a missing file)"
else
    echo "EDGE RED" >&2
fi

sh "$HERE/gate/gate.sh" "$WORK/driver_c" "$WORK/driver_milo" "$WORK/corpus"
gate=$?
[ "$edgefail" = 0 ] || exit 1
exit $gate
