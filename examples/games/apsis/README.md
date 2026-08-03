# APSIS

You can be a rocket scientist too. Six trips, from the Moon out to Saturn, one
transfer each: look at where you are leaving, look at where you are going, pull
back until both orbits fit on the screen, then turn two dials — when you leave,
and how long you take — until the burn fits in the tank. Then fly the arc you
drew.

```bash
milo build examples/games/apsis/main.milo -o /tmp/apsis --release && /tmp/apsis
```

`LEFT`/`RIGHT` sets the departure date and `UP`/`DOWN` the flight time; `S` finds
the cheapest plan in the window, `ENTER` launches. In flight `[` and `]` change
the clock and `SPACE` holds it. Drag to turn the camera, scroll to zoom, `1`-`6`
jump to a mission, `R` restarts one, `H` is help, `F` fullscreen, `Q` quits.

## What is real

- The planets are on rails from Standish's Keplerian elements, and the Moon from
  the largest periodic terms of the lunar theory — so launch windows are windows,
  not a timer.
- Nothing is dated in advance. Every mission is calibrated when you start it, by
  searching forward from **today** for the next real opportunity; the window is
  hung around what it finds and the tank is sized from it, so the trip you are
  offered is one you could still book and the difficulty does not depend on which
  year you play.
- The transfer is a Lambert solution about the real central mass, and the two
  burns are priced the way a mission designer prices them: escape from a circular
  parking orbit onto a hyperbola with the excess the transfer needs, and capture
  at periapsis onto the ellipse the mission names.
- The arc drawn on the map is walked by the same propagator the ship flies, so
  the prediction and the flight cannot disagree.

Nothing is tuned for playability except the size of the tank.

```bash
milo run examples/games/apsis/tools/checkmissions.milo   # prices every mission
milo run examples/games/apsis/tools/checklayout.milo     # projects every phase, without a window
milo run examples/games/apsis/tools/scan.milo            # sweeps wider than any window, for tuning
```

`--shot out.png --mission N --phase depart|target|plan|fly|arrived` captures a
frame, which is how the look gets checked from a terminal.

## Rendering

GPU, OpenGL 3.3 core: textured spheres with faked relief, a limb-scattering
atmosphere shell, Saturn's rings with the planet's shadow across them, a
procedural star field, and a bloom chain in linear light. The whole interface —
orbit hairlines, the transfer arc, markers, panels, type — is one batched vertex
buffer and one draw call.

One camera covers a parking orbit and Saturn's. It manages six orders of
magnitude by making every position relative to what it is looking at and dividing
by how far away it is, so the eye is always at distance one; below a couple of
pixels a world stops being a sphere and becomes a marker on the map.

Surface maps are public-domain USGS and NASA mosaics, shared with
`../atlas`; `tools/fetchbody.milo` downloads them.
