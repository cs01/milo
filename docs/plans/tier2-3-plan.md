<!-- doc-meta
system: plan
purpose: sequenced attack plan for Tier 2 (core language) and Tier 3 (stdlib doctrine), plus the profile/contracts play
key-files: src/checker.ts, src/lower.ts, src/codegen.ts, docs/verification-roadmap.md, docs/residue-vs-rust.md
update-when: a tier item ships (collapse to a one-liner), or a sequencing decision changes
last-verified: 2026-07-29
-->

# Tier 2–3 plan

A plan, not a backlog. ROI-ranked working items live in [backlog.md](../backlog.md); this file is the *shape* — dependency order and the hard design interactions.

## The axiom this all rests on

Values are closed: nothing aliases in, nothing escapes out. Every item below is a dividend of that. Order the work by what hardens the axiom into a usable substrate — later items get cheaper once earlier ones seal heap facts into constants. See [residue-vs-rust](../residue-vs-rust.md) for what the axiom costs, and [ownership-model](../ownership-model.md) for the mechanism.

## Linchpin — resolved

`&mut` exclusivity **is enforced** — `checkCallSiteExclusivity` (`checker.ts:3368`). Field-path-precise, index-aware. Catches `&mut`+`&` and `&mut`+`&mut` on the same-or-contained place; allows provably-disjoint fields and `v[i]`/`v[j]` siblings.

Residual, load-bearing for the prover: static enforcement is **syntactic, call-site, arg-origin**. Sufficient for closedness (param list = frame). But index-qualified places can't be proven disjoint statically — `f(v[i], v[j])` with `i == j` gives two live `&mut` to one place, which was a **soundness hole**, not a contract TODO.

**Shipped (`codegen.ts` `emitAliasGuards`, commit `721a2ca9`):** a runtime guard — pairwise `icmp eq ptr` on by-ref arg addresses, abort if an at-risk pair coincides (fires only when ≥1 is mutable). This is what makes `noalias` on `&mut` params sound to emit: index-coincidence aliasing traps *before* the call. The SMT fact the contract prover may still lean on statically is **"distinct roots or divergent field paths,"** never "distinct indices"; the `i != j` proof obligation is the elision target that later removes the runtime check (consistent with the prover having no `IndexAccess` — see [verification-roadmap](../verification-roadmap.md)). Known gap: dynamic-dispatch receiver-vs-arg aliasing (interface `self` is prepended outside `expr.args`).

## Tier 1 — complete

All shipped to main: unary minus, `f64.NAN/INF/NEG_INF` + `isNan/isInf/isFinite`, `replace`/`swap` intrinsics (`take` deferred pending `Default`), `strContains`, `HashMap`, POD copy, integer-repr enums (`enum K: i32`, `k as i32`, `K.tryFrom(n) -> Option<K>`), and the `&mut` aliasing guard above. Most of the original brief already existed — see `[[project_tier1_ergonomics_decisions]]`.

## Sequence

```
residue-vs-rust doc  →  Drop  →  interior iteration (by-value)  →  views  →  newtypes
   [DONE]                              →  SlotMap/handles  →  profile + contracts
```

Standing lane (parallel, not post-Tier-2): safety evidence — ASAN, checker fuzzing, unsafe audit. Fuzzing the exclusivity checker is the ongoing form of the linchpin question; it never "closes."

## Tier 2 — core language

### Drop (first)
Deterministic destruction at last-owner death. Two co-designed interactions:

- **Drop × move-on-last-use — one dataflow pass, two consumers.** Last-use analysis decides *when* the last owner dies = *when* Drop fires *and* when `body = s` moves. Build the pass once; both features read it. Do not ship move-inference first and retrofit Drop.
- **Drop × coroutine frames.** A `for x in c` frame holds values mid-iteration; early `break` must run pending drops for the partially-consumed container. Design Drop's scope-exit semantics with the coroutine lowering in view.

