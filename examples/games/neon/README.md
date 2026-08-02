# NEON — a horizontal shooter, and an argument

An R-Type-shaped side-scrolling shooter in ~4,900 lines of Milo. Hand-authored
biomechanical pixel art over a software HDR renderer with bloom, a procedurally
generated cave you have to fly through, a charge beam, indestructible pods that
fight for you, and a boss with destructible armour — with no upgrade menu
anywhere in it.

```bash
milo run examples/games/neon/main.milo --release
```

| | |
|---|---|
| arrow keys, or WASD | fly — this is the only control you need |
| SPACE, held | charge the beam; let go to fire it |
| — | the gun fires by itself, and it fires right |
| ENTER | restart |
| ESC | quit |

No GPU work beyond a texture blit: the frame is drawn by loops over `Vec<f32>` and
tone-mapped on the CPU. 1280×720 at 60 fps, ~7 ms of that in the renderer.

## The look

There is no asset directory and no loader. Every sprite in `sprites.milo` is pixel
art written as strings — one character per pixel, `'.'` transparent, `'0'`–`'9'`
indexing a palette — and the pickups are generated from their own geometry rather
than drawn by hand.

A palette entry is three floats of **linear light**, and the values run past 1.0 on
purpose. An eye at 2.6 clears the bloom threshold and glows; the carapace at 0.3
beside it does not. That contrast is the whole look, and it is why the art is
authored in linear light rather than in 8-bit colour.

The canvas takes two kinds of ink. `blend` is alpha-over, for anything with mass —
hull plating, rock, sprites — and `add` is additive, for anything that emits. The
first version of this renderer was additive-only, which cannot draw a solid dark
shape at all; a side-scroller through a cave is mostly solid dark shapes, so
`gfx.milo` grew a blend path.

That split is also a readability rule, and breaking it was a real bug. The cave
originally had pulsing red lights set into it, drawn additively — so they bloomed,
in the exact visual channel the game uses for incoming fire, and you could not tell
scenery from a bullet. Scenery is now blended, cold and unlit. Red that glows and
moves means something is trying to kill you, and nothing else is allowed to say it.

The same rule is why every projectile is a sprite rather than a glow. Colour alone
does not survive a lit wall behind it, so **shape** carries the meaning: a flat
lance is yours, a round bead with a black rim and a white-hot centre is incoming, a
finned body with a flame is a missile, and the big cyan lance is the charge beam.
None of those require resolving a hue under pressure.

The wall itself is four depths of one organism, all procedural, all rectangles: a
far field of bulbous lumps, a segmented ribcage seen from the inside, a nearer lump
field, and tendrils hanging off the roof at the closest depth. Each lump is seven
bands of circle-width with the light falling off top to bottom, and its warmth is
hashed per lump so the wall is flesh-over-bone rather than one flat grey. The cave
you can actually crash into is drawn near-black with a lit bone lip on the edge, so
the thing that kills you silhouettes against the thing that cannot — when both were
the same brightness the level was unreadable, which was the whole complaint.

## Pickups are things, not menus

The previous version of this game stopped every other wave and asked you to press
1, 2 or 3. That is a spreadsheet interrupting a shooter. It is gone.

What is left is an **orb**: a glowing thing that falls out of a carrier you shot,
or out of the last member of a squad you cleared. It pulses, it drifts, and when
you get within 200 px it comes to you. Touching it upgrades the ship on the spot
and names itself where you caught it — `POWER UP`, `POD ONLINE`, `MISSILES`,
`SHIELD UP`, `THRUSTERS` — and then the game carries on, because it never stopped.

An orb is never a dud. The drop reads the ship first and picks whatever it is
missing (`pickOrbType`, `world.milo`), so there is no such thing as catching one
you already had. The only decision an orb asks for is whether you can reach it,
which is a flying decision, which is the decision this game is about.

The shield is the exception that does not need collecting: once broken it grows
back on its own after thirteen clean seconds, with a bar in the HUD counting it
down. A shooter where one mistake compounds into the next one is not hard, it is
brittle, and the pickup that fixes that should not itself depend on luck.

The best of them is the **pod**. It is a second glowing thing that trails behind
you on a spring, shoots forward on its own, and eats bullets aimed at you. It
cannot be destroyed. Two of them bracket the ship and start arcing lightning
between targets on hit. You never aim it, never manage it, and never lose it.

## The cave

The stage scrolls right at 210–340 px/s through a cave generated one column at a
time (`terrain.milo`). Two height fields are shifted left a column at a time and
sampled with linear interpolation; the generator walks toward a randomly chosen
aperture rather than jittering, and the vertical change per column is capped, so a
wall you cannot fly around never appears. The aperture tightens by stage.

