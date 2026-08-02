# PROSPECT

A digging game playable by a five-year-old: one rule, one input, no timer, no
enemies, no fail state.

```bash
milo build examples/games/dig/main.milo -o /tmp/prospect --release && /tmp/prospect
```

Hold a direction (arrows or WASD) to dig, `ESC` quits. Fill the bar with
treasure, then walk into the glowing green door.

Blocks are 40 px so one block reads as one dig; dirt, clay and stone each have
their own hue and marking. `shot.milo` runs it headless.
