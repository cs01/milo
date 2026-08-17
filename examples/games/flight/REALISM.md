# FLYBY — real sky, real light

Two goals, one system. The game should look like a photograph, and the sky over
the city should be *the sky that is actually over that city right now* — the same
clouds at the same altitudes, so a cloud you can see out of the window is a cloud
you can fly over.

The second goal is what makes the first one affordable. Overcast light, wet
ground, rain shafts and cloud shadows are the cheapest photorealism available:
they are what a camera actually sees, and none of them are modelling work.

## Where the picture falls short today

Measured off `gpushot.milo` frames, not guessed:

1. **No cast shadows anywhere.** Every building is a Lambert term and nothing
   else. A real city read from the air is mostly shadow — the avenues are
   canyons. This is the single largest gap and nothing else closes it.
2. **Aerial perspective washes to white by ~1 km.** Contrast is gone at
   mid-distance. Real haze is blue-shifted and much weaker than what
   `fogStart/fogEnd` currently apply.
3. **The ortho drape is 7.8 m/px** — `ORTHO_PX = 2048` over a 16 km square.
   NAIP is natively ~1 m/px through the same USGS endpoint.
4. **Terrain quads are 110 m against 30 m DEM posts**, so cliffs smooth into
   hills.
5. **Draw distance is 4.4 km**, so from above the cloud layer the ground beyond
   that is not drawn at all and the view down is a grey void.

Two things that were on this list and should not have been: buildings already
carry a window-grid façade texture (`textures.facadeTexture`, eight storeys by
eight bays) and already take their roof colour from the drape they stand on
(`prism` in `render3d.milo`). Checked, not assumed.

## The sky is not a sky

`cloudDeck` in `sky.milo` projects a noise field onto a plane at infinity. It is
a good cheap sky and it cannot ever be the thing asked for here: it has no
altitude, so it cannot be flown over, flown through, or lit from below at dusk,
and it is in a different place for every observer.

Real clouds need a real volume: a slab with a base and a top, in world metres,
raymarched from the camera, occluded by the depth already in `world.a`.

## Data

All public, keyless, redistributable. No Google (terms forbid it), same rule the
city assets already follow.

| Quantity | Source | Note |
|---|---|---|
| Cloud top height | GOES-18/19 ABI Band 13 (10.3 µm) | Brightness temp IS cloud-top temp; lapse rate inverts it to metres. This is what makes "fly over it" correct. |
| Cloud coverage | Same image, thresholded | Cold = cloud. |
| Cloud base | METAR ceiling from NWS obs, else LCL | LCL ≈ 125 m × (T − Td) °C |
| Precipitation | NEXRAD via Iowa Mesonet WMS | Request the city bbox directly; the CONUS composite is 500 m/px and a city is 32 px of it. |
| Surface obs | NWS API `/points` → station | temp, dewpoint, wind, visibility |
| Sun | Computed from lat/lon + real UTC | Not data — arithmetic. |

`City` already carries `originLat`/`originLon`, so every field above samples in
world coordinates with no new plumbing.

Coverage caveat: the Mesonet CONUS composite bbox is 23–50N, 126–65W, which
excludes Honolulu. Hawaii has its own NEXRAD sites and its own composite; a
place outside all of them falls back to synthetic weather rather than to an
empty sky.

## Status

Done, each verified against a rendered frame rather than by inspection:

- Real solar position, checked against six known cases including Honolulu at the
  June solstice, where the noon sun is slightly NORTH.
- Aerial perspective as exponential extinction with the exact atmospheric
  integral along the ray.
- Shadow maps over terrain and buildings.
- Volumetric clouds with a real base and top: under, inside and above all render
  correctly.
- Live weather from station, satellite and radar.
- Cloud shadows on the ground, measured at 11.8% of pixels changed.
- Rain shafts under radar returns.

- Draw distance scaled to altitude, so the view from 3 km is 17 km of world for
  the same triangle count.
- The aerial drape at 3.9 m/px, stitched from four requests because the export
  service caps one at 2048 px.
- Station and hour on the HUD, and live weather refetched at every place change.

- A quarter-tile terrain tier over the three rings nearest the camera, so the
  mesh finally samples finer than the 30 m elevation data instead of stepping
  over every other post.
- Weather refetched on a green task once every five minutes, yielded to once a
  frame. Measured at 400 ms to complete with a 20 ms worst-case yield.

Everything in the plan is done. What is left is not on it: the drape could go to
1 m/px (sixteen requests, a 200 MB texture — the stitching machinery exists and
only the constant changes), and cloud top height remains the one estimated
quantity in the chain.

## What is measured and what is not

Worth keeping straight, because a rendered sky looks equally convincing either
way:

- MEASURED: cloud amount, cloud base, wind, visibility, temperature, and where
  precipitation is falling.
- MEASURED but coarse: the horizontal structure of cloud, from infrared at about
  4 km, and only when the cloud is cold enough to be seen at all.
- ESTIMATED: cloud top height. The greyscale-to-temperature calibration of the
  public composite is not published; the ramp direction was established
  empirically and the conversion to altitude assumes a lapse rate.
- INVENTED: everything, when a fetch fails or no station reports. The HUD says
  so in those words.

## Order of work

Each step is verified by a `gpushot.milo` frame before the next one starts.

1. **Real solar position** — lat/lon + UTC → sun vector. Foundation for
   everything: shadows point the wrong way without it, and "matches my window"
   is meaningless without it.
2. **Aerial perspective rework** — recover mid-distance contrast.
3. **Shadow maps** — sun-direction depth pass over terrain and buildings.
4. **Volumetric clouds** — raymarched slab with real base/top, driven first by a
   synthetic field so the renderer can be finished independently of the network.
5. **Live data** — fetch the fields above and feed step 4.
6. **Cloud shadows** — falls out of 3 + 4 together, and is most of what sells an
   overcast day.
7. **Façades and roof colour** from the drape.
8. **Ortho resolution.**
9. **Terrain LOD.**

## Rules this work keeps

- The network is never on the frame path. Fetching happens off the render loop
  and the sky is whatever the last good fetch said; a failed fetch keeps the
  previous field and, on a cold start, uses the synthetic one.
- No key, no account, no terms that forbid redistribution.
- A place with no data available gets honest synthetic weather, never a
  plausible-looking fabrication presented as live.
