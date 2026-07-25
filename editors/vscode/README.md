# Milo for VS Code

Language support for [Milo](https://milo-language.github.io/milo/) — a memory-safe systems language that compiles to LLVM IR.

- Syntax highlighting
- Diagnostics from the real compiler (type errors, move errors, warnings) as you type
- Hover types and go-to-definition, including into the standard library
- Format on save, using the same formatter `milo fmt` runs
- `Milo: Run Current File` and `Milo: Restart Language Server` commands

## Requirements

The [`milo` compiler](https://milo-language.github.io/milo/getting-started/installation) must be installed. The extension starts `milo lsp`; it searches `~/.local/bin`, `~/.milo/bin`, Homebrew, `/usr/local/bin`, then `PATH`. If your install lives elsewhere, set `milo.path`.

## Settings

| Setting | Default | Meaning |
|---------|---------|---------|
| `milo.path` | `""` | Absolute path to the `milo` executable. Empty = search the locations above. |
| `milo.compilerRoot` | `""` | Dev-only fallback: a Milo compiler checkout, run via `bun`. Only consulted when no `milo` executable is found. |
| `milo.debug` | `false` | Verbose LSP tracing (`MILO_LSP_DEBUG=1`). Run `Milo: Restart Language Server` after changing. |

## Developing the extension

From a Milo checkout:

```bash
cd editors/vscode
bun install
bun run build          # bundles src/extension.ts → out/extension.js
code editors/vscode    # F5 launches the Extension Development Host
```

With no `milo` on the system the extension falls back to running the checkout's compiler through `bun`, so F5 exercises uncommitted compiler changes. Install a local build instead with:

```bash
bun run package                              # → milo-lang-<version>.vsix
code --install-extension milo-lang-*.vsix
```

## Troubleshooting

- **"`milo` not found"** — install the compiler, or set `milo.path` to the binary.
- **No diagnostics on a `.milo` file** — check Output → "Milo Language Server".
- **Format on save does nothing** — the formatter is a Milo program the compiler builds on first use; run `milo fmt <file>` once in a terminal and read the error it prints.

## License

MIT — see [LICENSE](https://github.com/milo-language/milo/blob/main/LICENSE).
