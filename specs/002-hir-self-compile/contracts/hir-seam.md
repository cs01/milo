# Contract: The Expression Seam

**Consumers**: `src-milo/lower.milo`, `src-milo/codegen/*.milo`

## C1 — Lowering produces a typed node or the bridge, never a third thing

```
lowerExpr(e, fnRetType, ck, cx) -> Heap<HExprNode>
```

Postcondition: the result satisfies `ty.isSome() ⟺ kind != Unlowered`.

A migrated kind MUST obtain its type from the checker (`ck`), never by re-deriving from syntax.
Obtaining it from syntax inside `lower.milo` moves the defect rather than removing it, and the
ratchet will not see it.

## C2 — Every type read goes through the blessed accessor

```
hirType(n: &HExprNode) -> TypeKind      // aborts naming the kind if ty is None
```

A backend path MUST NOT read `n.ty` and substitute a value on `None`. `n.ty!` is permitted
(it panics with a location) but discouraged.

## C3 — Both mismatch directions abort

| Node state | Reaches | Result |
|---|---|---|
| `Unlowered` | typed path | `hirType` aborts, naming the kind |
| lowered | untyped AST walk | `hexprAbort` aborts, naming the kind |

Neither may default, skip, or continue. A lowered node reaching the untyped walk means that
walk is about to reconstruct a type the node already carries, which is the defect being removed.

## C4 — Seams are inline

Second-class references forbid returning the `&ExprNode` inside an `Unlowered`. A seam MUST
match the variant inline. There is no helper that extracts the AST node.

## C5 — The bridge is retired by the type checker, not by a script

When the last construction site is gone, `ty` becomes a bare `TypeKind` and `Unlowered` is
deleted. That edit MUST NOT compile while any site survives.

## C6 — No new reconstruction

A migration step MUST NOT add a call to `hintTy`, `placeTypeStr`, `astTypeStr`, or
`resolveAstTy`. The ratchet enforces this; `--allow-raise` requires a written reason.
