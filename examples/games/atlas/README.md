# ATLAS

Fly around ten worlds; click the glowing dots to find out what is there. Every
landmark has two write-ups, for about five and about twelve; `L` swaps them.

```bash
scripts/fetch-assets.sh --bodies   # the planet maps are downloaded, not in git
milo build examples/games/atlas/main.milo -o /tmp/atlas --release && /tmp/atlas
```

The maps live in `../apsis/bodies` and are baked into the binary, so the build
fails without them.

Drag spins, scroll/W/S flies, `1`-`9`/`0` or the chips travel, SPACE stops the
spin, ESC closes, H help, F fullscreen, Q quits.

Real coordinates on public-domain USGS/NASA maps (shared with `../apsis`); Sun,
Uranus and Neptune are generated. GPU sphere, ring, halo, sky, bloom.
`--shot out.ppm --world N [--landmark N]` captures a frame.
