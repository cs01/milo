# Real cities

A `.city` file is a real place in one asset FLYBY loads: NASA SRTM
elevation, OSM footprints extruded to their tagged heights, OSM land cover and
bridges, and an aerial drape, `<name>.ortho.png`.

**These files are not in git.** They are 80 MB of downloaded data, fetched on
demand:

```bash
scripts/fetch-assets.sh --cities
```

Overpass is slow and rate-limited, so expect minutes and the odd retry. The
result will not match anyone else's byte for byte — OSM moves under it.

Terrain and imagery are US public domain. Buildings and land cover
© OpenStreetMap contributors, [ODbL](https://openstreetmap.org/copyright) — the
HUD credits this in game. Google data is not used; its terms forbid it.

`scripts/fetch-assets.sh` carries the centre and radius each committed place was
built from. To make a new one, `../tools/fetchcity.milo --name --lat --lon
--radius -o <path>`.
