# FLYBY — a 3D flying game in Milo

```bash
milo build examples/games/flight/main.milo -o /tmp/flyby --release && /tmp/flyby
```

| | |
|---|---|
| left / right | bank — a banked aircraft turns |
| up / down | climb and dive |
| space | throttle up |
| ESC | quit |

Fly through the coins. **Green brackets mark the next one**, and an arrow pins to
the edge of the screen pointing the way to turn when it is behind you — the trail
is easy to lose the moment you overshoot. Every coin you take lays another further
along, so it never runs out, and taking them in quick succession builds a
multiplier. **You cannot crash** — dive at the ground and it pushes you back up.

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
Coins are 12-gon discs spinning about their vertical axis, drawn from both sides so
they never disappear edge-on. The aircraft is 17 triangles — fuselage shells, swept wings, tailplane, fin and
canopy — built from body-space `(forward, right, up)` offsets so the shape is easy
to read and to change.

Everything renders on the CPU into the same HDR float canvas the 2D games use; SDL
only blits the finished frame. **1280×720 at ~50 fps**, around 1,200 triangles a
frame after culling.

## Two things worth pointing at

**Front-to-back drawing.** Terrain quads are visited in rings outward from the
camera tile rather than in row order. Near ground covers the screen several times
over, and with the near geometry laid down first the z-buffer rejects hidden pixels
with a single compare instead of shading them. That is most of the frame budget.

**A bug the headless harness caught.** `layCoin` originally placed each new coin
relative to the last element of the coin `Vec`. But that Vec is swap-removed, so its
last element is not the newest coin — laying from it could place a coin *behind* the
aircraft, which was then dropped for being behind, which laid another. An infinite
loop on frame one. The trail head is now kept as its own field, and coins are laid
after the sweep rather than during it.

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
