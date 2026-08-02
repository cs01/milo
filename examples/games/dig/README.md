# PROSPECT — a digging game in Milo

```bash
milo build examples/games/dig/main.milo -o /tmp/prospect --release && /tmp/prospect
```

| | |
|---|---|
| arrow keys or WASD | hold a direction to dig |
| ESC | quit |

**Built to be playable by a five-year-old.** One rule, one input, no timer, no
enemies, no fail state. Hold a direction; the ground gives way. Fill the bar with
treasure, then walk right into the glowing door.

You start above ground — sky, sun, clouds, a tree, and Milo waiting at the top of
the shaft.

## The dog

He is a whole animal — an oval body, four legs and a tail, wearing a hard hat,
with the mascot from `docs/site/public/logo.svg` (the same 18×18 dog that is on
the homepage) as his head. Everything below the neck is built from one oval
primitive, which is what keeps him looking like one creature. Hanging ears, a
tail and paws off the bare logo head — the first thing tried here — read as a
mutant, not a dog.

Head bright, body mid, legs dark: that gradient separates the three without
needing an outline between them, and the whole animal carries a dark rim so he
never sinks into the wall he is chewing on.

Three states, read straight off the world, and meant to be obvious across a room:

- **digging** — body juddering, both front paws off the ground and scrabbling at
  the rock face, tail going flat out, a three-spoke bit spinning on the tile
- **trotting** — a series of little hops, legs swinging in pairs
- **sitting** — back legs folded under him, a slow breath, a blink, a pop up onto
  his feet every few seconds, a yawn a few seconds after that, and if you leave
  him long enough, Z's

## The ground

Blocks are big — 40 pixels — because a five-year-old reads "one block, one dig",
and at half that size the map was a field of detail nobody could parse.

Three grounds, in three wandering bands, each with its own hue *and* its own
marking so they still read when the light is low: pebbly tan **dirt** on top,
layered orange **clay** below it, cracked blue-grey **stone** at the bottom.
Purple-black **bedrock** is scenery you cannot dig, and it is deliberately rare —
being walled in without understanding why is the one way this game stops being fun.

Tiles are not drawn as squares. Every corner that faces open air is rounded, by a
radius that varies per tile, and every face that borders air bulges a pixel or
three past its cell. The lamp is drawn as **one** smooth glow over the finished
tiles rather than as a per-tile brightness — per-tile falloff was painting every
40-pixel cell its own flat shade, which is a checkerboard no amount of rounded
corners can hide.

## Treasure

Gold near the surface, emerald deeper, crystal at the bottom. An ore tile is
painted in the colour of the ground **around** it, with only the nuggets in
metal — fill a whole cell with gold and a seam reads as a yellow brick you can
spot the outline of from across the map.

Each nugget gets a body, an offset specular chip, a highlight band that sweeps
across the seam on its own phase, and a four-point twinkle that fires on its own
clock. The sparkle is the reward, and it arrives before the number does.

Breaking a seam throws nuggets that scatter, hang for a beat, then home in on the
satchel with a rising acceleration. The counter only ticks when one lands.

Three upgrades are buried in the earth, pulsing brighter than ore: **a faster
drill**, a **wide drill** that takes the tiles either side of the bit, and a
**brighter lamp**. They last for the level.

## The door

**The door is on screen at all times.** It runs the full height of the right-hand
wall, and the map is exactly one screen wide — 40 px tiles into a 1280 px window
is 32 of them — so there is no horizontal scrolling and nothing to go looking for.
You can see the thing you are working towards from the first frame of a level to
the last.

Two earlier versions were worse in the same way. A gate three tiles tall at one
depth meant "go right" was only half the instruction: you also had to find the
row. Making it full height fixed that but left it off screen behind a scroll, so
it needed an edge marker to stand in for itself. Fitting the map to the window
deleted both problems and the marker code with them.

It says what it wants without any text: a **padlock** on every tile of the wall
while it is shut, green with **arrows pouring rightward** once it is open. Fill
the bar — 75 on level 1, +50 a level — and it opens.

## The world

One screen wide, always. Level 1 is one screen tall as well, so the first level
does not scroll at all; later levels grow downward only. Generated from smooth
value noise offset by the level number, so a given level is the same every run —
a good seam is somewhere you can go back to.

Flooded pools open up in the mid depths. You swim straight through them; nothing
bad happens. The water does not drain when you breach it.

## Engine

Same `gfx.milo` as `../neon` and `../shatter`: additive drawing into a
linear-light `Vec<f32>`, bright-pass, separable blur at quarter resolution,
Reinhard tone map. 1280×720 at 60 fps on the CPU.

`unsafe` appears twice, both FFI — the SDL calls in `sdl.milo` and the texture
upload in `main.milo`. Worldgen, the drill and the renderer contain none.

## Headless

`shot.milo` drives the digger on a scripted path and dumps PPM frames, which is
both how the screenshots are made and a deterministic smoke test for worldgen:

```bash
milo run examples/games/dig/shot.milo --release -- /tmp/prospect 1400 4200
```
