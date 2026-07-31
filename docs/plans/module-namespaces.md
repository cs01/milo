<!-- doc-meta
system: module-namespace-plan
purpose: implementation plan for per-module name scoping, replacing the flat one-namespace merge
key-files: src/mangle.ts, src/resolver.ts, src/checker.ts, docs/breaking-changes.md
update-when: the mangling granularity, the std carve-out, or the staging changes
last-verified: 2026-07-31
-->

# Per-module namespaces — implementation plan

**The problem.** Two modules that each define a private helper collide, even though neither
imports the other's name:

```
error: 'fn tone' is defined in two modules with different bodies
  hint: also defined in 'examples/games/flight/gfx.milo'. Milo compiles all modules into
        one namespace, so only one body survives and every call site runs it.
```

Hit for real in `examples/games/flight`. The advice — rename one — is the wrong direction:
it makes a *local* name choice depend on every other file that happens to end up in the same
build, and the pressure grows with the program.

## Why this is fixable cheaply: imports are already mandatory

Verified 2026-07-31 on a scratch project:

- A name from another file is **not visible without an explicit import**. `helperA()` defined
  in `a.milo` and called from `main.milo` with no import is `undefined function 'helperA'`.
- Two modules defining `dup`, with `main` importing only `fromB`/`fromC`, still collide — the
  merge is what fails, not the resolution.

So name *resolution* is already per-module; only the final merge is flat. That means
**per-module mangling needs no source changes anywhere** — it deletes an error class without
altering a single working program's meaning. That is the whole argument for doing it.

## The machinery already exists

`manglePackage(prog, pkg, pkgDecls, bindings)` in `src/mangle.ts` already does exactly this
job at *package* granularity (shipped as package-manager P0): it prefixes a unit's decls and
rewrites internal references, with a `bindings` map pointing imported names at the origin's
mangled symbol. `resolver.ts` already computes `declOrigins` per file, tracking which file
declared each value/type and whether it was `pub`.

The change is granularity: call it per *file* rather than per package, with `bindings` built
from that file's import list.

## Sequence

**Stage 1 — mangle user modules only.** Leave `std/` and the prelude at `pkg=""` and
unmangled. This bounds the blast radius to user code and keeps the stdlib's flat surface
(which `milo api`, `milo doc`, and `docs/breaking-changes.md` all assume) untouched. Collisions
between two user modules stop being errors; a user-vs-std collision keeps today's behavior.

**Stage 2 — the carve-outs.** These are the parts that must NOT be mangled, and getting one
wrong is a silent break rather than a compile error:

- **`extern` functions.** A C symbol is bound by name. Mangling one produces a link error at
  best and calls the wrong symbol at worst. `project_package_manager` already records "never
  rename an extern fn" as a hard-won rule — same rule, same reason.
- **`main`**, and anything else the linker or runtime looks up by exact name.
- **`@cName`-annotated decls**, whose entire purpose is a fixed symbol.
- **`pub` names re-exported across a package boundary**, which are already package-mangled;
  the two schemes have to compose, not stack.

**Stage 3 — diagnostics and tooling.** The error text above disappears, but its replacements
matter: an ambiguous *imported* name (two modules export `parse`, one file imports both) is a
genuine conflict and needs a clear message naming both origins and suggesting `as`. LSP
go-to-definition, `milo doc`, and stack traces all currently show unmangled names and must
keep doing so — mangling is an internal symbol concern, never a user-visible one.

**Stage 4 — std.** Only if it proves worth it. The stdlib's flat namespace is load-bearing for
`milo api` discovery and is documented as such; changing it is a much larger decision than the
user-module fix and should not ride along with it.

## Risks

- **Debug info.** DWARF names come from the emitted symbol; a mangled name in a backtrace or
  in `lldb`/`hades` is a real regression in the debugging story. Emit the source name as the
  DWARF linkage-name's display form.
- **Monomorphization keys.** Generic instances are keyed by name today; per-module names must
  not accidentally split one instantiation into two identical copies (code bloat) or merge two
  distinct ones (miscompile).
- **`impl` blocks.** Methods resolve by receiver type rather than flat name, so they should be
  unaffected — but this needs a test, not an assumption, since `userImplKeys` is built from
  names.

## Should we do it?

Yes, and it is close to a pure win: no source changes, an error class deleted, and the
machinery already written and shipped for packages. The reason it is not folded into an
unrelated change is that stage 2's carve-outs are exactly the kind of thing that fails
silently, so it wants its own diff and its own test pass — including a link-level test that an
`extern` symbol still resolves.
