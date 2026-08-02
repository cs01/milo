# FLYBY — a 3D flying game in Milo

```bash
milo build examples/games/flight/main.milo -o /tmp/flyby --release && /tmp/flyby
```

| | |
|---|---|
| up / down | pitch — **up dives, down climbs**, like a stick |
| space | afterburner — hold it as long as you like |
| M | music on / off |
| ESC | quit |

`--help` prints the lot.

**One axis.** Up and down is the whole control scheme — the aircraft banks and
steers itself onto the next hoop, so a small child can fly it. `--pro` gives back
the bank axis on left / right.

**Inverted by default.** The key you press is where you push the nose, which is
how a stick works and how flight sims map one. `--natural` flips it to up-climbs.

## Five real places, and you change place every ten rings

You are flying the real world from the first frame. Five places are **built into
the binary** — NASA SRTM terrain, OpenStreetMap footprints extruded to their real
heights, OSM bridges, and an aerial photograph draped over the lot:

| | |
|---|---|
| `sf` | San Francisco — hills, bay, and both bridges |
| `manhattan` | Manhattan — the densest skyline there is, and the East River crossings |
| `yosemite` | Yosemite Valley — El Capitan, Half Dome, granite |
| `canyon` | the Grand Canyon — no buildings at all, just the rock |
| `honolulu` | Honolulu — a skyline with a volcano behind it, and reef below |

Every region change swaps the next one in, so a run crosses all five. Which one
you start on comes off the clock, so two launches are not the same flight.
Exactly one is decoded at a time: preloading all of them held ~290 MB of parsed
footprints and imagery and got the process killed by the run guard, and decoding
on the key press costs a beat. Nothing is fetched or read from disk while flying.

All five are in the United States, and that is a licensing constraint rather than
a taste: the aerial imagery that can legally be redistributed is USGS and USDA,
and the open global alternative (Sentinel-2 via EOX) serves JPEG, which nothing
here can decode. Hong Kong and Rio were dropped rather than be the only two
flat-shaded places.

```bash
/tmp/flyby --place honolulu                 # just that one, no rotation
/tmp/flyby --procedural                     # the endless generated world instead
/tmp/flyby --city path/to/other.city        # a place you built yourself
```

Each map is finite and the flight is not, so the world reflects at the edges
rather than wrapping — a mirror is continuous at the seam, a wrap is a cliff.

