#!/usr/bin/env bash
# Regenerates the game assets that are deliberately NOT in git: the FLYBY city
# files (82 MB of terrain, footprints and aerial drape) and the APSIS planet
# maps. Both are consumed by @embedFile at COMPILE time, so a missing asset is a
# build error, not a blank texture — run this before building those games.
#
# The city table below is the single source of truth for how each committed
# place was built: name, centre and radius, verbatim from the headers of the
# assets that used to be tracked. Change a row and you have made a different
# city, not repaired this one.
#
# Sources and licences (see examples/games/flight/cities/README.md):
#   - NASA SRTM elevation — public domain
#   - USGS Astrogeology / NASA GIBS imagery — public domain
#   - OpenStreetMap buildings, land cover, bridges — ODbL,
#     https://openstreetmap.org/copyright (FLYBY credits this in its HUD)
# No Google data is used anywhere; its terms forbid redistribution.
#
# Expect this to be slow and to fail sometimes. Overpass rate-limits and drops
# connections, so a full five-city run takes minutes and a failed city is
# usually cured by running the script again — it resumes, fetching only what is
# missing. A regenerated city will NOT be byte-identical to the one someone else
# fetched: OSM changes under it, so buildings appear and disappear over time.
# That is expected; it is a snapshot of a live database, not a fixed artifact.
#
# If the run guard kills a fetch ("exceeded N MB"), raise it for that run with
# MILO_RUN_MEM_MB=8192 — do not disable the guard.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CITY_DIR="$ROOT/examples/games/flight/cities"
BODY_DIR="$ROOT/examples/games/apsis/bodies"

# name|lat|lon|radius_m|basename — basename also names the sibling .ortho.png,
# which fetchcity derives from the -o path (not from --name).
CITIES=(
  "San Francisco|37.786|-122.41|8000|sf"
  "Manhattan|40.758|-73.978|6000|manhattan"
  "Honolulu|21.313|-157.888|9500|honolulu"
  "Yosemite Valley|37.745|-119.593|8000|yosemite"
  "Grand Canyon|36.07|-112.115|4500|canyon"
)

# fetchbody knows the sizes and the source mosaic for each of these; it writes
# straight into BODY_DIR itself. font.png lives there too but is a hand-made
# bitmap font, committed, and not fetched by anything.
BODIES=(mercury venus earth moon mars jupiter saturn)

doCities=0
doBodies=0
force=0

usage() {
  cat <<'EOF'
usage: scripts/fetch-assets.sh [--cities] [--bodies] [--force]

Fetches the generated game assets that are not committed to git.

  --cities   FLYBY city files only (examples/games/flight/cities)
  --bodies   APSIS planet maps only (examples/games/apsis/bodies)
  --force    refetch even if a valid file is already on disk
  --help     this text

With neither --cities nor --bodies, both are fetched. Existing valid files are
skipped, so re-running after a failure only refetches what is missing.

Cities go through Overpass, which is slow and rate-limited: a full run takes
minutes and may need a second pass. OSM moves under these, so a refetched city
differs from an older one by design.
EOF
}

for arg in "$@"; do
  case "$arg" in
    --cities) doCities=1 ;;
    --bodies) doBodies=1 ;;
    --force) force=1 ;;
    --help | -h)
      usage
      exit 0
      ;;
    *)
      echo "unknown flag: $arg" >&2
      usage >&2
      exit 2
      ;;
  esac
done
if [[ $doCities -eq 0 && $doBodies -eq 0 ]]; then
  doCities=1
  doBodies=1
fi

fetched=0
skipped=0
failed=0