The rock stops bullets, mounts turrets that ride it as it moves, and kills you on
contact. It is the only thing in the game that kills you without shooting at you.

The charge beam ignores it — hold SPACE for a second and let go, and a lance goes
down the lane at 1450 px/s, punching through everything and burning return fire
out of its own path.

---

## What this is arguing about

Milo has [second-class references](../../../docs/language-reference.md#references-second-class):
`&T` and `&mut T` exist as function parameters and locals, and cannot be returned or
stored in a struct or a collection. That buys memory safety with no lifetime
annotations. The standing objection is that it must fall apart on real programs, and
the sharpest form of the objection is about games specifically:

> Handles work for scientific software — graphics engines, physics — because
> data-oriented design lets you supply indices and look the data up elsewhere. I want
> to see something *messier*, like gameplay code.

That is a fair challenge and this example is aimed squarely at it. A particle system
proves nothing; an ECS with uniform numeric systems proves nothing. The interesting
cases are the ones where objects hold onto *other objects* that can die underneath
them, and where one event reaches into several unrelated places at once.

So the gameplay here is deliberately tangled.

## The messy parts, and where they are

| Gameplay situation | Why it is awkward | Where |
|---|---|---|
| **Homing missiles** hold their mark. The mark can die mid-flight — often to a different bullet in the same frame. | A stored pointer dangles; a stored index silently retargets onto whatever got recycled into that slot. | `updateBullets`, `world.milo` |
| **Snake segments** are a doubly linked chain. Shoot one out of the middle and the chain has to splice itself back together, in both directions, and the head has to be promoted if it was the head that died. | Classic intrusive doubly linked list mutation — the thing `Rc<RefCell<>>` exists for. | `spliceChain`, `world.milo` |
| **Boss armour** orbits a core. Each plate points at the core, the core counts its plates. A plate's death mutates the core (speeds it up, shortens its reload, exposes its weak point); the core's death kills every plate that points at it. | Parent↔child cycle with mutation flowing both ways. | `spawnBoss` / `onDeath`, `world.milo` |
| **Healer drones** pick a wounded squadmate, fly to it, mend it, and pick someone new when the patient dies or gets healed. The beam is drawn from the same link. | An entity holding a mutable claim on another entity across frames. | `pickPatient`, `world.milo` |
| **Squad payouts.** A formation shares a counter that belongs to the world, not to any member. Killing the last one drops a pickup; letting one escape off-screen means nobody pays. | A death mutating shared state the dying object does not own, keyed by an id it merely carries. | `onDeath`, `world.milo` |
| **Pods** track a mark, shoot at it, absorb hostile bullets, and rewrite what *your* bullets do on hit once there are two of them. | One entity changing the behaviour of a system it is not part of. | `podUpdate` / `onBulletHit`, `world.milo` |
| **Terrain turrets** are bolted to a height field that is regenerated underneath them as it scrolls. | An entity whose position is owned by a completely different subsystem. | `updateEnts`, `world.milo` |
| **Mines** detonate into a radial volley when killed *or* when you get near, which happens inside the loop that is iterating the entities. | Spawning into a container mid-iteration, from a death path that is also reachable from `damage`. | `onDeath`, `world.milo` |
| **Every spring in the lattice** applies equal and opposite impulses to two nodes of the same `Vec`. | Two `&mut` into one container — what `split_at_mut` and `unsafe` are for in Rust. | `springPair`, `grid.milo` |

## How it works out

Every cross-object link is a **generational handle**, not a reference:

```milo
pub struct Handle { slot: i64, gen: i64 }
```

Entities live in fixed slots that are never compacted. Death bumps the slot's
generation and pushes the slot on a free list. Every outstanding handle to that
entity stops resolving, everywhere, with nothing notified:

```milo
pub fn kill(w: &mut World, slot: i64) {
    w.ents[slot].alive = false
    w.ents[slot].gen = w.ents[slot].gen + 1
    w.free.push(slot)
}

pub fn alive(w: &World, h: &Handle): bool {
    return w.ents[h.slot].alive && w.ents[h.slot].gen == h.gen
}
```

Two `&mut` into one `Vec` never comes up, because the operation takes indices and the
container:

```milo
fn springPair(g: &mut Grid, a: i64, b: i64, rest: f64, k: f64, dt: f64) {
    ...
    g.nodes[a].vx = g.nodes[a].vx + dx * f * ima
    g.nodes[b].vx = g.nodes[b].vx - dx * f * imb
}
```

`unsafe` appears three times in the whole program, all of it FFI: SDL input polling
(`sdl.milo`), window setup and the texture upload (`main.milo`), and the screenshot
writer (`shot.milo`). `gfx.milo`, `grid.milo`, `terrain.milo`, `world.milo` and
`render.milo` — the renderer, the cave, the physics and all of the gameplay —
contain none.

## "But that's just indices, which is what everyone does"

Correct, and worth being precise about what that does and does not concede.

**Conceded:** Milo did not remove the need to think about identity. Rust game code
reaches for slotmaps and generational indices too, and for the same reason.

**Not conceded** — three things are different:

1. **The pattern is the default, not the escape hatch.** In Rust you reach for a
   slotmap after the borrow checker refuses the thing you wrote first. Here there is
   no first attempt to refuse: `struct Bullet { target: &Ent }` is rejected at the
   declaration, so the shape of the program is settled before any of it is written.
   Nothing in this codebase was restructured to appease a checker, because the
   restriction is on the type, not on a flow analysis you have to model in your head.

2. **The failure mode is different in kind.** A recycled slot is the classic bug in
   the index approach — entity 7 dies, entity 7's slot gets refilled, and the missile
   that was chasing the old one now chases the new one. That is not memory-unsafe, so
   Rust does not catch it either; it is a gameplay bug that shows up as "why did that
   missile turn around." The generation counter makes it a *checked* condition, and
   `alive()` is the single place it is checked.

3. **There are no lifetime annotations anywhere in this program**, including in the
   renderer, which is the part that would want them most (`&Canvas`, `&World`,
   `&Shapes`, `&Terrain` all flowing through one call). The cost of that is the
   restriction in the next section — which is real, and is the honest price.

## The price, stated plainly

The one place the restriction bit was a shape lookup. This is a compile error:

```milo
fn shapeFor(s: &Shapes, k: Kind): &Vec<f64> {   // can't return a reference
    match k { Kind.Drone => { return s.dart } ... }
}
```

The fix was to invert it — hand the *drawing* to the lookup instead of getting a
borrow back out of it (`drawShape`, `render.milo`). That is a genuine restructuring
that Rust would not have asked for, and on a bigger shape table it would want a
`Vec<Vec<f64>>` indexed by an id instead. It is a real constraint, not a free lunch.
It cost about ten minutes and one function.

Papercuts found while writing the original arena version of this game, none of them
about references. All five were real, and all five are now fixed in the compiler:

- `Vec` had no `clear()` or `truncate()` — the grid rebuild popped in a loop.
  Both now exist and run drop glue on the discarded elements. The game uses
  `clear()` in `worldReset` so a restart reuses the storage the run grew into.
- `let _ = f()` twice in one scope errored with *"variable '_' already declared"*.
  `_` is a discard, so it now rebinds.
- A float literal in a binary expression stayed `f64` and would not narrow to an
  `f32` operand, so `1.0 - someF32` failed and needed a named `ONE_F32` constant.
  Float literals now adopt the other operand's width, like integer literals, and
  `gfx.milo` no longer carries the workaround constant.
- `W.toString()` where `W` is a module-level `pub let` parsed as a static call on a
  type named `W`. It now falls back to a method call on the variable.
- `match opt { Some(x) => … }` required writing `Option.Some`. The enum name may now
  be elided wherever the subject's type fixes it.

Writing the game also turned up a **memory leak in the compiler**, unrelated to any
of the above and much more consequential: an owned `string` produced by a call and
consumed without being stored — `"SCORE " + n.toString()`, `print(n.toString())`,
`take(n.toString())` on a `&string` parameter, `n.toString().len` — was never freed.
The HUD in this game leaked one string per label per frame, and indexing a
`Vec<string>` leaked a copy per read (`v[i]` auto-clones so the Vec stays intact).
Both fixed; `shot.milo` now runs hundreds of frames with zero leaks.

## The bug the language caught

Worth writing down, because it is the kind of bug this project keeps claiming to
care about and it turned up in ordinary play rather than in a test.

The mass-spring lattice is explicit Euler on a stiff sheet, and it is driven by
every bullet, every explosion and every black-hole pull in the game. That is only
conditionally stable. With enough simultaneous impulses it ran away, node positions
reached infinity, and the line rasteriser did this:

```milo
let iy = Math.floor(yv) as i64   // yv is +inf; the cast is defined, the result is huge
plot(c, iy + 1, x, frac, r, g, b)
```

The game stopped with:

```
runtime error: integer overflow at examples/games/neon/gfx.milo:397
```

That is a **release** build — `--release` is `-O3` here, and arithmetic is still
checked. The distinction that matters is not against C, where `(int64_t)inf` is
undefined behaviour outright; it is against a language that checks overflow in
debug and wraps in release, because release is the configuration anyone actually
plays a game in. A wrapped `iy` would have been silently bounds-rejected by
`plot`, and the symptom would have been intermittent flickering junk with no line
number attached to it.

None of this is a memory-safety bug — no dangling pointer, no aliasing, nothing a
borrow checker has an opinion about. It is arithmetic, and it is caught on a
different axis: see [overflow semantics](../../../docs/design.md), where overflow
is a correctness property rather than a debug-only assertion, and there is
deliberately no flag to turn it off.

Both halves got fixed. The lattice is now unconditionally bounded — a node may not
outrun 4000 px/s, may not stray more than two and a half cells from its anchor, and
anything already non-finite is reset — which is cheaper than tuning an energy
budget and hoping, and is also what a cloth should look like. And `line`, `spot`,
`fillRect` and `blitSprite` now reject non-finite coordinates at the door: a
drawing primitive must not be able to abort the process because the physics
upstream of it went unstable. Losing a line for one frame is the correct response
to that; losing the game is not.

## The rules that are checked rather than believed

The pacing rules live in `director.milo` as contracts, and `bun test` proves them
on every push through the compile-time contract gate:

```milo
pub fn pickSquad(intro: i64, unlocked: i64, roll: i64): i64
requires unlocked >= 1
requires roll >= 0 && roll < unlocked
ensures result >= 0 && result < unlocked
ensures !(intro > 0) || result == SQUAD_DRONES
```

The second postcondition is a bug this game actually shipped: with no `intro`
guard, your very first encounter could roll wall-mounted turrets that lead their
shots, at the point where you do not yet know what the game is. Delete the guard
and the solver refutes it — `counterexample: intro = 1, unlocked = 2, roll = 1,
result = 1` — rather than it being found by playing.

The rolls are parameters because randomness is not provable. Drawing them at the
call site leaves behind a decision that is, and the flavour rule that makes the
newest squad type rarer stays outside, in the director, where it belongs.

**Three things this cost, all worth knowing before writing your own:**

1. **It is its own file for a mechanical reason.** `milo prove` generates
   verification conditions for every function in a file that carries a contract.
   `world.milo` is two thousand lines and did not finish proving in five minutes;
   the gate runs on every push. A small pure module proves in 0.17 s.
2. **Both functions are shaped for the bundled solver.** Fourier-Motzkin decides a
   chain of up to three branches and reports `unknown — no integer witness
   (rational-only)` at four or more, because it finds a rational vertex and has no
   branch-and-bound to hunt for an integer one. `--solver=z3` proves the longer
   forms happily. So `unlockedSquads` is a clamp-and-offset rather than the
   five-arm staircase it reads as. That is a real constraint, not a free lunch.
3. **Contracts cannot see NaN.** Floats are modelled as reals, so
   `ensures result == result` — false under IEEE 754 — is reported **proven** for
   an arbitrary `f64`. A contract can bound a float, and the lattice clamp above
   would verify happily, but it could never have caught the non-finite value that
   aborted this game. That was the runtime overflow check's job, and the division
   of labour is worth stating plainly: **contracts cover the algebra, runtime
   checks cover the domain.**

And two of the three bugs that actually cost time here are not contract-shaped at
all. The camera-shake mismatch was a consistency property between two call sites
in different modules — no ghost state to hang it on — and it got fixed by moving
the camera onto the `Canvas` so no draw site can omit it. Scenery blooming in the
same visual channel as enemy fire is perceptual, and got fixed by the blend/add
split. Both are *make the wrong thing unspellable*, which is a different tool from
*prove the right thing holds*, and a real program needs both.

## Files

| File | What |
|---|---|
| `world.milo` | entities, handles, AI, collisions, pickups, the stage director — the argument |
| `director.milo` | the pacing rules, as contracts the compile-time gate proves |
| `terrain.milo` | the scrolling cave: two height fields and the generator that walks them |
| `sprites.milo` | every sprite, as strings; the pickups are generated |
| `grid.milo` | the mass-spring lattice everything pushes on |
| `gfx.milo` | HDR canvas: blend + additive ink, sprite blitter, bright-pass, blur, tone map |
| `render.milo` | world → pixels; reads everything, mutates nothing |
| `main.milo` | window, frame loop, input |
| `sdl.milo` | SDL2 FFI, input snapshot |
| `font.milo` | generated 5×7 bitmap font |
| `shot.milo` | headless capture — runs a scripted pilot, dumps PPM frames |

`shot.milo` doubles as a deterministic smoke test for the whole simulation:

```bash
milo run examples/games/neon/shot.milo --release -- /tmp/neon 400 560 720
```
