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
and the drill bites; softer ground gives way faster than stone. The only question
the game ever asks is where to go next.

Ore glows faintly on its own, so a seam shows up at the edge of the lamp before you
can see what it is — which is the entire hook. Gold is common near the surface,
emerald sits deeper, and crystal only appears in the bottom third.

Flooded caverns open up in the mid depths. You swim straight through them; the
surface is two travelling sine waves with a lit crest and caustic banding
underneath.

## The world

220 × 90 tiles, generated from smooth value noise with a fixed hash, so the map is
the same every run — a good seam is somewhere you can go back to. Depth drives
everything: harder rock, rarer ore, bedrock pillars that give the deep mine shape.

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