# A truncated or error-page download is worse than no download: it satisfies the
# existence check on the next run and gets baked into a binary. Every output is
# checked for its magic bytes and a plausible size, and anything that fails is
# removed here rather than left to poison a later run.
validate() {
  local path="$1" wantMagic="$2" size magic
  [[ -f "$path" ]] || return 1
  size=$(wc -c <"$path" | tr -d ' ')
  if [[ $size -le 1024 ]]; then
    echo "  invalid: $path is $size bytes" >&2
    rm -f "$path"
    return 1
  fi
  magic=$(od -An -N8 -tx1 <"$path" | tr -d ' \n')
  if [[ "$magic" != "$wantMagic" ]]; then
    echo "  invalid: $path has magic $magic, expected $wantMagic" >&2
    rm -f "$path"
    return 1
  fi
  return 0
}

MAGIC_CITY=4d494c4f43495459 # MILOCITY
MAGIC_PNG=89504e470d0a1a0a  # \x89PNG\r\n\x1a\n

validateCity() { validate "$1" "$MAGIC_CITY"; }
validatePng() { validate "$1" "$MAGIC_PNG"; }

cd "$ROOT"

if [[ $doCities -eq 1 ]]; then
  mkdir -p "$CITY_DIR"
  for row in "${CITIES[@]}"; do
    IFS='|' read -r name lat lon radius base <<<"$row"
    city="$CITY_DIR/$base.city"
    ortho="$CITY_DIR/$base.ortho.png"

    cityOk=0
    orthoOk=0
    if validateCity "$city"; then cityOk=1; fi
    if validatePng "$ortho"; then orthoOk=1; fi

    if [[ $force -eq 0 && $cityOk -eq 1 && $orthoOk -eq 1 ]]; then
      echo "skip  $base.city + $base.ortho.png (already present)"
      skipped=$((skipped + 1))
      continue
    fi

    if [[ $force -eq 0 && $cityOk -eq 1 ]]; then
      # The drape is a separate download; --ortho re-reads the bounds out of the
      # existing .city, so a lost png costs one image instead of a fresh
      # multi-minute Overpass pass over a city that is already correct.
      echo "fetch $base.ortho.png (city already present)"
      if ! bun run src/main.ts run examples/games/flight/tools/fetchcity.milo -- --ortho "$city"; then
        echo "  FAILED: fetchcity --ortho exited non-zero for $base" >&2
        failed=$((failed + 1))
        continue
      fi
    else
      echo "fetch $base.city — $name ($lat, $lon) r=${radius}m"
      if ! bun run src/main.ts run examples/games/flight/tools/fetchcity.milo -- \
        --name "$name" --lat "$lat" --lon "$lon" --radius "$radius" -o "$city"; then
        echo "  FAILED: fetchcity exited non-zero for $base" >&2
        failed=$((failed + 1))
        continue
      fi
    fi

    # The ortho drape is a second download inside the same run and can fail on
    # its own, so both halves are checked before the city counts as fetched.
    if validateCity "$city" && validatePng "$ortho"; then
      fetched=$((fetched + 1))
    else
      echo "  FAILED: $base did not produce valid output" >&2
      failed=$((failed + 1))
    fi
  done
fi

if [[ $doBodies -eq 1 ]]; then
  mkdir -p "$BODY_DIR"
  for body in "${BODIES[@]}"; do
    png="$BODY_DIR/$body.png"

    if [[ $force -eq 0 ]] && validatePng "$png"; then
      echo "skip  $body.png (already present)"
      skipped=$((skipped + 1))
      continue
    fi

    echo "fetch $body.png"
    if ! bun run src/main.ts run examples/games/apsis/tools/fetchbody.milo -- "$body"; then
      echo "  FAILED: fetchbody exited non-zero for $body" >&2
      failed=$((failed + 1))
      continue
    fi

    # The WMS answers its own failures with HTTP 200 and an XML body, so the
    # download "succeeding" proves nothing about what landed on disk.
    if validatePng "$png"; then
      fetched=$((fetched + 1))
    else
      echo "  FAILED: $body.png missing or not a PNG" >&2
      failed=$((failed + 1))
    fi
  done
fi

echo
echo "assets: $fetched fetched, $skipped skipped, $failed failed"
if [[ $failed -gt 0 ]]; then
  echo "re-run to retry the failures — Overpass drops connections and a second pass usually gets them" >&2
  exit 1
fi