Migration payoff = acceptance signal: move Channel / WaitGroup / Atomic onto Drop, delete the "call `.destroy()` exactly once" pitfall entries.

### Interior iteration — by-value first
Non-escaping stack coroutine; frame provably non-escaping. **Yield by value first** (over `i64`/small PODs). Enough to answer Borretti's objection and derisks the coroutine lowering *alone* — do not chain the two hardest items. Must support user-defined iterators over custom containers. Upgrade to yield `&T` once views land.

### Views (`&str`, `&[T]`)
Same second-class rules as existing refs + hardcoded elision (return a view only when exactly one ref param to derive from — Rust's rule, zero syntax). Lower risk: mostly a checker extension. Kills transient clones and the yaml line-rewrite hack. Deletes residue #3's *transient* half; stored zero-copy stays offsets.

### Newtypes (`struct NodeId(i64)`)
Zero-cost wrapper. Cheapest item, biggest safety-per-line — bare-`i64` cross-pool indexing is the live hole. Gates SlotMap typed keys.

## Tier 3 — stdlib doctrine

- **SlotMap + generational handles** = blessed collection for stored/graph/long-lived data. Stale handle → deterministic error. Pair with newtyped keys. Depends on newtypes. The answer to "how do I store references" — idiom, not folklore.
- **Task.join() footgun** — register unconditionally at spawn, or make late join a hard error, not a silent hang. Independent, no design risk; can pull earlier.
- **Move-on-last-use** — folded into Drop's dataflow pass above.

## Profile + contracts (after the frozen-pool/branding substrate)

Sealing turns heap facts into constants → proofs collapse. Build this *after* Tier 2.

- **Profile = restriction dial**, enforced **per-function, module defaults.** Incremental proof only feels incremental if one hot function opts in without dragging its module. Strict forbids: manual `destroy` (Drop only), bare-integer handles, unfrozen-pool deref, `unsafe impl Send/Sync`, optional stack bounds.
- **Contracts = proof dial**, first-order over values (`requires`/`ensures`/quantifiers). **Never expose `∗`/points-to.** Separation is structural in Milo, so users write plain SMT-dischargeable predicates — that invisibility is the whole gift.
- **Check elision — the killer mechanic.** Every contract = runtime assert in debug (zero adoption cost); deleted in release where the prover discharges it. Generational-handle checks become the fallback for unproven obligations, not a tax. Graceful degradation lifetimes structurally can't do.

### Separation logic — exploit by omission
Milo is a smaller decidable fragment of the logic RustBelt encoded into Iris. Disjointness is a *theorem of the language*, not a proof obligation of the program → frame rule = param list → first-order SMT suffices (same reason SPARK skips SL). Uses, ascending:
1. Keep it invisible in user contracts (the point).
2. **Trusted-core soundness.** *Honest sequencing:* full "MiloBelt in Iris" is person-years of specialist work — keep it as roadmap, not near-term. The nearer-term version is a **Miri-analog interpreter** that catches the same stdlib-primitive bug class empirically. Sequence: **interpreter → then maybe Iris.**
3. Bi-abduction (Infer-style) to synthesize unsafe-core/FFI contracts. Speculative; note, don't scope.

Scope contracts to **sequential code first**. Concurrency contracts (channel protocols, atomics) are a research problem — and the green-task model puts most logic in sequential code anyway. Note for later: `ch.send(val)` moving the value *is* CSL's ownership-transfer axiom as a type rule.

Niche this buys: **verified-leaf-library language** — TLS record layer, network-facing parser, seatbelt-grade state machine, freestanding, contracts discharged, no runtime checks left. The SPARK niche without the Ada.

## Acceptance test (Tiers 1–2)

Rewrite the yaml library. Success:
- line-rewriting indentation hack gone
- `.clone()` count down an order of magnitude
- `cloneNode` is one line
- all pool indices newtyped
- no `destroy()` calls in stdlib-using code

Exercises Drop + iterators + views + newtypes together — the integration test for all of Tier 2.
