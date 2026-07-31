# Milo

**A memory-safe systems language that guides you to correct, readable programs.**

Milo compiles to LLVM IR and links to a standalone native binary. No garbage collector, no
runtime, no pointers in safe code. Ownership and moves are checked at compile time, and
function contracts — `requires` / `ensures` — are part of the language, proven by a solver
rather than tested against a handful of inputs.

```sh
curl -fsSL https://milo-language.github.io/milo/install.sh | sh
```

```milo
fn clamp(x: i64, lo: i64, hi: i64): i64
    requires lo <= hi                       // the caller's obligation
    ensures result >= lo && result <= hi    // proven, for every input that meets it
{
    if x < lo { return lo }
    if x > hi { return hi }
    return x
}
```

```sh
milo run hello.milo          # compile and run, no artifacts
milo build hello.milo -o hi  # standalone binary, typically under 300KB
milo prove app.milo          # discharge the contracts
```

**[Read the docs →](https://milo-language.github.io/milo/)** — installation, language tour, a
playground that runs the real compiler in your browser, and demos you can play.

## Why

Rust proved that a systems language can be memory-safe without a GC. The cost was a lifetime
system you have to model in your head before the compiler will accept your program. Milo takes
the guarantees and drops the lifetime annotations: references are second-class — they live in
function parameters and nowhere else — so the compiler can check them without you naming a
single lifetime. What that rules out, and what to write instead, is documented rather than
hidden: see [Patterns Without Lifetimes](https://milo-language.github.io/milo/language/patterns)
and [Memory Safety vs Rust](https://milo-language.github.io/milo/language/vs-rust).

The second bet is that correctness shouldn't need ceremony. Integer overflow traps by default
in every build mode. Contracts are ordinary syntax, and `milo prove` checks them statically —
you get SPARK-style guarantees without a separate specification language.

## What's built with it

We find the language's gaps by writing real programs in it, not by reasoning about them.

- **[Emulators](https://github.com/milo-language/milo-emulators)** — NES, SNES and Genesis, all
  three [playable in the browser](https://milo-language.github.io/milo/demos) via the JS target
- **[milojs](https://github.com/milo-language/milojs)** — a JavaScript engine *and* runtime,
  written in Milo, which runs a real Express + tRPC application
- **[yaml](https://github.com/milo-language/yaml)** — the first published Milo package
- **[examples/](examples/)** — 56 runnable programs: HTTP servers, CLI tools, graphics,
  simulation, terminal UIs, bare-metal Cortex-M firmware

## Status

Young but not a toy. 469 compiler fixtures and 143 error-message tests, 88 standard library
modules, an LSP server, a formatter, a package manager, and a
[VS Code extension](https://marketplace.visualstudio.com/items?itemName=milo-language.milo-lang).

Targets: macOS and Linux (arm64 and x64) are fully supported. Windows covers the core language
and `std/io` but not async I/O. Bare-metal ARM Cortex-M and a JavaScript backend both work.

Breaking changes still happen — see [docs/breaking-changes.md](docs/breaking-changes.md) and
the [roadmap](https://milo-language.github.io/milo/roadmap).

## Contributing

Start at [AGENTS.md](AGENTS.md), the router to the skills, docs and scripts in this repo.
`bun test` runs everything.
