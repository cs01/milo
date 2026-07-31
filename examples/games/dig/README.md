# PROSPECT — a digging game in Milo

```bash
milo build examples/games/dig/main.milo -o /tmp/prospect --release && /tmp/prospect
```

| | |
|---|---|
| arrow keys or WASD | hold a direction to dig |
| ESC | quit |

You start above ground — sun, clouds, a tree, the pit-head, and Milo waiting at the
top of the shaft. The mascot is lifted pixel-for-pixel out of
`docs/site/public/logo.svg`, so he is the same 18×18 dog that is on the homepage.

**There is no timer, nothing chases you, and you cannot lose.** Hold a direction
and the drill bites; softer ground gives way faster than stone.

Each level runs **west to east**: fill the value bar, which unlocks the gate on the
right, then dig over to it. The gate glows from anywhere on the map and an edge
marker gives its distance, so "head east" always has something to aim at.

Level 1 is a single screen wide and needs 90 in value — a couple of minutes. Levels
grow mostly *downward* from there, with a bigger quota and more bedrock in the way,
so later ones are mazes rather than open dirt.

Three upgrades are buried in the earth, pulsing brighter than ore so you can spot
them: **a faster drill**, a **wide drill** that takes the tiles either side of the
bit, and a **brighter lamp**. They last for the level.

Ore glows faintly on its own, so a seam shows up at the edge of the lamp before you
can see what it is — which is the entire hook. Gold is common near the surface,
emerald sits deeper, and crystal only appears in the bottom third.

Flooded caverns open up in the mid depths. You swim straight through them; the
surface is two travelling sine waves with a lit crest and caustic banding
underneath. The water does not drain when you breach it — a flooded cavern stays
flooded, and is a shortcut rather than a hazard.

Breaking a tile throws a dust cloud that swells and thins out in about a third of a
second, plus solid chunks that arc away and fall. Dust drifts upward and has heavy
drag; debris has gravity and almost none. Same particle struct, different numbers.

## The world

The playable box grows with the level, from one screen wide up to 96 × 110 tiles.
It is generated from smooth value noise with a fixed hash offset by the level
number, so a given level is the same every run — a good seam is somewhere you can go
back to. Depth drives everything: harder rock, rarer ore, bedrock pillars.

Ore does not go straight into the counter. Breaking a seam throws nuggets that
scatter, hang for a beat, then home in on the satchel with a rising acceleration;
the counter ticks and the total punches larger when one actually lands.

Only the tiles inside the view are ever touched, and each is lit by distance from
the lamp. The darkness is what makes a tunnel feel like a tunnel instead of a grid
of brown squares.

## Engine

Same `gfx.milo` as `../neon` and `../shatter`: additive drawing into a linear-light
`Vec<f32>`, bright-pass, separable blur at quarter resolution, Reinhard tone map.
1280×720 at 60 fps on the CPU.

`unsafe` appears twice, both FFI — the SDL calls in `sdl.milo` and the texture
upload in `main.milo`. Worldgen, the drill and the renderer contain none.

## Headless

`shot.milo` drives the digger on a scripted path and dumps PPM frames, which is
both how the screenshots are made and a deterministic smoke test for worldgen:

```bash
milo run examples/games/dig/shot.milo --release -- /tmp/prospect 1400 4200
```
