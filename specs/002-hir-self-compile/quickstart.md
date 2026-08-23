# Quickstart: Validating the HIR Expression Migration

**Spec**: [spec.md](./spec.md) | **Contracts**: [gates](./contracts/gates.md), [seam](./contracts/hir-seam.md)

## Prerequisites

- The worktree (see Setup). Never work in the primary tree while another session holds it.
- A milo-self build in *this* worktree. A worktree does not inherit `.selfhost/` from the primary tree.
- Never run `.selfhost/milo-self.bin` bare. Use the `.selfhost/milo-self` wrapper or `bun scripts/guard.ts`.

## Setup

```bash
git worktree add ../milo-hir -b 002-hir-self-compile
cd ../milo-hir
sh scripts/selfhost.sh          # build milo-self in THIS tree
```

## Establish the baseline before changing anything

```bash
bun scripts/hir-ratchet.ts
```

Expected on `cc045ef2`: `astTypeStr 10`, `resolveAstTy 5`, `placeTypeStr 12`, `hintTy 87`,
`mkUnlowered 1`, `TOTAL 115`.

```bash
grep -vc '^#\|^$' tests/selfhost-manifest.txt    # expect 637
ls tests/fixtures/*.milo | wc -l                 # expect 658 (moves; another session is adding two)
```

If these numbers differ from the spec's, the baseline moved. Record the new one; do not
silently plan against a stale number.

## Prove the gates can fail, before trusting them

Per FR-024, a gate is worthless until observed failing. Do this once, at the start:

```bash
# G1: add a throwaway hintTy call to codegen/expr.milo
bun scripts/hir-ratchet.ts --check       # MUST exit 1 and name hintTy
git checkout src-milo/codegen/expr.milo

# G2 (once built): break a migrated kind's codegen arm
bun scripts/hir-cover.ts --check --for <Kind>   # MUST exit 1 and name a fixture
```

A gate that passes here is broken and MUST be fixed before it guards anything.

## The inner loop, per expression kind

```bash
# 1. What does the reference compiler do with this kind?
grep -n '"<Kind>"' src/lower.ts src/codegen.ts

# 2. Which fixtures exercise it?
bun scripts/hir-cover.ts --for <Kind>
#    Zero fixtures => write one first. Migrating an unexercised kind proves nothing.

# 3. Migrate: add the lowerExpr arm, add the codegen HIR arm, delete the AST walk behind it.

# 4. Fast gates
bun scripts/hir-ratchet.ts --check
bun scripts/hir-cover.ts --check --for <Kind>
```

Both must pass, and the coverage gate must report a **non-zero** fixture count. A gate that
reports success over zero inputs is a failure, not a pass.

## Before every push

```bash
sh scripts/selfhost.sh
sh scripts/selfhost-fixpoint.sh                      # stage2 == stage3, byte-identical
bun scripts/selfhost-rejects.ts --check              # soundness both directions
MILO_SWEEP_CONCURRENCY=1 bun scripts/selfhost-sweep.ts --check   # ~48 min, not optional
```

The sweep is the only one of these that runs the fixture corpus. The fixpoint and the soundness
ratchets stayed green through six shipped regressions in one session because neither executes a
single fixture. Skipping the sweep is how that happened.

## Landing

```bash
git rebase main && git checkout main && git merge --ff-only 002-hir-self-compile && git push
```

Merge at every green step, not once at the end. Name files explicitly when staging — never
`git add -A`; a concurrent session's indiscriminate stage has eaten work in this repo before.

## Done, checked against the spec

| Criterion | Command | Target |
|---|---|---|
| SC-001 | `bun scripts/hir-ratchet.ts` | total < 115, falling, no counter risen |
| SC-002 | `bun scripts/hir-ratchet.ts` | `mkUnlowered` = 0; no `Unlowered` arm remains |
| SC-003 | `grep -vc '^#\|^$' tests/selfhost-manifest.txt` | > 637, zero regressions |
| SC-005 | `sh scripts/selfhost-fixpoint.sh` | byte-identical |
| SC-006 | `bun scripts/selfhost-rejects.ts --check` | neither set grew |
| SC-007 | `git -C ../milo status --short` | identical to the run before work started |
| SC-009 | any gate's output | states its input count; none reports success over zero |
| SC-010 | `bun scripts/hir-ratchet.ts` | `placeTypeStr` = 0 |

SC-002 has a mechanical check the others lack: when the last `mkUnlowered` site is gone, change
`ty` to a bare `TypeKind` and delete the variant. **If it compiles, the migration is complete.**
The type checker retires the bridge; no script has to agree.

## Cleanup

```bash
cd ../milo && git worktree remove ../milo-hir && git branch -d 002-hir-self-compile
```
