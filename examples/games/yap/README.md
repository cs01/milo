# YAP

Milo the chihuahua flaps his ears through the neighbourhood. One button, no
mercy, fire hydrants everywhere.

```bash
milo run examples/games/yap/main.milo
# or, for the smoothest frame time:
milo build examples/games/yap/main.milo -o /tmp/yap --release && /tmp/yap
```

| | |
|---|---|
| `SPACE` / `UP` / `W` / `CLICK` | flap |
| `R` | restart |
| `M` | music |
| `ESC` | quit |

A hydrant passed is a point. A treat eaten is three. The gap closes and the
world speeds up as the score climbs, and both stop tightening well before they
get unfair.

## What it is made of

Nothing is loaded from disk. The dog is four frames of pixel art written as
strings in `sprites.milo` — ears up, ears out, ears down, and one for the part
where he stops flying — and the neighbourhood behind him is hashed out of its own
world position, so it is endless and none of it is in the binary. The hydrants
are drawn from rectangles at whatever height the gap needs.

Everything is composited into a linear-light float buffer with bloom and tone
mapping (`gfx.milo`, borrowed from [`../volt`](../volt)); SDL only blits the
finished frame. The bark, the crunch and the music are PCM generated at startup
in `sound.milo` and pushed at SDL's queue API — no mixer, no assets.

Nothing outside `sound.milo` and the texture upload in `main.milo` is `unsafe`.

## Feel

The tuning is three numbers in `world.milo` — gravity, flap velocity, gap — plus
two rules that decide whether a near miss reads as skill or as a bug:

- **The hitbox is smaller than the dog.** Ears and tail hang outside it; clipping
  ear fur on a hydrant costs nothing.
- **A flap sets vertical velocity rather than adding to it,** so mashing the key
  cannot stack into escape velocity, and every flap is the same flap.

The sky is a wall, not a kill. Bonking it costs height and pride.

## Looking at it without a window

`shot.milo` runs the whole game headless — same simulation, same renderer, no
SDL — with a bot at the controls, and dumps PPM frames:

```bash
milo run examples/games/yap/shot.milo -- /tmp/yap 60 700        # two frames of a run
milo run examples/games/yap/shot.milo -- /tmp/yap --sheet       # every sprite, large
milo run examples/games/yap/shot.milo -- /tmp/yap --die 700 780 # the game-over card
```

That is the only way to review pixel art that was authored blind as strings, and
it doubles as a deterministic smoke test of the sim.
