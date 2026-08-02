# Real cities

A `.city` file is a real place, packed into one binary asset that FLYBY loads
once at startup:

- **terrain** — NASA SRTM 1-arcsecond elevation (~30 m posts), resampled onto a
  local metre grid. Public domain. Fetched from the AWS Open Data
  [Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) bucket in Skadi
  layout.
- **buildings** — OpenStreetMap footprints with their `height` /
  `building:levels` tags, extruded to their real heights.
- **land cover** — OSM parks, woods, beaches and inland water, rasterised into a
  grid the terrain shader samples per vertex.
- **imagery** — an aerial photograph of exactly the asset's extent, written
  beside it as `<name>.ortho.png` and draped over the terrain. NAIP 1 m where it
  reaches (it is a USDA farm survey, so CONUS only); the USGS National Map
  orthoimagery basemap elsewhere, which is what covers Hawaii. Both are US
  government products and public domain.
- **bridges** — OSM ways tagged `bridge=yes`, kept as open polylines with their
  width, colour and structure. Their own layer because the terrain grid cannot
  carry them: SRTM samples the water under a bridge, not the deck over it. Deck
  height is derived from the terrain at load time, not stored — see the flight
  README for the heuristic.

Sea level is the DEM's own zero, so the coastline is the real one.

An asset is a square, and a square drawn around a downtown does not always reach
the thing next to it. `honolulu.city` is 16 km centred on the harbour, which puts
Battleship Row about 1.4 km past its western edge — so FLYBY's PEARL HARBOR beacon
stands on East Loch off Aiea, which the map does reach, rather than on a mirrored
copy of the far side. Widening the square to hold both Pearl Harbor and Diamond
Head means a refetch at `--lat 21.313 --lon -157.888 --radius 9500`, and a 1.4x
bigger asset and drape.

## Attribution

Building and land-cover data © OpenStreetMap contributors, available under the
[Open Database License](https://www.openstreetmap.org/copyright). The in-game
HUD carries this credit whenever a city is loaded.

Google's map, imagery and elevation data is deliberately **not** used: their
terms forbid bulk download and redistribution, so an asset built from it could
not be checked in or shipped. SRTM + OSM is what open 3D city renderers are
built on anyway, and it is the same data behind the real skyline you fly over
here — the tallest building in `sf.city` comes out at 326 m, which is Salesforce
Tower to the metre.

## Flying one

```bash
milo build examples/games/flight/main.milo -o /tmp/flyby --release
/tmp/flyby --city examples/games/flight/cities/sf.city
```

Nothing is fetched while flying. The asset is read once before the window opens.

The map is finite and the flight is not, so the world **reflects** at the edges:
cross the eastern boundary and you come back over the same city heading west.
A reflection rather than a wrap — joining the far edge to the near one would put
a cliff and a visible seam at every crossing, while a mirror is continuous
there by construction.

## Building a new one

```bash
milo run examples/games/flight/tools/fetchcity.milo -- \
    --name "San Francisco" --lat 37.7860 --lon -122.4100 --radius 2000 \
    -o examples/games/flight/cities/sf.city
```

Adding a layer to an asset you already have does not mean refetching it. `--update`
queries only the bridge layer and splices it onto the existing file; everything
before that section is copied across byte for byte, so a hundred thousand building
footprints and a terrain grid stay exactly what they were:

```bash
milo run examples/games/flight/tools/fetchcity.milo -- \
    --update examples/games/flight/cities/sf.city    # bridges only
milo run examples/games/flight/tools/fetchcity.milo -- \
    --ortho examples/games/flight/cities/sf.city     # the drape only
```

`--radius` is in metres, measured from the centre to the edge of the square. It
is the one number worth thinking about: cost grows with its square, and so does
the number of buildings Overpass has to return. 2000 m over downtown San
Francisco is ~15,600 buildings and a 1.3 MB asset.

`--parts` re-derives the building layer alone — the cached OSM response plus a
fresh `building:part` query — and splices it back in. Everything else in the file
is copied byte for byte, and it refuses to write if the rescan does not reproduce
the building count it is replacing:

```bash
milo run examples/games/flight/tools/fetchcity.milo -- \
    --parts examples/games/flight/cities/sf.city
```

Downloads are cached under `.cache/city/`, so re-running to tweak the extent
costs nothing but the reprojection. Delete that directory to force a refetch.
The public Overpass instances shed load by refusing requests outright; the tool
rotates over three mirrors and backs off, but a busy afternoon can still need a
second run.

Somewhere with hills and a waterfront gives you the most to look at — the flight
model reads terrain, and a flat inland grid is a flat inland grid.
