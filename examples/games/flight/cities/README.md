# Real cities

A `.city` file is a real place in one asset FLYBY loads: NASA SRTM
elevation, OSM footprints extruded to their tagged heights, OSM land cover and
bridges, and an aerial drape, `<name>.ortho.png`.

**These files are not in git.** They are a few hundred MB of downloaded data,
fetched on demand:

```bash
scripts/fetch-assets.sh --cities
```

Overpass is slow and rate-limited, so expect minutes and the odd retry. The
result will not match anyone else's byte for byte — OSM moves under it.

The drape is 4096 px square, stitched from a 2x2 grid of requests — the USGS
export service refuses a single request above 2048 px, answering 4096 with a 500.
That is 3.9 m a pixel over a 16 km asset, against the 7.8 m one request gives.

`fetchcity` skips a drape that already exists, so a checkout carrying the older
2048 px imagery keeps it. To take the sharper one, delete the `.ortho.png` and
re-run `../tools/fetchcity.milo --ortho <name>.city`, which refetches only the
imagery and leaves the `.city` alone.

Terrain and imagery are US public domain. Buildings and land cover
© OpenStreetMap contributors, [ODbL](https://openstreetmap.org/copyright) — the
HUD credits this in game. Google data is not used; its terms forbid it.

`scripts/fetch-assets.sh` carries the centre and radius each committed place was
built from. To make a new one, `../tools/fetchcity.milo --name --lat --lon
--radius -o <path>`.
