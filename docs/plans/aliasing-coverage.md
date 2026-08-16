<!-- doc-meta
system: aliasing-coverage
purpose: kill the recurring "rule covers one spelling, not its siblings" defect class in the checker
key-files: src/checker.ts (placesOf, freeze/unfreeze), tests/errors/forInField*.milo, tests/aliasingMatrix.test.ts
update-when: a phase lands, a new aliasing rule is added, or a new leak of this class is found
last-verified: 2026-08-16
-->

# Aliasing coverage: making rule coverage mechanical

## The defect class

Every use-after-free found in this compiler in safe code has had the same shape. It is
not eight bugs, it is one bug with N front doors:

> An aliasing rule is implemented against a **node kind** rather than against a
> **place**, so it covers the one spelling its author was looking at and silently
> exempts every sibling spelling.

Confirmed instances (2026-08-16, all ASan-verified heap-use-after-free in safe code with
zero `unsafe`):

| Spelling | Before | Rule that missed it |
|---|---|---|
| `for x in v { v.push(..) }` | rejected | — |
| `for x in b.items { b.items.push(..) }` | **UAF** | for-in freeze keyed to `kind === "Ident"` |
| `for x in b.items { f(b) }` where `f(&mut Bag)` | **UAF** | same |
| `for k,v in r.m { f(r) }` where `f(&mut Reg)` | **UAF** | hashmap arm, same key |
| `for s in h.a { f(h) }` (fixed array) | wrong value read | array arm, same key |

Earlier instances of the identical shape, already closed: move-out-of-borrow through a
fork (`return if c { d.a } else { d.b }` compiled while `return d.a` errored), the
`index-clone` lint firing only where a value was *bound* and not where it was *returned*,
and `Vec<&T>` bypassing second-class references.

The cost is asymmetric here: "no use-after-free in safe code" is the product. A missed
spelling is not a papercut, it is the guarantee failing.

## What already exists

`placesOf(e: Expr): Place[]` in `src/checker.ts` is the right primitive and is already
total over the `Expr` grammar:

- `Place` is `path` (root + steps) | `value` (fresh, aliases nothing) | `opaque`
  (unnameable — callers must read as *may be any place*).
- The switch has **no `default:`** and ends in `const _exhaustive: never = e`, so adding
  an AST node is a tsc error until it is classified.
- It returns a **set**, because control flow forks; a caller must satisfy its rule for
  every member.

The problem is not the primitive. It is that only ~12 call sites route through it, while
the checker still contains dozens of rules that switch on `expr.kind` directly. `placesOf`
being total does nothing for a rule that never calls it.

## The four phases

### Phase 1 — hoist the for-in freeze (this is the live UAF)

One freeze, computed from `placesOf`/`accessPath` on the iterable, taken **before** the
per-type dispatch and released after it. Every iteration shape — vec, hashmap, array,
string, user iterator, and any shape added later — inherits it instead of re-deriving it.
Removes four ad-hoc `kind === "Ident"` blocks.

**Done when:** the five rows in the table above are rejected, benign field iteration
(mutating a *different* field of the same struct) still compiles, and fixtures lock both
directions.

### Phase 2 — route the remaining rules through `placesOf`

Inventory every rule that answers "what storage does this expression reach" and convert
it. The ad-hoc walkers to eliminate or reduce to thin wrappers: `accessPath`,
`borrowBasePath`, `staticFieldPath`, `isRootMutable`, `freezeViewSource`,
`errorIfFrozen`, `setAutoBorrowChecked`, `checkViewProvenance`.

Two known traps, both learned by breaking them:

1. **`placesOf` and `moveTargets` must stay separate.** `s as *u8` on a `&string`
   *reaches* the operand's storage (placesOf forwards) but *consumes nothing*
   (moveTargets does not). Collapsing them broke 12 std fixtures.
2. **`errorIfFrozen` must not run on an argument that is already a reference.** A slice
   `v[0..2]` is not competing with a freeze, it *is* one; disjointness is
   `checkCallSiteExclusivity`'s job because it compares access paths and knows
   `v[0..2]`/`v[2..4]` do not overlap, which the freeze check cannot see.

### Phase 3 — make bypass detectable

A total walker does not help if a new rule simply does not call it. Add a gate that fails
when an aliasing-relevant rule reaches for a node kind instead of a place. Cheapest honest
version: a test that reads `src/checker.ts` and fails on `.kind === "Ident"` inside the
freeze/borrow/move regions, with an explicit allowlist carrying a reason per entry — the
same shape as the soundness manifest, so exemptions are written down rather than implied.

### Phase 4 — a spelling matrix, generated not remembered

The real fix for "did I cover every spelling" is to stop answering it from memory.
Generate the cross product of

- **container**: `Vec<T>`, `HashMap<K,V>`, `[T; N]`, `&[T]`, `string`, user iterator
- **root**: local, struct field, nested field, index element, `self` field
- **mutation route**: direct method, direct assignment, through `&mut` fn, through a
  method on the owner, inside a closure

and assert each combination is rejected (or accepted, where disjoint). A new container or
a new root spelling adds a row; a rule that only covers one spelling fails the matrix
immediately instead of years later under ASan.

## Grade criteria

The compiler is at **B** because of this class alone. What **A** requires, concretely:

1. No aliasing rule keyed to a node kind (Phase 2 complete, Phase 3 gating it).
2. The spelling matrix green and covering every container × root × mutation route
   (Phase 4).
3. A new `Expr` kind or a new container type inherits every existing aliasing rule by
   default, and the way to *escape* a rule is an explicit, written exemption.

Until 1–3 hold, the honest position is that the next spelling nobody thought of is
already broken, and it will be found by a user rather than by a gate.
