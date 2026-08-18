# REDLINE

A street race through a city at golden hour. One closed circuit, 2.8 km, three
lanes wide, walled on both sides by a continuous bar of light that follows every
corner, with shopfronts and towers standing right on the kerb. You drive a
Countach with the arrow keys, hold the turbo down the straights, clip the boost
pads, and the whole game is how late you can leave the braking.

```bash
milo run examples/games/redline/main.milo --release
```

Arrows or `WASD` drive, `SPACE` is the turbo, `SHIFT` is the handbrake, `F` is
fullscreen and `ESC` quits.

## The turbo

One bottle, five segments on the gauge, about three and a half seconds of it
held flat and eleven to fill back up. It does not simply raise the top speed:
it pushes, on top of the engine, so using it at 150 is felt as a shove rather
than as a number that slowly climbs. The lens widens with it, the exhausts light
up, and the air starts streaking past the edge of the frame. A boost you can
only read off a gauge is a stat; a boost that changes the shape of the frame is
a boost.

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

Fifteen metres of road, then a rumble strip, then a little over two metres of
dirt, then the barrier. The width is set from the frame rather than from the
racing: a boulevard wide enough to be comfortable puts the buildings so far out
that they leave the picture, and a street race whose street is off screen is a
ribbon in a field. The dirt costs you grip and speed, and the barrier is a
hard redirect: the component of your velocity heading into the wall is cancelled
and the component running along it is barely scrubbed. A barrier that stops you
dead has already handed the race to everyone behind, and a barrier that pushes
back with a spring oscillates, which reads as the game fighting you.

## Handling

Arcade, deliberately. Top speed is 108 m/s, about 240 mph, and the pads and the
bottle together put it past 260. The velocity is split into forward and lateral in the car's
own frame: the engine pushes forward, the tyres eat lateral, and steering turns
the *heading* while the velocity follows it at a rate set by grip. Drop the grip
and the velocity lags the heading, and that is a drift, out of the same three
lines rather than out of a slip curve nobody can tune. Steering authority falls
with speed, which is the single most common thing an arcade handling model gets
wrong: without it the car is uncontrollable flat out and numb in a hairpin.

The car never leaves the ground. The pitch and roll the body shows are cosmetic.

## Making it feel fast

The top speed is the least of it. A car that takes eight seconds to reach 240
spends the whole straight in the middle of its range, where nothing on screen is
changing, so what the number went up by matters far less than what the *rate*
went up by: the engine pulls at 64 m/s^2 off the line, and everything cosmetic is
tied to speed rather than to the throttle.

Four things move together near the top of the range, and none of them is a
number on the gauge:

- **The lens opens.** The horizontal field of view goes from 60 to 80 degrees
  between a standstill and flat out, and another 17 on top of that with the
  bottle lit.
- **The camera moves IN, not out.** This is the one that is backwards from
  intuition. Pulling back at speed shrinks the road and everything beside it,
  which is the opposite of what the eye reads as speed; tucking in while the lens
  widens is what drags the walls past the edge of the frame.
- **The frame streaks.** Eight taps back along the line from the centre of the
  screen, weighted by the square of the radius, so the middle stays sharp and only
  the periphery smears. It is absent below about two thirds of top speed on
  purpose: a blur that is always on is not a speed cue, it is a dirty lens, and
  what the eye actually reads is the frame *changing*.
- **The car starts to tremble**, and the vignette closes down as the lens opens.

The camera smooths its OFFSET from the car rather than its position in the world.
An exponential filter settling at rate `r` trails a target moving at `v` by about
`v/r`, so smoothing the world position makes the lag proportional to speed: at
120 m/s the camera sat thirteen metres further back than it had ever been asked
to and the car shrank to a dot exactly when the player most needed to see it.
Smoothing the offset keeps the framing identical at every speed and still lets
the camera swing out behind the car in a corner, which is the part of the lag
that was wanted in the first place.

## The pads

Fifteen sets of three chevrons a lap, laid flat on the tarmac and pulsing. They
add speed directly instead of topping up the bottle and leaving you to press the
button: the pad is a thing you drove over, so the payoff has to be immediate or
it reads as a pickup rather than as a ramp. They also part-fill the tank, which
is what stops a lap being one long straight with the turbo empty.

They alternate between the three lanes. A pad that always sits on the racing line
is free, and a free bonus is not a decision; one that moves is a reason to be
somewhere other than the apex.

## How it looks

Nothing loads from disk. The asphalt, the concrete, the steel, the paint, the
glass and the building facades are procedural, and so is every window and every
metre of neon. It renders on the GPU through the `gl` package and needs an
OpenGL 3.3 core context: a sky integrated once at startup into a lat-long
radiance table, a depth+normal prepass feeding screen-space ambient occlusion,
shadow maps, GGX with sky irradiance for ambient, bloom and an ACES tone map.

The sky is a real blue overhead running to a warm haze at the horizon, with the
sun 24 degrees up and behind the cloud deck. It used to be a violet-to-magenta
sunset with the sun almost on the deck, which looked striking in isolation and
washed the entire game one colour: everything in the frame is lit by that table,
so a magenta sky makes magenta asphalt, magenta concrete and magenta paint, and
the neon loses its job because there is nothing left for it to be coloured
*against*. A low sun made it worse by never actually striking a facade.

