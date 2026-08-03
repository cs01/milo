# FLYBY

Fly SF, Manhattan, Yosemite, the Grand Canyon and Honolulu — real places from
SRTM terrain, OSM buildings and aerial imagery, baked into the binary.

```bash
milo build examples/games/flight/main.milo -o /tmp/flyby --release && /tmp/flyby
```

UP/DOWN pitch (up dives; `--natural` flips), LEFT/RIGHT bank, SPACE burner,
ENTER elsewhere, F fullscreen, ESC quit.

Five landmarks each, under a blue beam; find them all and the next place comes
in.

Everything renders on the GPU and it needs an OpenGL 3.3 core context — there is
no software fallback. There used to be one, behind `--cpu`, and losing it is a
real cost: a machine without 3.3 core now gets an error at startup rather than a
slower picture. It bought the sky. One `skyColor` function now answers the sky
pass, the distance haze and the sea reflection, so all three agree by
construction — which they could not while every visual change had to land twice
and look the same both times, and which is why the sea used to reflect a flat
grey sheet and look like one.

The scene renders at the window's own size, so a bigger window draws more pixels
instead of scaling up a fixed frame. `--ss` renders at twice that and downsamples,
which is what thin building edges over a city want.

The software rasteriser it used to have is not deleted — it lives in
[benchmarks/softraster](../../../benchmarks/softraster), where it is a benchmark
with no picture to match rather than a second renderer to keep in step.
