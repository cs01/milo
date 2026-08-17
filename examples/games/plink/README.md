# PLINK

A dead western town, a revolver, and bottles that will not stand still. Targets
snap up on hinges along the boardwalk rails, hold for about a second and a half,
and drop. Hit one anywhere and it shatters — there is no bullseye, only how fast
you are.

```bash
milo run examples/games/plink/main.milo --release
```

Two controls: the mouse aims and the left button shoots. `SPACE` starts a round,
right click steadies your aim, `F` is fullscreen and `ESC` quits. There is no
walking and no reload key — you stand at the mouth of the street, the whole range
is in front of you, and the cylinder refills itself.

The town is never idle: with no round running two targets stay up at a time on a
long hold and the revolver still fires, so you can find the range before the
clock starts. Nothing is scored until `SPACE`.

A round is 60 seconds. Consecutive hits build a multiplier to 6x, and the town
pushes harder as the clock runs down: more rigs up at once, less time on each.

Nothing loads from disk. The sand, the plank siding, the corrugated tin and the
burlap are procedural, and so is the WANTED poster — that is Milo, the chihuahua
from `../volt` and `../yap`, drawn from the same kind of digit-grid sprite.

Everything renders on the GPU through the `gl` package and needs an OpenGL 3.3
core context: a physical sky integrated once at startup, a depth+normal prepass
feeding screen-space ambient occlusion, shadow maps filtered through a rotated
twelve-tap disc, GGX with sky irradiance for ambient, bloom and an ACES tone map.
The screen font is stroked and rasterized into its atlas by distance to the pen,
so the title is a curve rather than a staircase.

`--attract` holds the title screen instead of starting a round, `--aim` holds the
iron sights up, and `--debug 3` shows the ambient-occlusion buffer on its own.

`--shot out.png` renders one frame and exits, which is how every change to the
lighting here was actually judged. `--pitch`, `--yaw`, `--x`, `--z` aim that
capture, `--warmup N` runs the wave logic forward first so the street is not
empty, `--boom N` breaks a target every N frames, and `--scale` trades scene
resolution for frame rate.
