# YAP

One-button flapper. Milo the chihuahua flaps his ears past fire hydrants.

```bash
milo build examples/games/yap/main.milo -o /tmp/yap --release && /tmp/yap
```

`SPACE`/`UP`/`W`/click flap, `R` restart, `M` music, `ESC` quit. Hydrant = 1,
treat = 3; the gap tightens with the score, then stops.

Nothing loads from disk: sprites are strings, the world is hashed from position,
sound is PCM built at startup. `shot.milo` runs it headless.
