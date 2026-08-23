# Phase 1 Data Model: The Expression Seam

**Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

## Entities

### HExprNode — a lowered expression

| Field | Type | Rule |
|---|---|---|
| `ty` | `Option<TypeKind>` | `Some` for every lowered kind. `None` **only** for `Unlowered`. |
| `kind` | `HExpr` | One of 103 expression variants, or the `Unlowered` bridge. |
| `span` | `Option<Span>` | Carried for diagnostics; may be absent for synthesized nodes. |

`ty` is `Option` rather than a bare `TypeKind` for a reason recorded in `hir.milo`: Milo has
no per-field visibility, so an accessor cannot be enforced by the language. A bare field would
have to hold something for an unlowered node, and the only available something is
`TypeKind.TUnknown` — a real, plausible value that propagates silently and bottoms out as `i64`.
`Option` has no such sentinel, so the type checker enforces what privacy cannot.

**State transition** — the only one in this feature, and it is one-way:

```
Unlowered(astNode), ty = None   ──migrate the kind──▶   <Kind>(...), ty = Some(t)
```

There is no reverse edge. FR-003 makes the count monotone; a node that has been lowered is
never re-wrapped.

**Terminal state**: when no construction site of `Unlowered` remains, `ty` becomes a bare
`TypeKind` and the variant is deleted. That edit does not compile while a single site survives,
so the type checker retires the bridge rather than a script. This is the mechanical form of
SC-002.

### Access rules

| Operation | When permitted | On violation |
|---|---|---|
| `hirType(n)` | The one blessed read of a type. | Aborts naming the node kind. Never returns a default. |
| `n.ty!` | Discouraged; permitted. | Panics with a location. Loud, not silent. |
| `hexprAbort(n, what)` | A backend path holding a node that is *not* the bridge, at a seam not yet migrated. | Aborts. Exists so a lowered node cannot slip into the untyped walk, which would re-derive the type this feature removes. |

The asymmetry is deliberate: **both** directions of a mismatch abort. An unlowered node
reaching a typed path aborts via `hirType`; a lowered node reaching the untyped path aborts via
`hexprAbort`. Neither defaults. This is FR-002 as an invariant rather than a convention.

### Seam — an inline dispatch point

Milo's second-class references forbid returning the `&ExprNode` held inside an `Unlowered`.
So a seam cannot be factored into a helper that hands back the AST node; it must match the
variant inline:

```
match node.kind {
    HExpr.Unlowered(astNode) => <untyped AST walk>
    _                        => <typed HIR path, or hexprAbort while unmigrated>
}
```

15 such seams exist in `codegen/stmt.milo` today. **Count of seams is not a progress metric** —
it rises as kinds migrate and falls only at the end. The ratchet counters are the metric.

### Reconstruction counters — the progress metric

| Counter | Baseline | Target | What it is |
|---|---|---|---|
| `hintTy` | 87 | 0 | An expected type threaded *down* the tree because nodes cannot carry their own. |
| `placeTypeStr` | 12 | 0 | Re-derives a place's type. **Returns `""` on failure, read by callers as "skip".** |
| `astTypeStr` | 10 | 0 | Re-derives a type string from syntax. |
| `resolveAstTy` | 5 | 0 | Resolves an AST type to a backend type string. |
| `mkUnlowered` | 1 | 0 | Construction sites of the bridge. |
| **Total** | **115** | **0** | Monotone decreasing. Any rise fails the gate. |

`mkUnlowered` counts **construction sites only**. Counting the identifier would also count the
variant declaration, `mkUnlowered`'s own body and its `hexprKindName` arm — a floor of 4 that
says nothing about how much of codegen still runs on AST.

`placeTypeStr` is ranked first for work despite being 12 against `hintTy`'s 87. It is the only
counter that is unsound rather than merely ugly: see `markReceiverMoved`, `codegen/expr.milo:407`,
where `tyStr.len == 0` returns without recording a receiver move, so a failed type derivation
and "nothing to drop" are the same path.

### Coverage index — kind → fixtures

Generated, never hand-maintained (Principle IV). Derived by running the reference compiler's
`emit-hir --json` over `tests/fixtures/`, then inverting.

| Field | Meaning |
|---|---|
| kind | An `HExpr` variant name |
| fixtures | Every fixture whose HIR contains that kind |
| count | `len(fixtures)`; **`0` means migrating this kind proves nothing** |

A zero-count kind is the spec's first edge case made visible: migrated but unexercised. It must
be given a fixture or recorded as unexercised, never counted as done.

### Manifest — the parity record

| Property | Value |
|---|---|
| Baseline | 637 of 658 |
| Grows | Only after a fixture passes repeatedly (guards against a flaky pass entering the baseline) |
| Shrinks | Never. A regression fails the ratchet. |
| Denominator | Moves. Another session is adding `sealShared` and `shardMapWith`. |

## Invariants

1. `ty.isNone()` ⟺ `kind == Unlowered`. Both directions.
2. No backend path reads a type from a node without going through `hirType` or an explicit `!`.
3. Every failure to obtain a type aborts. No `""`, no `TUnknown`, no default, no early `return`.
4. Every counter is monotone decreasing; raising one requires an explicit flag and a written reason.
5. No manifest fixture regresses at any step.
6. The compiler compiling itself twice yields byte-identical output.
