# PLINK

A dead western town, a revolver, and bottles that will not stand still. You stand
in the street square on to the front of the dry goods store, and a row of eleven
rigs along its rail snaps bottles and plates up on hinges, holds them a couple of
seconds, and drops them. They glow, so you find them in the porch shade without
hunting. Hit one anywhere and it comes apart — there is no bullseye, only how
fast you are.

```bash
milo run examples/games/plink/main.milo --release
```

Two controls: the mouse aims and the left button shoots. `SPACE` starts a round,
right click steadies your aim, `F` is fullscreen and `ESC` quits. There is no
walking, no reload and no ammunition count — the rail is a row laid out in front
of you at one honest distance, and the only thing between you and the next shot
is how fast the hammer comes back. Rigs outside the arc you can
turn through, on the far boardwalk or down at the graveyard fence, stay down as
scenery: a target nobody can shoot is a wasted spawn.

The town is never idle: with no round running four targets stay up at a time on a
long hold and the revolver still fires, so you can find the range before the
clock starts. Nothing is scored until `SPACE`.

A round is 60 seconds. Consecutive hits build a multiplier to 6x, and the town
pushes harder as the clock runs down: more rigs up at once, less time on each.

The view model is drawn in the scene's own frustum with the depth buffer live,
not in a private frustum with the depth test off. That is why it looks solid: the
old way had no depth inside the gun at all, so the far wall of every tube showed
through its near wall and the whole revolver read as glass.

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
