# SHATTER — a brick breaker in Milo

```bash
milo build examples/games/shatter/main.milo -o /tmp/shatter --release && /tmp/shatter
```

| | |
|---|---|
| arrow keys, A/D, or the mouse | move the paddle — this is the only control |
| SPACE / ENTER | launch the ball, and restart after a game over |
| ESC | quit |

Whichever of keyboard or mouse you moved last is the one driving, so there is
nothing to configure.

## Why this one

The vector shooter next door (`../neon`) is a better argument than it is a game:
too fast, too many things on screen, and it asks you to track a dozen behaviours at
once. This is the opposite on purpose.

- **One input.** Move left and right. That's it.
- **The skill is legible.** Where the ball lands on the paddle sets the angle it
  leaves at. Hit it on the left, it goes left. You can see the rule, so you can plan.
- **Failure is cheap.** Five balls, a wide paddle, and power-ups that drop often.
- **The combo is the hook.** Every brick you break without touching the paddle is
  worth more than the last, up to 20×. A long rally is worth more than a careful
  one, which is the reason to take a risk.

Colour carries the rules: green dies in one hit, cyan in two, violet in three, grey
never, orange explodes and takes its neighbours with it. Bricks with more than one
hit left show that many pips.

Eight boards, each a recognisable shape rather than a random field — an arrowhead,
an invader, a heart, the word MILO.

## Engine

Shares the engine with `../neon`, unchanged: `gfx.milo` is the HDR canvas — additive
drawing into a linear-light `Vec<f32>`, bright-pass, separable blur at quarter
resolution, Reinhard tone map — and `grid.milo` is the mass-spring background
lattice that every impact pushes on. `gfx.milo` gains solid-fill primitives here
(`brickFill`, `capsule`), because a wireframe brick reads as a hole rather than an
object.

1280×720 at 60 fps, all on the CPU; the GPU only blits the finished frame.

## Safety

`unsafe` appears twice, both FFI: the SDL calls in `sdl.milo` and the texture upload
in `main.milo`. The simulation, the collision resolution and the renderer contain
none — no raw pointers, no lifetimes, and no `Rc<RefCell<>>` equivalent.

Two details worth pointing at, both of which fall out of the language rather than
being worked around:

- **Ball/brick collision** resolves along the shallower overlap axis, so the ball
  reflects off the face it actually struck. It takes the brick list and an index,
  never two `&mut` into one `Vec` — which is the shape second-class references push
  you toward anyway.
- **Explosive bricks recurse** into their neighbours through the same index-taking
  function. A chain reaction is an ordinary recursive call on `&mut Game`, with no
  aliasing question to answer.

## Headless

`shot.milo` plays the game with a scripted paddle and dumps PPM frames — a
deterministic smoke test for the whole simulation, and how the screenshots are made:

```bash
milo run examples/games/shatter/shot.milo --release -- /tmp/shatter 400 4000
```

It found a real bug: a dead-centre bounce returns the ball perfectly vertical, and
once it has punched a column out of the wall it climbs the same gap forever. The
bounce now carries a few hundredths of a radian of noise.
