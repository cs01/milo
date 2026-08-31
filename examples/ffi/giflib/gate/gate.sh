#!/bin/sh
# Run both drivers over every file in a corpus and diff stdout, stderr and exit code.
#
#   sh gate.sh <driver_c> <driver_milo> <corpusdir>
#
# The empty-corpus check is not defensive padding. A harness that walks a directory it
# cannot read, compares nothing and prints GREEN is the failure this repo cares about most:
# it keeps reporting success after the thing it was watching has gone away.
set -u

C=${1:?driver_c}
M=${2:?driver_milo}
DIR=${3:?corpus dir}

n=0
bad=0
for f in "$DIR"/*; do
    [ -f "$f" ] || continue
    n=$((n + 1))
    ao=$("$C" "$f" 2>&1); ar=$?
    bo=$("$M" "$f" 2>&1); br=$?
    if [ "$ao" != "$bo" ] || [ "$ar" != "$br" ]; then
        bad=$((bad + 1))
        echo "MISMATCH $f"
        echo "  C    (exit $ar): $ao"
        echo "  milo (exit $br): $bo"
    fi
done

if [ "$n" = 0 ]; then
    echo "GATE RED: corpus $DIR is empty, nothing was compared" >&2
    exit 1
fi

if [ "$bad" = 0 ]; then
    echo "GATE GREEN $n/$n"
    exit 0
fi
echo "GATE RED $bad/$n"
exit 1