Terrain is NASA SRTM (public domain); buildings and land cover are ©
OpenStreetMap contributors under the [ODbL](https://www.openstreetmap.org/copyright)
— see [`cities/README.md`](cities/README.md), and for how to build an asset for
anywhere else.

Over a real place, **the landmark is the target**: a column of light stands on it,
and flying over the circle on the ground at any height and any heading collects
it. The beam is drawn additively after the geometry, so it shows through the ridge
or the tower block in the way — over a city, something usually is.

That replaced a hoop placed 900 m short of the landmark and faced along the
bearing from the previous one, so that flying through it left the nose pointed at
the subject. Lovely framing, and it silently required consecutive landmarks to be
kilometres apart. Honolulu's are not — Aloha Tower to the ʻIolani Palace is 800 m
— so the hoop landed *behind* the landmark you had just left, unreachable, with no
way to advance the tour. A beacon also arms only once you have been outside its
radius, because you spawn 235 m from Honolulu's first one and would otherwise
collect it before touching a key.

Five per place, listed down the right of the screen and ticked off as you reach
them, each with the time that leg took. The clock is per landmark rather than
cumulative: "how long did that one take" is a number worth beating, a running
total is not. Under the list is the name of the next region and nothing else —
knowing there is more is the reason to finish these five; knowing what is in it
is the reason to skip them. Find all five and the next region comes in on its
own.

Arriving hands the camera to an orbit that makes exactly one revolution of the
subject, with its name, one fact about it, and what it cost you. The rate is
TAU / SHOW_LEN rather than a fixed number, so the sweep is a full circle whatever
the shot's length. It starts at the bearing you arrived on and eases in and out of
your own camera over 1.6 s at each end — it used to cut to due north and cut back,
which is two hard jumps in a shot whose whole job is to show you something.

The arrival orbit also has to be able to SEE the landmark. A fixed height above
the subject is only enough where the subject is the highest thing around — half
the Grand Canyon tour is below the rim, and a circle 320 m over Indian Garden
spends a third of its sweep inside the wall behind it. `orbitHeight` raises the
camera until it is above its own ground and until the straight line to the subject
clears everything between; because it only ever raises, one forward pass along the
line is enough. Height alone then turns the shot into a top-down map, so the
circle also widens until the depression angle is back under about 40 degrees.

Opening a place runs the same machinery in reverse: the camera starts a kilometre
up and two kilometres out, sweeps three quarters of a turn around the parked
aircraft and descends into the chase pose, arriving on it exactly rather than
cutting. It is held inside the terrain draw distance and pushes the haze out to
the far plane while it runs — a survey from three kilometres up is a white screen,
because every fog preset finishes at 1.7 km. Any stick input skips it.

With no place named on the command line, the game opens on a start screen listing
the five regions with one line each. It lives in `menu.milo` and runs its own
loop rather than becoming a mode inside the flight loop: the flight loop's job is
to step a simulation sixty times a second, and there is no simulation yet — the
place has not been decoded, which is the whole point of asking first. `drawMenu`
takes a Canvas and nothing else, so the headless capture tool renders the screen
exactly as the game does.

Over the invented world it is still hoops. Rings never spawn inside a building and
the plane never flies through one: the same "you cannot crash" push that lifts you
off the ground lifts you over a roof, and a hoop is placed above whatever stands
under its span. Green brackets mark the next one, and an arrow pins to the screen
edge pointing the way to turn when it is behind you.

Clearing a ring throws a burst of sparks out around the hoop — thrown outward in
the ring's own plane, given gravity, and drawn as camera-facing billboards so they
read from any angle. Rings are laid ahead endlessly, and clearing them in
succession builds a multiplier.

**Every ten rings the country changes**: coastline, desert, forest, city. Each
theme reskins the terrain palette, the sky, the sun angle and the scenery —
palms, cactus, conifers, tower blocks.

**You cannot crash** — dive at the ground and it pushes you back up.

## This is a real 3D pipeline

Not a raycaster and not billboards. `gfx3d.milo` and `raster.milo` contain:

- a **perspective camera** with yaw, pitch and roll, built into a view basis once
  per frame
- **near-plane clipping** (Sutherland–Hodgman against the single plane), which
  matters the moment you fly low: a triangle straddling the camera plane projects
  to garbage without it
- a **depth-buffered triangle rasteriser** — bounding box plus edge functions,
  interpolating `1/z` because that is what is linear in screen space
- flat **Lambert shading** against a sun direction, and linear **distance fog**
  toward the sky colour

The terrain is a three-octave value-noise heightmap turned into quads on the fly.
Rings are tubes of quads swept around a circle, drawn from both faces. Scenery is
placed one prop per terrain tile from a stable hash, so it does not crawl as you
fly, and built from two primitives — a box and a cone. The aircraft is 17 triangles — fuselage shells, swept wings, tailplane, fin and
canopy — built from body-space `(forward, right, up)` offsets so the shape is easy
to read and to change.

Everything renders on the CPU into the same HDR float canvas the 2D games use; SDL
only blits the finished frame. ~22,000 triangles a frame after culling over a real
city, and about 900,000 pixels shaded, which is where the time actually goes.

## Every core, by scanline band

A scanline rasteriser is embarrassingly parallel — cut the frame into horizontal
bands and no two threads ever touch the same pixel — so it runs on all of them.

The frame is drawn in two halves. `gfx3d.milo` transforms, near-clips and sets each
triangle up, then **records** it into a command list and files it under every band
its bounding box touches. `rasterFlush` hands the list to one `Promise.blocking` OS
thread per band. Nothing above that line changes: a `triangleV` call still looks
like a draw call.

Recording is what makes the split possible at all. A worker cannot be handed the
World, the City or a `Texture` — they own heap, and Milo's second-class `&mut [f32]`
cannot cross a thread boundary either — so a draw command is flattened to plain
scalars first, and the buffers are passed as base addresses. That is the only
`unsafe` in the renderer, about thirty lines of it, with the disjointness argument
written out at `raster.bandRaster`. The runtime-`n` `splitMut` that would let this
be written safely is still unbuilt (`docs/roadmap.md`); when it lands, this is the
shape it has to replace.

The composite pass — a million pixels of bloom, tone curve and pack — fans out the
same way. The bloom chain above it does not: it is nine passes over 57k pixels and
nine thread spawns cost more than the passes do.

`FLYBY_BANDS` overrides the band count; `FLYBY_BANDS=1` is the serial renderer.
On an M4 (10 cores), 1280×720 over San Francisco, same binary:

| | `FLYBY_BANDS=1` | default (10) |
|---|---|---|
| raster kernel | 14 ms | 3 ms |
| bloom + composite | 7 ms | 4 ms |
| **whole frame** | **26 ms** | **13 ms** |

Output is bit-identical: six captured frames, 2.7 MB each, zero differing bytes at
1, 3 and 10 bands. That is the test that matters — a band boundary that is off by a
row is a handful of wrong pixels, and a tolerance would pass it.

```bash
FLYBY_BANDS=1 ./shot /tmp/a --city cities/sf.city 200 320 440
              ./shot /tmp/b --city cities/sf.city 200 320 440
cmp /tmp/a-200.ppm /tmp/b-200.ppm
```

## Bridges

A bridge is the one thing in a city that is not on the ground, and the terrain grid
does not know it is there: SRTM samples the *water* under the Golden Gate, not the
deck over it. Two of San Francisco's nine landmarks are bridges, and both used to be
a hoop over open water.

OSM knows a bridge exists and knows nothing about how high it is — `layer=1` means
"above the thing it crosses", not "67 metres above the sea". So the deck height is a
heuristic, computed at load from the city's own terrain, and its only real input is
how much water the way crosses:

```
deck(t) = land(t)·(1−a) + max(land(t), clearance)·a,   a = sin(πt)
clearance = 5 + 1.9·(√span − √60), capped at 70 m
```

A square root, not a straight line: clearance is set by the ships that pass
underneath, and ships stop getting taller long before crossings stop getting wider.
The Brooklyn Bridge comes out at 39 m against a real 41, the Golden Gate at 68
against 67.

Two things in the OSM data had to be handled before any of that worked:

- **The main span has no nodes.** OSM digitises a bridge the way a surveyor walks
  it, so the Golden Gate's approach viaducts carry a node every fifteen metres and
  its 2.3 km main span carries none — one segment between two points on dry land.
  Every sampled point was on the ground, the height pass found no water, and the
  bridge came out flat. Ways are resampled at even spacing before anything reads
  them.
- **A dual carriageway is two ways.** Eight metres apart, each fourteen metres wide,
  z-fighting into a dashed line. They are merged into one deck wide enough to cover
  both — 30 m for the Golden Gate against a real 27.

## What an imagery service does instead of an error

An aerial drape is fetched for the asset's exact extent, and outside its coverage
the service does not fail — it draws the gap, in two different colours. The
National Map basemap answers exact black where a tile is missing and an exact
`(253,253,253)` band where the mosaic stops. Over Honolulu that is 8% and 14% of
the square, all of it open Pacific, and draping it puts a black hole and a sheet
of concrete on the sea.

Both are flat, uniform and exact, which is what makes them safe to key on: across
four million texels the four mainland drapes contain not one pixel of either.

What goes in the gap is solved, not smeared, and solved **from the sea**. Two
earlier attempts got that second half wrong — carrying the last real texel along
each row painted the ocean in the service's own edge haze, and relaxing from
whatever bordered the hole was smoother and just as wrong, because a coverage
boundary runs along a coastline and most of what borders it is surf, sand and
runway. The DEM settles it: it carries real bathymetry, so the asset already knows
which parts of the picture are deep sea, and only those cells constrain the solve.

Given the boundary it is Laplace inpainting — relax toward the average of the
neighbours, iterated, holding the sea fixed — on a coarse grid, because
information travels one cell per pass and the hole is a fifth of the picture.

Colour and structure come from the tags rather than from a table of famous bridges:
the Golden Gate carries `colour=orange` and `bridge:structure=suspension` in OSM,
which is why it is International Orange and has towers.

## Sound

`sound.milo` opens an SDL audio device and pushes generated PCM at it — no assets,
no callback thread. Every sound is a decaying sine with optional pitch slide, built
once at startup: a two-note chime for a ring, a brighter three-note one for a blue
bonus hoop, a rising fanfare when the country changes, filtered noise for the
afterburner, and a falling minor third when a streak breaks.

The simulation never mentions audio. It sets one-frame event flags (`evRing`,
`evRegion`, `evMiss`) and the main loop turns those into sounds, so the game logic
stays testable headless.

## Two things worth pointing at

**Vertices are a struct, not 25 loose parameters.** The textured rasteriser
originally took position, UV and light as separate `f64` arguments — 25 of them —
and transposing two was a mistake made three separate times while writing this
file. `Vtx` costs nothing at runtime and makes it unrepresentable. A map keyed by
name would fix it too, and would put a hash lookup in the innermost loop of the
program.

**Smooth shading is why it stopped looking like squares.** Normals are sampled per
terrain corner by central difference and the light term is interpolated across each
triangle, so a curved hill reads as curved at the same triangle count. Flat shading
was the whole reason the ground looked tiled.

**Front-to-back drawing.** Terrain quads are visited in rings outward from the
camera tile rather than in row order. Near ground covers the screen several times
over, and with the near geometry laid down first the z-buffer rejects hidden pixels
with a single compare instead of shading them. That is most of the frame budget.

**Ring passing is a plane crossing, not a distance test.** The sign of
`dot(plane − ring, ringNormal)` is tracked per ring; when it flips and the radial
offset was inside the hoop, it counts. A distance test misses at 190 units/second.

**A bug the headless harness caught.** `layRing` originally placed each new ring
relative to the last element of the ring `Vec`. But that Vec is swap-removed, so its
last element is not the newest ring — laying from it could place one *behind* the
aircraft, which was then dropped for being behind, which laid another. An infinite
loop on frame one. The trail head is now its own field, and rings are laid after the
sweep rather than during it.

Worth being clear about what that bug was: the memory was valid, owned and alive
throughout. It was the wrong *element*, not a dangling reference. Lifetimes would
not have caught it, and neither would generational handles — nothing was being held
across the removal. It is a domain invariant, and the fix was to stop asking the
container a question it could not answer.

## Safety

`unsafe` appears in three places. Two are FFI: the SDL calls in `sdl.milo` and
`sound.milo`, and the texture upload in `main.milo`. The third is the band split in
`raster.milo` and the composite pass in `gfx.milo`, where a worker thread re-derives
a typed pointer from a buffer's base address — see "Every core" above for why, and
`raster.bandRaster` for the argument that it is sound.

The clipper, the triangle setup, the geometry and the flight model contain none.

## Headless

`shot.milo` flies a scripted pilot toward the nearest coin and dumps PPM frames,
reporting triangle count and render time:

```bash
milo run examples/games/flight/shot.milo --release -- /tmp/flyby 120 600
```

`--at <x> <z> <altitude> <yawDegrees>` points the camera at a fixed spot instead of
wherever the scripted flight ended up, which is how you review one landmark without
flying to it:

```bash
milo run examples/games/flight/shot.milo --release -- /tmp/gg \
    --city examples/games/flight/cities/sf.city --at -4600 3300 300 300 40
```
