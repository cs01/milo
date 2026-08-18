# PLINK

A neon shooting gallery on a midway. You stand behind the counter with a plastic
blaster on a tether, and a stage of five decks marches away from you covered in
printed discs. They lie flat until the machine calls one, then a spring snaps it
up to face you, it holds a couple of seconds, and it drops. Hit one anywhere and
it comes apart — there is no bullseye, only how fast you are.

```bash
milo run examples/games/plink/main.milo --release
```

The mouse aims and the trigger does everything else: it starts the round and it
fires. Right click steadies your aim, `F` is fullscreen, `ESC` quits. There is no
walking, no reloading and no ammunition count — the stage is laid out in front of
you at four honest distances, and the only thing between you and the next shot is
how fast the gun cycles.

## What is worth what

The ladder is colour-coded, and the code is the whole contract with the player:
the further back a row stands the smaller its discs are and the more they pay.

| Face | Colour | Row |
|------|--------|-----|
| 100 | red | front deck |
| 250 | blue | second |
| 500 | magenta | third |
| 1000 | orange, lit from inside | fourth |
| 5000 | hot magenta, lit harder | back deck |

A hit prints its value where the target was and the number climbs off it, so the
ladder is something you learn by playing rather than by reading this table.
Consecutive hits build a multiplier to 6x, and the machine pushes harder as the
clock runs down: more discs up at once, less time on each. A round is 60 seconds.

**The mega bonus** is the number on the marquee, and the drone is how you get it.
It patrols the hall on two incommensurate periods so it never repeats a pass, and
every thirteen seconds it drops a gold `BONUS` target onto whichever rig it
happens to be over. The bar lights up when one is out. It holds for under four
seconds.

Nothing in this room that looks like a target is unshootable. There is no
decoration shaped like a disc: a thing you cannot shoot that looks exactly like a
thing you can is a lie the player finds out about by wasting a shot on it. What
dresses the walls instead is Milo — the chihuahua from `../volt` and `../yap` —
in a lit box, plus banners and speaker stacks.

## How it is built

Nothing loads from disk. The carpet, the tread plate, the panelling, the chrome
and the glass are procedural; so are the marquee, the banners, the Milo plaque and
every target face, which live in one 3x3 atlas and are drawn from the same stroked
font the HUD uses.

Everything renders on the GPU through the `gl` package and needs an OpenGL 3.3
core context: a tabulated interior environment integrated once at startup, a
depth+normal prepass feeding screen-space ambient occlusion, shadow maps filtered
through a rotated twelve-tap disc, GGX with room irradiance for ambient, sixteen
point lights placed *at* pieces of glowing geometry, bloom and an ACES tone map.

Two things carry the look:

- **One neon bucket.** Its material has a black albedo and a white emissive, and
  the shader multiplies emissive by the vertex tint — so a single draw call paints
  every tube, bulb, light channel and deck lamp in the room in whatever colour and
  at whatever brightness the geometry asked for.
- **`emissiveMap`.** With it set, emissive is masked by the albedo texture, so a
  printed sign glows in the shape of what is printed on it. That is why the number
  on a target lights up and the disc around it does not.

The view model is drawn in the scene's own frustum with the depth buffer live, not
in a private frustum with the depth test off. That is why it looks solid. Its bore
is the local -Z axis and it is cocked only eight degrees across the view: any more
and the bolt — which leaves along the aim line — visibly fails to come out of the
barrel.

## Capture

`--shot out.png` renders one frame and exits, which is how every change to the
lighting here was actually judged. `--pitch`, `--yaw`, `--x`, `--z` aim that
capture, `--warmup N` runs the wave logic forward first so the stage is not bare,
`--boom N` breaks a target every N frames, `--house` scales the room light without
touching the neon, `--scale` trades scene resolution for frame rate, `--attract`
holds the title screen, `--aim` holds the sights up, and `--debug 3` shows the
ambient-occlusion buffer on its own.
