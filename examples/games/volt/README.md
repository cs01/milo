# VOLT

A 2D momentum platformer written in Milo. You are Milo, a chihuahua. Three
levels, hydrants for checkpoints, instant respawn.

```bash
milo run examples/games/volt/main.milo
# or, for the smoothest frame time:
milo build examples/games/volt/main.milo -o /tmp/volt --release && /tmp/volt
```

| | |
|---|---|
| `ARROWS` / `WASD` | move |
| `SPACE` / `Z` / `K` | jump — hold for height |
| `SHIFT` / `X` / `J` | dash, eight-way |
| `B` / `C` / `E` | **bark** |
| `DOWN` | drop through a platform |
| `R` | restart the level |
| `M` | music |
| `ESC` | quit |

Run right, stomp the cats, bark the birds out of the sky, dig a bone out of the
dirt and spend a while as a german shepherd. Take the treats, reach the gate.

## The bone

A chihuahua is a chihuahua. Eat a bone and you are a **german shepherd**: bigger
on screen, and the next hit takes the shepherd instead of taking you. Get hit
again and you are a chihuahua once more, thrown clear, and briefly untouchable —
long enough to walk out of whatever hit you.

Most of the bones are behind a crate, and the way through a crate is to **bark at
it**. That is the digging: a bark breaks any crate in range, kills any cat or
bird in range, and reaches roughly twice as far when a shepherd is doing it. The
sound tells you which one you are without looking at the HUD.

## The hydrant

Every level has four. Walk into one and Milo turns his back on it, lifts a leg
and marks it, and it lights up. Die and you come back to the last one you lit
rather than to the start of the level. The biscuits you had are lost — they are
still in the level, which is the point of losing them.

The marking takes about a second and any jump or dash cuts it short, so it is
never something you have to sit through. The stream is drawn rather than
simulated: a fixed parabola from the raised hip to the foot of the hydrant with
droplets marching along it. A spray of physics particles was the obvious way to
do it and it looked like a dust cloud — what the gag needs is a line you can
follow. The puddle it leaves dries over the next few seconds.

## What makes it feel modern

The jump arc is not the interesting part — the forgiveness around it is. All of
this lives in `world.milo`:

- **Coyote time.** You can still jump for 130 ms after walking off an edge.
- **Jump buffering.** A jump pressed up to 150 ms before landing fires on landing.
- **Variable height.** Releasing the key mid-rise cuts the remaining velocity.
- **Apex hang.** Near the top of the arc, gravity eases and air control gets
  stronger — the peak is where a jump is aimed, so it gets stretched.
- **Asymmetric gravity.** You fall about 12% faster than you rise.
- **Wall slide and wall jump,** with the same coyote window the ground gets, plus
  a short input lockout so holding *into* the wall cannot cancel the push-off.
- **Eight-way dash,** refilled by touching ground or a wall, ending in kept
  momentum rather than a dead stop. A dash with no direction held goes where you
  face — never nowhere.
- **A camera with a dead zone.** The view does not move at all while you are
  inside a box in the middle of the screen — no lead, no easing toward your
  facing. A camera that leans the way you are looking swings the whole world
  every time you tap the other direction, which reads as the ground sliding
  around underneath you. On the ground it settles to put you 70% of the way
  down the frame, because the interesting half of a platformer is the sky you
  are about to jump into.
- **A hitbox smaller than the dog.** The art overhangs the collision box on every
  side, so what looks like a near miss is a miss.
- **Spikes hurt rather than kill.** Walking into one sideways costs you the
  shepherd and throws you back out; it does not end the run.
- **Hitstop.** Impacts freeze the simulation for a few frames while the screen
  keeps drawing, which reads as weight rather than as a dropped frame.
- **Squash and stretch** about the feet, and screen shake that never touches the
  simulation — it is a draw-time offset, so it can never desync collision from
  what is on screen.

None of it changes what is possible. It changes how often the game does what the
player meant, which is what "feels modern" actually means.

## What is on screen

Everything is software. There is no GPU pipeline — SDL blits one finished frame.

