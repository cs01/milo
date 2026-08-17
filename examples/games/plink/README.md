# PLINK

A dead western town, a revolver, and bottles that will not stand still. Targets
snap up on hinges along the boardwalk rails, hold for about a second and a half,
and drop. Hit one anywhere and it shatters — there is no bullseye, only how fast
you are.

```bash
milo run examples/games/plink/main.milo --release
```

Mouse looks, `WASD` walks, `SHIFT` runs, left click fires, right click aims,
`R` reloads (it reloads itself when the cylinder runs dry), `SPACE` starts a
round, `F` fullscreen, `ESC` quits.

A round is 60 seconds. Consecutive hits build a multiplier to 6x, and the town
pushes harder as the clock runs down: more rigs up at once, less time on each.

Nothing loads from disk. The sand, the plank siding, the corrugated tin and the
burlap are procedural, and so is the WANTED poster — that is Milo, the chihuahua
from `../volt` and `../yap`, drawn from the same kind of digit-grid sprite.

Everything renders on the GPU through the `gl` package and needs an OpenGL 3.3
core context: a physical sky integrated once at startup, shadow maps, GGX with
sky irradiance for ambient, bloom and an ACES tone map.

`--shot out.png` renders one frame and exits, which is how every change to the
lighting here was actually judged. `--pitch`, `--yaw`, `--x`, `--z` aim that
capture, `--warmup N` runs the wave logic forward first so the street is not
empty, `--boom N` breaks a target every N frames, and `--scale` trades scene
resolution for frame rate.
