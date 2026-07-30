# Enum niche optimization (null-pointer niche) — implementation plan

**Goal.** Shrink `enum` with a fieldless variant + a single non-null-pointer payload variant from 24 B (i32 tag + 4 pad + ptr) to 8 B (just the ptr; `null` encodes the fieldless variant). This is Rust's NPO. Measured to be the *entire* Milo-vs-C gap on `benchmarks/binarytrees` (backlog Tier-2 #15). Payoff is broad: every `Option<Heap<T>>`, `Option<&T>`, pointer-payload enum in std + the self-hosted compiler shrinks.

**Confirmed baseline (2026-07-30):** `enum Tree { Leaf(i32), Node(Heap<Tree>, Heap<Tree>) }` → `sizeOf` = 24. Non-niche.

## Eligibility (start narrow, prove it, then widen)
First slice: enum with EXACTLY 2 variants where
- one variant is fieldless (the "none" side), and
- the other has EXACTLY ONE field whose type is a **non-null pointer** — `Heap<T>` first (its `null` bit pattern is unused: a live `Heap` is never null). Later: `&T` views, then `ptr`-payload, then multi-field where a niche field exists.

Do NOT niche when the payload could legitimately be null, or when there are 3+ variants (no room in one niche), until a niche-tracking model handles it.

## Encoding
- LLVM type of a niche enum = `ptr` (not `{ i32, [payload] }`).
- Fieldless variant  = `null`.
- Payload variant    = the (non-null) pointer value.
- Tag read (match / IsCheck): `icmp eq ptr %v, null` → fieldless; else payload.
- Payload extract: the pointer IS the payload (no GEP past a tag).

## Touch points (all in src/codegen.ts unless noted)
1. **Layout build** (~1042–1077): add a `niche?: { fieldVariant, noneVariant, payloadType }` to `EnumLayout`; detect eligibility here. `payloadSlots`/tag stop applying when `niche` is set.
2. **LLVM type emission** (llvmType `enum` / the `%EnumName = type {…}` decl): emit `ptr` for niche enums.
3. **Construction** (`EnumLit` codegen): fieldless → store `null`; payload → store the pointer directly (no tag write).
4. **Tag read** (`IsCheck`, `MatchExpr` arm dispatch): `icmp eq null` instead of loading a tag word.
5. **Payload extract** (match binding): bind the pointer as the payload; no tag-offset GEP.
6. **Drop glue** (`emitDropGlue`/`droppableEnums`, ~1070): if ptr != null, drop the payload (the `Heap`); null is a no-op. MUST agree with construction on the encoding.
7. **sizeOf / typeSize** (~576, 746): niche enum size = 8.
8. **`@cLayout`/FFI**: niche enums must NOT be exposed to C as-is (or document the ptr repr). Check no extern surface breaks.

## Risk — this is the memory-safety-critical part
A wrong encoding = silent corruption (a null read as a live pointer, or a tag mismatch between construct and match/drop). Every one of the 8 touch points must agree. **Test at each step**, do not batch.

## Test strategy
- `sizeOf<Tree>() == 8` (was 24) — the headline assertion.
- Round-trip: construct both variants, `match`, extract payload, verify values (recursive `Tree` sum, `Option<Heap<i64>>` get).
- Drop: a niche enum holding a `Heap` in a loop must free exactly once, no double-free, no leak (ASAN).
- Regression: full `bun test tests/run.test.ts` (enums are everywhere).
- Benchmark: `benchmarks/binarytrees` before/after — expect ~15–18% (the measured node-size gap) on a quiet box.
- Non-eligible enums (3+ variants, nullable payload) MUST stay tag-encoded — pin with a fixture.

## Sequencing (one PR-sized slice per step, test between)
1. Layout detection + `niche` field on EnumLayout (no codegen change yet; just compute + log).
2. LLVM type = ptr + sizeOf = 8, for niche enums; construction (store null / ptr).
3. Tag read + match + payload extract.
4. Drop glue.
5. Benchmark + widen eligibility (&T, ptr) once Heap<T> is proven.