The sky is bright and saturated on purpose. The neon keeps its job by being
*coloured* rather than by being the only thing on screen with any light in it,
and every emissive tint in the game is above the bloom threshold, so the tubes
still glow against a lit sky. ACES desaturates whatever it rolls off, which is
right for film and wrong for a cabinet, so the composite pushes saturation back
up after the tone map and before the transfer.

## The car

A Countach, as closely as twenty cross-sections will carry it: 4.14 m long,
2.00 m wide and 1.07 m tall on a 2.45 m wheelbase, which is a car nearly twice as
wide as it is high. Those proportions are most of why it reads as that car rather
than as a generic supercar; get the height wrong by ten centimetres and it turns
into a coupe.

The shell is a loft through twenty stations of twenty-eight points each, with
normals taken from the surface rather than from the winding, because the
highlight that runs down the flank of a car is one continuous band and it only
exists if the normals vary continuously. Read down the table and the shape is
there in the numbers: a nose 44 cm off the road, one straight line up to the base
of the screen, 40 cm of climb in 80 cm of length for the windscreen, 36 cm of
flat roof, then a deck that stays high all the way to a tail cut off square. The
Kamm tail is free: keep the last section nearly full width and let the end cap
close it flat. Taper it and the car becomes a teardrop.

Two columns of that table are the ones that bite:

- **`ys`, the shoulder**, is where the section is widest and so where the flank
  stops being vertical. Through the cabin it belongs up at door-top height. Left
  down at mid-door the sides start tumbling inward from the middle of the body,
  which hollows the greenhouse out and turns the whole thing into an open buggy
  with a headrest.
- **`SECTION_N`**, how boxy a section is. This car is folded out of flat planes
  with hard creases between them, so it wants to be nearly a rectangle.

The wheel wells are *cut* into the loft: inside a circle around each axle the
flank is clamped inward, which turns the solid side into an opening with a wall
behind it, and the loft's own edge along that circle is the arch lip. Ringing the
wheel with a separate flare instead leaves the tyre standing in front of an
unbroken flank, which is what makes a car read as a toy with wheels stuck on.

Everything hung on the shell is scaled to a real car and it is easy to get wrong
in one direction only: too big. A first pass gave it a full-width tail light bar,
a race wing on swan-neck stanchions, pipes standing out past the bodywork and
scoops standing 27 cm proud of the shoulder, and the result read as a sensor rig
on a self-driving prototype. What it wants instead is the ear scoops behind the
doors, a NACA duct in each door, pop-up lamps stowed so the nose stays a wedge, a
slatted grille over the engine instead of a rear window, a thin blade wing close
to the deck, and two small lamp clusters let into body colour rather than one lit
panel across the back.

Five meshes, because five materials: paint (one draw, one uniform colour, so the
whole field can share the shell), trim (white albedo with the colour in the
vertex tint, so carbon, polished exhaust tip and grille come out of one draw),
glass, wheels, and the emissive lamps. The exhaust plume is a sixth, drawn only
when the bottle is lit and stretched along its own axis by a scale in the matrix
rather than by rebuilding its geometry.

Glass gets an albedo of 0.10 rather than the 0.04 that is physically closer. At
0.04 with a mirror roughness the cabin returns only what happens to be reflected
in it, and on a street at dusk that is nothing, so the greenhouse comes out as a
hole cut in the car.

## The city

Every building is a plinth, a shaft that steps back once or twice as it rises, a
cornice at each step, a parapet, and whatever machinery the roof carries: plant
rooms, a water tank on legs, a mast with the red light every tall building in the
world has on it. The stepping is the difference between a city and a row of
boxes: a single extruded rectangle has the same silhouette from every angle and
no scale cues at all.

They go down in **two rows, not one scatter**. A single random offset produces a
city with an average distance from the road and no street at all; what makes a
street race read as a street is that one row of facades stands on the kerb, tall
enough to leave the top of the frame, with the towers behind it. Scattering over
the same range gives every building a one-in-N chance of being that wall and so
builds it nowhere.

There are six facade stocks rather than one material at six brightnesses. A real
skyline is a cream block next to a brick one next to a teal curtain wall, and at
this distance that is the only cue that the silhouette is a city and not a ridge.
Saturation matters as much as value, because ACES rolls everything toward white
at the top end and a facade that started grey ends the frame as grey.

Each front-row plinth carries a **row of shop units**: a lit window, a saturated
awning over it, a signboard, and on some of them a blade sign hung out square to
the wall. This is the only part of a building anybody driving past actually
reads, and street level is what separates a dense city from a set of tall boxes
with a road between them. Their emissive has to sit *under* the neon: above about
1.0 a surface that size clips through the tone map and the unit comes back as a
white slab with no colour left in it.

Unlit windows are in the facade texture and lit ones are geometry. A tower
carries hundreds of openings and only some are lit; emitting every dark one as a
quad costs thousands of triangles for a rectangle that by definition does not
glow, and the lit ones have to be geometry because they have to actually throw
light on the street.

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
`--orbit DEG` with `--elev` and `--dist` swings a camera round the car itself
instead of following it, which is the only way to judge bodywork: the chase
camera shows you one three-quarter rear view and every mistake on the other five
sides survives it.
