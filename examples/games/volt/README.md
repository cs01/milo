# VOLT

A 2D momentum platformer written in Milo. Three levels, no lives, instant respawn.

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
| `DOWN` | drop through a platform |
| `R` | restart the level |
| `M` | music |
| `ESC` | quit |

Run right, stomp what crawls, dash through what flies, take the shards, reach the
gate.

## What makes it feel modern

The jump arc is not the interesting part — the forgiveness around it is. All of
this lives in `world.milo`:

- **Coyote time.** You can still jump for 100 ms after walking off an edge.
- **Jump buffering.** A jump pressed up to 120 ms before landing fires on landing.
- **Variable height.** Releasing the key mid-rise cuts the remaining velocity.
- **Apex hang.** Near the top of the arc, gravity eases and air control gets
  stronger — the peak is where a jump is aimed, so it gets stretched.
- **Asymmetric gravity.** You fall about 12% faster than you rise.
- **Wall slide and wall jump,** with the same coyote window the ground gets, plus
  a short input lockout so holding *into* the wall cannot cancel the push-off.
- **Eight-way dash,** refilled by touching ground or a wall, ending in kept
  momentum rather than a dead stop. A dash with no direction held goes where you
  face — never nowhere.
- **Hitstop.** Impacts freeze the simulation for a few frames while the screen
  keeps drawing, which reads as weight rather than as a dropped frame.
- **Squash and stretch** about the feet, screen shake, and a camera that leads
  the player by their velocity instead of following their position.

None of it changes what is possible. It changes how often the game does what the
player meant, which is what "feels modern" actually means.

## What is on screen

Everything is software. There is no GPU pipeline — SDL blits one finished frame.

**Sprites** (`sprites.milo`) are pixel art written as strings, one character per
pixel, against palettes in **linear light**:

```
".0344444430."     0 outline   3 suit lit   4 visor
".0322222230."     values run past 1.0 on purpose
```

A visor at 1.7 clears the bloom threshold and glows; the suit at 0.3 beside it
does not. That contrast is the whole look, and it is why the art is authored in
linear light rather than in 8-bit colour.

**Terrain** (`tiles.milo`) is generated noise at 16 art pixels square, drawn at
2x, so the art grid and the collision grid are the same grid. The autotiler is
one rule: a solid tile with air above it gets the lit cap, everything else gets
fill.

**The canvas** (`gfx.milo`) carries two kinds of ink into one linear-light float
buffer — alpha-over for anything with mass, additive for anything that emits —
then bright-passes, blurs at quarter resolution, and tone-maps through a
Reinhard curve. The vector games this canvas came from (`../neon`, `../flight`)
are purely additive, which cannot draw a dark shape against a bright sky; a
platformer is mostly dark shapes.

**The skyline** is hashed from world position rather than stored, so a level of
any length has towers with lit windows behind it and none of it is in the binary.

**Audio** (`sound.milo`) is PCM generated at startup and pushed at SDL's queue
API: a driving four-bar loop in A minor on its own device, effects on another
(the queue API appends rather than mixes, so sharing one device would make every
effect wait behind the music).

## Levels

One character per tile, and the same characters place the entities:

```
.  air        #  solid      =  one-way platform    ^  spikes
%  breakable  !  launch pad S  spawn               G  gate
o  shard      O  core       c  crawler             d  drone
```

Rows are ragged on purpose — a row is only as long as its last non-air tile.
Most of a platformer is sky, and this way the sky costs nothing to write down.

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
