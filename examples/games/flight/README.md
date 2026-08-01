# FLYBY — a 3D flying game in Milo

```bash
milo build examples/games/flight/main.milo -o /tmp/flyby --release && /tmp/flyby
```

| | |
|---|---|
| up / down | pitch — **up dives, down climbs**, like a stick |
| space | afterburner |
| M | music on / off |
| ESC | quit |

`--help` prints the lot.

**One axis.** Up and down is the whole control scheme — the aircraft banks and
steers itself onto the next hoop, so a small child can fly it. `--pro` gives back
the bank axis on left / right.

**Inverted by default.** The key you press is where you push the nose, which is
how a stick works and how flight sims map one. `--natural` flips it to up-climbs.

## Four real places, and you change place every ten rings

You are flying the real world from the first frame. Four places are **built into
the binary** — NASA SRTM terrain plus OpenStreetMap footprints extruded to their
real heights, ~3 MB of asset baked in with `@embedFile`:

| | |
|---|---|
| `sf` | San Francisco — hills, bay, downtown towers |
| `hongkong` | Hong Kong — harbour, peaks straight out of the water |
| `rio` | Rio de Janeiro — Sugarloaf, Corcovado, the beaches |
| `canyon` | the Grand Canyon — 755 buildings and 2,200 m of rock |

Every region change swaps the next one in, so a run crosses all four. Which one
you start on comes off the clock, so two launches are not the same flight. All
four are parsed at startup in about 5 ms — a swap mid-flight is two moves, not a
load, and nothing is fetched, read or decoded while flying.

```bash
/tmp/flyby --place hongkong                 # just that one, no rotation
/tmp/flyby --procedural                     # the endless generated world instead
/tmp/flyby --city path/to/other.city        # a place you built yourself
```

Each map is finite and the flight is not, so the world reflects at the edges
rather than wrapping — a mirror is continuous at the seam, a wrap is a cliff.

Terrain is NASA SRTM (public domain); buildings and land cover are ©
OpenStreetMap contributors under the [ODbL](https://www.openstreetmap.org/copyright)
— see [`cities/README.md`](cities/README.md), and for how to build an asset for
anywhere else.

Rings never spawn inside a building and the plane never flies through one: the
same "you cannot crash" push that lifts you off the ground lifts you over a
roof, and a hoop is placed above whatever stands under its span.

Fly **through the rings**, Pilotwings-style. A hoop standing across the course
tells you which way to be pointing when you reach it, which a coin never could.
Green brackets mark the next one, and an arrow pins to the screen edge pointing
the way to turn when it is behind you.

Clearing a ring throws a burst of sparks out around the hoop — thrown outward in
the ring's own plane, given gravity, and drawn as camera-facing billboards so they
read from any angle. Rings are laid ahead endlessly, and clearing them in
succession builds a multiplier.

**Every ten rings the country changes**: coastline, desert, forest, city. Each
theme reskins the terrain palette, the sky, the sun angle and the scenery —
palms, cactus, conifers, tower blocks.

**You cannot crash** — dive at the ground and it pushes you back up.

## This is a real 3D pipeline

Not a raycaster and not billboards. `gfx3d.milo` is about 260 lines and contains:

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
only blits the finished frame. **1280×720 at ~50 fps**, around 1,200 triangles a
frame after culling.

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

`unsafe` appears twice, both FFI: the SDL calls in `sdl.milo` and the texture upload
in `main.milo`. The rasteriser, the clipper, the z-buffer and the flight model
contain none — the depth buffer is a `Vec<f32>` and every access is bounds-checked.

## Headless

`shot.milo` flies a scripted pilot toward the nearest coin and dumps PPM frames,
reporting triangle count and render time:

```bash
milo run examples/games/flight/shot.milo --release -- /tmp/flyby 120 600
```
