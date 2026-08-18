# REDLINE

A night street race through a neon city. One closed circuit, 2.8 km, three lanes
wide, walled on both sides by a continuous bar of light that follows every
corner. You drive a wedge with the arrow keys and the whole game is how late you
can leave the braking.

```bash
milo run examples/games/redline/main.milo --release
```

Arrows or `WASD` drive, `SHIFT` is nitrous, `SPACE` is the handbrake, `F` is
fullscreen and `ESC` quits.

## The circuit

Hand-placed, not generated. It opens with a 600 m pit straight, turns in to a
long fast left onto the east side, runs a kinked back straight, tightens over the
top into a hairpin, and comes down the west side through an S that puts the one
right-hander of the lap where you are least ready for it. A procedural loop has
no decisions in it, only curves; a circuit is a sequence of decisions you learn.

The centreline is a closed Catmull-Rom through control points, resampled at a
uniform **arc length**. That resampling is the reason `track.milo` exists: a
spline parameter is not distance, so anything built on raw `t` (the grid spacing,
the lookahead, how far ahead the next car is) is wrong by a factor that changes
with every corner. Every query in the game is in metres along the road.

The track checks itself at startup. The loop passes near itself in two places and
a circuit that touches itself is one where "how far round am I" returns whichever
pass happens to be nearer, which shows up as a lap counter that jumps and is very
hard to read back to a control point typed in wrong.

## Running wide

Twenty-two metres of road, then a rumble strip, then four and a half metres of
dirt, then the barrier. The dirt costs you grip and speed, and the barrier is a
hard redirect: the component of your velocity heading into the wall is cancelled
and the component running along it is barely scrubbed. A barrier that stops you
dead has already handed the race to everyone behind, and a barrier that pushes
back with a spring oscillates, which reads as the game fighting you.

## Handling

Arcade, deliberately. The velocity is split into forward and lateral in the car's
own frame: the engine pushes forward, the tyres eat lateral, and steering turns
the *heading* while the velocity follows it at a rate set by grip. Drop the grip
and the velocity lags the heading, and that is a drift, out of the same three
lines rather than out of a slip curve nobody can tune. Steering authority falls
with speed, which is the single most common thing an arcade handling model gets
wrong: without it the car is uncontrollable flat out and numb in a hairpin.

The car never leaves the ground. The pitch and roll the body shows are cosmetic.

## How it looks

Nothing loads from disk. The asphalt, the concrete, the steel, the paint and the
glass are procedural, and so is every building, every window and every metre of
neon. It renders on the GPU through the `gl` package and needs an OpenGL 3.3 core
context: a night sky integrated once at startup into a lat-long radiance table, a
depth+normal prepass feeding screen-space ambient occlusion, shadow maps, GGX
with sky irradiance for ambient, bloom and an ACES tone map.

Three things carry the look:

- **One neon bucket.** Its material has a near-black albedo and a white emissive,
  and the shader multiplies emissive by the vertex tint, so one draw call paints
  every barrier band, gantry tube, lamp head and lit window in the city in
  whatever colour and at whatever brightness the geometry asked for.
- **Colour is a ratio, not a level.** What keeps a tube reading as neon rather
  than as a fluorescent strip is the ratio between its channels. Raise the dim
  channels to make it brighter and ACES rolls all three toward white together.
  The two barriers run the same cyan-to-magenta ramp half a lap out of phase, so
  they are never the same colour at the same place and a glance tells you which
  side of the road you are looking at.
- **The lights are a pool.** About a hundred places on the circuit should cast
  real light and the shader takes sixteen, so every candidate is built into a
  pool and the frame loop picks the nearest. Choosing at build time instead means
  the tube you are driving under is dark because one on the far side of the lap
  got there first.

Two things in here are self-lit that physically should not be. The rumble strips
carry a faint emissive because a red kerb under moonlight is black, and the edge
of the road is the one thing that has to be readable at every point on the lap.

## Capture

`--shot out.png` renders one frame and exits, which is how every change to the
lighting here was actually judged. `--s` puts the car somewhere else on the lap,
`--lat` moves it across the road, `--speed` gives it pace so the camera sits where
it would sit at speed rather than where it sits parked, `--warmup N` drives the
car forward N frames first, `--sky` scales the sky without touching the neon,
`--scale` trades scene resolution for frame rate, and `--skip N` drops one
geometry bucket, which is how you find out which bucket a surface belongs to.
