# NEON — an arena shooter, and an argument

A twin-stick arena shooter in ~3,100 lines of Milo. Software-rendered HDR neon with
bloom, a mass-spring background lattice every system pushes on, a dozen enemy
behaviours, a run-scoped upgrade system, and a boss with destructible armour.

```bash
milo run examples/games/neon/main.milo --release
```

| | |
|---|---|
| WASD / arrows | move |
| mouse, or arrow keys | aim — firing is automatic while aiming |
| SPACE | bomb |
| 1 2 3 | pick an upgrade between waves |
| ENTER | restart |
| ESC | quit |

No GPU work beyond a texture blit: the frame is drawn by loops over `Vec<f32>` and
tone-mapped on the CPU. 1280×720 at 60 fps, ~9 ms of that in the renderer.

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
| **Homing missiles** hold their mark. The mark can die mid-flight — often to a different bullet in the same frame. | A stored pointer dangles; a stored index silently retargets onto whatever got recycled into that slot. | `world.milo:1282` |
| **Snake segments** are a doubly linked chain. Shoot one out of the middle and the chain has to splice itself back together, in both directions, and the head has to be promoted if it was the head that died. | Classic intrusive doubly linked list mutation — the thing `Rc<RefCell<>>` exists for. | `spliceChain`, `world.milo:694` |
| **Boss armour** orbits a core. Each plate points at the core, the core counts its plates. A plate's death mutates the core (speeds it up, unlocks its weak point); the core's death kills every plate that points at it. | Parent↔child cycle with mutation flowing both ways. | `world.milo:636`, `world.milo:1106` |
| **Healer drones** pick a wounded enemy, fly to it, mend it, and pick someone new when the patient dies or gets healed. The beam is drawn from the same link. | An entity holding a mutable claim on another entity across frames. | `world.milo:1040` |
| **Black holes** pull the player, every other enemy, every particle, every bullet, *and* the background lattice — and swallow enemies whole, which mutates the hole. | One entity reaching into five containers, deleting from one of them mid-iteration. | `pullEnts`, `world.milo:1205` |
| **Chain lightning** walks from the enemy you hit to nearby ones, damaging each, where damage can kill, which can split, which spawns entities the walk must not revisit. | Graph traversal over a set that mutates during the traversal. | `onBulletHit`, `world.milo:848` |
| **Deaths cascade.** A death spawns particles, drops pickups, splits into children that inherit state, shoves the lattice, bumps score, and may hand the player a bomb — depending on perks chosen at runtime. | One event, seven systems. | `onDeath`, `world.milo:580` |
| **Every spring in the lattice** applies equal and opposite impulses to two nodes of the same `Vec`. | Two `&mut` into one container — what `split_at_mut` and `unsafe` are for in Rust. | `springPair`, `grid.milo:62` |

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
writer (`shot.milo`). `gfx.milo`, `grid.milo`, `world.milo` and `render.milo` — the
renderer, the physics and all of the gameplay — contain none.

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
   `&Shapes` all flowing through one call). The cost of that is the restriction in the
   next section — which is real, and is the honest price.

## The price, stated plainly

The one place the restriction bit was a shape lookup. This is a compile error:

```milo
fn shapeFor(s: &Shapes, k: Kind): &Vec<f64> {   // can't return a reference
    match k { Kind.Seeker => { return s.diamond } ... }
}
```

The fix was to invert it — hand the *drawing* to the lookup instead of getting a
borrow back out of it (`drawShape`, `render.milo:76`). That is a genuine restructuring
that Rust would not have asked for, and on a bigger shape table it would want a
`Vec<Vec<f64>>` indexed by an id instead. It is a real constraint, not a free lunch.
It cost about ten minutes and one function.

Papercuts found while writing this, none of them about references:

- `Vec` has no `clear()` or `truncate()` — the grid rebuild pops in a loop.
- `let _ = f()` twice in one scope is *"variable '_' already declared"*. `_` should be
  a fresh binding every time; it is the conventional discard.
- A float literal in a binary expression stays `f64` and will not narrow to an `f32`
  operand, so `1.0 - someF32` fails. Needed a module-level `ONE_F32` (`gfx.milo`).
- `W.toString()` where `W` is a module-level `pub let` parses as enum access. Binding
  it to a local first works.

## Files

| File | What |
|---|---|
| `world.milo` | entities, handles, AI, collisions, perks, waves — the argument |
| `grid.milo` | the mass-spring lattice everything pushes on |
| `gfx.milo` | HDR canvas: additive lines and blobs, bright-pass, blur, tone map |
| `render.milo` | world → pixels; reads everything, mutates nothing |
| `main.milo` | window, frame loop, input |
| `sdl.milo` | SDL2 FFI, input snapshot |
| `font.milo` | generated 5×7 bitmap font |
| `shot.milo` | headless capture — runs a scripted pilot, dumps PPM frames |

`shot.milo` doubles as a deterministic smoke test for the whole simulation:

```bash
milo run examples/games/neon/shot.milo --release -- /tmp/neon 110 260 400
```
