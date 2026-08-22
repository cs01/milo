# Blog post outline — "Going Full Bore on Second-Class References"

Working titles (pick one, keep it matklad-plain):
- Going Full Bore on Second-Class References
- Ownership That Splits, Seals, and Freezes
- What If the Move Checker Is the Whole Borrow Checker?

Genre: matklad-style mechanism post. Hook + mechanism + measurements + generous
prior art. NOT a paper; say so in the first section.

## 1. The hook: two objections, quoted

Open with the two standing critiques of reference-free designs, quoted directly:

- Borretti 2023 ("Second-Class References"), weighing this design for Austral and
  stepping back: indices dangle, indices hit the wrong pool, iterators unclear,
  part-whole conflict — "the costs are also great."
- The ersatz-pointer objection: indices as substitute pointers bring "all the usual
  pathologies of manual memory management."

Thesis sentence: Milo went full bore anyway, and this post is the point-by-point
answer — with a shipping compiler and numbers, not an argument.

## 2. The axiom, in one screen

Values are closed. References are second-class: parameters only, never stored,
never returned. No lifetimes anywhere. What that buys (no borrow checker to learn,
no coloring, cheap proofs) and the three workloads it conceded — quote the residue
doc verbatim. Honesty about the concessions IS the credibility of the answer;
lead with it.

## 3. The idea: consuming moves into restricted types

One paragraph, no jargon: when Rust would prove a property of a reference, Milo
removes the operations that could violate the property, and the move checker proves
the removal. Then the three instances as a table:

| Rust proves | Milo removes | via |
|---|---|---|
| disjoint &mut borrows | aliasing (ownership divides) | shatter/weld |
| borrow outlives referent | invalidation (mutation absent) | seal + spans |
| stale reference | staleness (remove absent) | freeze |

## 4. Three mechanisms, three benchmarks

One section each: ~15 lines of real Milo, then the measured table row.
- Fission: 148ms/314MB (forced copies) -> 20ms/158MB, = C pthreads. The "banned
  workload" runs.
- Seal/span: 3M allocations -> ~25; RSS delta = the copied payload, exactly; 1.4x
  (state the missed 2x prediction — publishing the miss is the post's honesty
  signal).
- Freeze: 2.2x lookups, and the money screenshot: `error: use of moved variable
  'pool'` — Rust says "cannot borrow"; Milo says "moved"; same rejected program.

## 5. Borretti's costs, revisited line by line

- Dangling index -> generation check (runtime, demoted) or freeze (static, gone).
- Wrong pool -> newtyped handle (compile) + container identity (runtime).
- Iterators -> existence proof: the stdlib, a self-hosted compiler, and a JS engine
  all iterate with frozen-during-for-in sources.
- Threads ("worse when threads are involved") -> sealed buffers are Send+Sync;
  shatter gives in-place parallelism — the two things 2023 didn't imagine this
  design reaching.
- Part-whole conflict -> STANDS. Concede it in full; quote his own hedge about
  local reasoning. A post that concedes nothing convinces nobody.

## 6. The pathology audit (the ersatz-pointer answer)

Compressed from the frozen-pools doc: UAF demoted to deterministic None; wild reads
bounds-checked; confusion newtyped; leaks/double-free have no analogue (pools drop
whole); the "manual discipline" is a compiler-enforced type transition. Concession:
free-and-reuse pools keep runtime checks — a class Rust rejects statically.
Counterpoint: slotmap/petgraph/ECS mean idiomatic Rust already lives in this index
layer, borrow checker silent.

## 7. Prior art (generous, early, specific)

Verona's freeze (consume iso -> immutable graph) — closest relative to seal/freeze.
Vale: generational references + immutable region borrowing — same insights through
regions. Hylo/MVS + Graydon's "second-class & was the sweet spot" — the decision
itself. vecshard / concurrent-slice — shatter/weld as Rust crates (name collision
and all). Legion/Regent partitions. Frame: four independent designs converged on
these mechanisms; the contribution claimed is ONLY the setting — smallest type
system of the group, zero new checker rules, and measurements. Invite corrections;
someone will know a fifth ancestor and that improves the post.

## 8. Close

What's prototype vs shipped (be exact: userspace prototypes, one core, self-graded
— the 8-core std/shard results are the sequel post). End on the one-liner: the
axiom survives — nothing aliases in, nothing escapes out; ownership just learned to
split, seal, and freeze.

## Pre-publish checklist

- [ ] Re-run all benchmarks on 8-core hardware; update every table.
- [ ] Ship std/shard or label every number PROTOTYPE in the tables themselves.
- [ ] The churning-graph benchmark vs Rust slotmap (the strongest comeback to §6) —
      have it in hand before the comment thread asks.
- [ ] Link the three plan docs + benchmarks/ folder in the repo.
- [ ] Someone other than the designer reproduces the numbers.
