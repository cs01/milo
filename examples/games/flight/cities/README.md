# Real cities

A `.city` file is a real place in one asset FLYBY loads: NASA SRTM
elevation, OSM footprints extruded to their tagged heights, OSM land cover and
bridges, and an aerial drape, `<name>.ortho.png`.

Terrain and imagery are US public domain. Buildings and land cover
© OpenStreetMap contributors, [ODbL](https://openstreetmap.org/copyright) — the
HUD credits this in game. Google data is not used; its terms forbid it.

Build one with `../tools/fetchcity.milo --lat --lon --radius`.
