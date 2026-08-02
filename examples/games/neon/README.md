# NEON

An R-Type-shaped horizontal shooter, ~4,900 lines of Milo, no upgrade menu.

```bash
milo run examples/games/neon/main.milo --release
```

Arrows/WASD fly, `SPACE` held charges the beam, the gun fires itself, `ENTER`
restarts, `ESC` quits.

No assets: sprites are strings over a palette of linear-light floats that run
past 1.0, so bright things clear the bloom threshold. Blend for mass, add for
emitters — glowing red means incoming fire and nothing else.
