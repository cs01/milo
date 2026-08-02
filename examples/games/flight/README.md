# FLYBY

Fly SF, Manhattan, Yosemite, the Grand Canyon and Honolulu — real places from
SRTM terrain, OSM buildings and aerial imagery, baked into the binary.

```bash
milo build examples/games/flight/main.milo -o /tmp/flyby --release && /tmp/flyby
```

UP/DOWN pitch (up dives; `--natural` flips), LEFT/RIGHT bank, SPACE burner,
ENTER elsewhere, F fullscreen, ESC quit.

Five landmarks each, under a blue beam; find them all and the next place comes
in. CPU rasteriser, GPU bloom (`--cpu` forces software).