**The dog** (`sprites.milo`) is not drawn frame by frame. A dog is a body, a
head, two ears, four legs and a tail, and the difference between a chihuahua and
a german shepherd is the proportions of those — so the shapes are rasterised
from a `DogSpec` of numbers and the two builds are two sets of numbers. Each
frame poses the four legs and, where it matters, the head and the ears. The last
pass is what makes it read as pixel art rather than as blobs: **every empty pixel
touching a filled one becomes outline**, so drawing the silhouette gets the ink
for free.

The cats, the bird and the hydrant are string art, one character per pixel,
against palettes in **linear light**:

```
"020......0242250"     0 outline   2 fur   4 eye   5 nose
                       values run past 1.0 on purpose
```

An eye at 1.8 clears the bloom threshold and glows; the fur at 0.36 beside it
does not. That contrast is the whole look, and it is why the art is authored in
linear light rather than in 8-bit colour.

**Terrain** (`tiles.milo`) is generated noise at 16 art pixels square, drawn at
4x, so a tile is 64 screen pixels and the art grid and the collision grid are the
same grid. `ART` is the one number that sets how close the camera is — at 4x a
1280-wide window shows 20 tiles, about what Mario showed. The autotiler is one
rule: a solid tile with air above it gets grass, everything else gets dirt.

**The canvas** (`gfx.milo`) carries two kinds of ink into one linear-light float
buffer — alpha-over for anything with mass, additive for anything that emits —
then bright-passes, blurs at quarter resolution, and tone-maps through a
Reinhard curve. The bloom threshold sits *above* the sky: daylight art is bright
everywhere, and a low threshold blooms the blue into white fog instead of
lighting the few things that actually emit. The vector games this canvas came
from (`../neon`, `../flight`) are purely additive, which cannot draw a dark
shape against a bright sky — a small brown dog on a green hill is the whole
opposite problem.

**The landscape** is hashed from world position rather than stored, so a level
of any length has clouds, blue mountains, green hills and a line of trees behind
it, and none of it is in the binary. The three layers move at 8%, 22% and 42% of
the camera; that spread is the whole trick, because the eye reads a difference
in rates as distance.

**Audio** (`sound.milo`) is PCM generated at startup and pushed at SDL's queue
API: a driving four-bar loop in A minor on its own device, effects on another
(the queue API appends rather than mixes, so sharing one device would make every
effect wait behind the music).

## Levels

One character per tile, and the same characters place the entities:

```
.  air        #  solid      =  one-way platform    ^  spikes
%  breakable  !  launch pad S  spawn               G  gate
k  hydrant    b  bone       o  biscuit             O  tennis ball
c  cat        d  bird
```

Rows are ragged on purpose — a row is only as long as its last non-air tile.
Most of a platformer is sky, and this way the sky costs nothing to write down.

## Looking at it without playing it

`shot.milo` is a headless capture: a bot plays, and PPM frames are written at
whichever ticks you ask for. No SDL and no window, so it runs anywhere, and it
doubles as a deterministic smoke test for the whole simulation.

```bash
milo run examples/games/volt/shot.milo --release -- /tmp/volt 60 240 600
milo run examples/games/volt/shot.milo --release -- /tmp/volt --level 2 300
milo run examples/games/volt/shot.milo --release -- --sheet   # every sprite, large
```

`--sheet` is how the art gets iterated on: pixel art written as numbers and
strings is authored blind, and this is the only way to see whether a frame says
"dog" before it is fifteen pixels tall in a level.

Levels are checked the same way — by tooling rather than by eye. Two of the
three shipped sealed: a column of rock ran from the roof to the floor and no
route past it existed, so the level could be started and never finished. They
were rebuilt against a reachability check that floods the map with a
conservative model of the jump (no dash, no launch pads) and asks whether the
gate can be stood next to. Anything it calls reachable really is.

## Dependencies

The SDL declarations come from the [`sdl`](https://github.com/milo-language/milo-sdl)
package rather than a per-project copy:

```bash
milo add github.com/milo-language/milo-sdl
```

`milo.json` and `milo.lock` are checked in beside the source.

## Safety

Two `unsafe` blocks in the whole game: the audio device queue in `sound.milo`,
and the texture upload in `main.milo`. Physics, collision, the tilemap, the
sprite rasteriser and the compositor are all safe Milo — no raw pointers, no
manual frees, bounds checked throughout.
