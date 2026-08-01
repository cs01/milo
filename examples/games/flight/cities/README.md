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

Sea level is the DEM's own zero, so the coastline is the real one.

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

`--radius` is in metres, measured from the centre to the edge of the square. It
is the one number worth thinking about: cost grows with its square, and so does
the number of buildings Overpass has to return. 2000 m over downtown San
Francisco is ~15,600 buildings and a 1.3 MB asset.

Downloads are cached under `.cache/city/`, so re-running to tweak the extent
costs nothing but the reprojection. Delete that directory to force a refetch.
The public Overpass instances shed load by refusing requests outright; the tool
rotates over three mirrors and backs off, but a busy afternoon can still need a
second run.

Somewhere with hills and a waterfront gives you the most to look at — the flight
model reads terrain, and a flat inland grid is a flat inland grid.
