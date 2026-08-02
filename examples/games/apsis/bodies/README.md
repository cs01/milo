# Planet maps

Equirectangular surface maps, one per body, downloaded by
[`../tools/fetchbody.milo`](../tools/fetchbody.milo) and embedded into the binary
by [`../assets.milo`](../assets.milo).

Every image here is **public domain**. NASA and USGS products are not subject to
copyright in the United States; attribution is a courtesy rather than a licence
condition, and it is given below.

| File | Source | Instrument |
|---|---|---|
| `mercury.png` | USGS Astrogeology, `MESSENGER_Color` | MESSENGER MDIS |
| `venus.png` | USGS Astrogeology, `MAGELLAN_color` | Magellan radar, Venera colour |
| `earth.png` | NASA GIBS, `BlueMarble_ShadedRelief_Bathymetry` | MODIS |
| `moon.png` | USGS Astrogeology, `LROC_WAC` | Lunar Reconnaissance Orbiter |
| `mars.png` | USGS Astrogeology, `MDIM21_color` | Viking Orbiter |
| `jupiter.png` | USGS Astrogeology, `CASSINI` | Cassini ISS |
| `saturn.png` | USGS Astrogeology, `CASSINI` | Cassini ISS |

Google's imagery is deliberately not used: their terms forbid bulk download and
redistribution, so an asset built from it could not ship in this repository.

## Why they are square

They are equirectangular maps of a 2:1 domain, requested at 1:1 and therefore
stretched. That is deliberate. The renderer's texture sampler masks both axes
with `w - 1` (see [`../raster.milo`](../raster.milo)), so a non-square texture
reads its rows off the end of the buffer. Asking the WMS server to stretch the
projection costs nothing — latitude and longitude still map linearly to pixels,
which is all the sphere's UV mapping needs.

Earth and Mars are 2048²; the player gets close enough to fill the screen with
them. The rest are 1024², which is already more texels than pixels at any
distance the game shows them from.

## Re-downloading

```bash
milo run examples/games/apsis/tools/fetchbody.milo          # all of them
milo run examples/games/apsis/tools/fetchbody.milo -- mars  # just one
```

The two traps, both of which cost an afternoon: `STYLES=` must be present and
empty or MapServer 8 rejects the request (with HTTP 200 and an XML body, so it
looks like a successful download until something tries to decode it), and the
Moon lives under `/maps/earth/`, not `/maps/moon/`.
