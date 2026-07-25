# IDE Setup

Milo includes an LSP server with diagnostics, hover, go-to-definition, and formatting. It is a subcommand of the compiler — `milo lsp` — so there is no separate daemon to install.

## VS Code

Install **Milo Language** from the Marketplace (or from [Open VSX](https://open-vsx.org/extension/milo-language/milo-lang) in Cursor, VSCodium, Windsurf).

The extension launches `milo lsp`, so [install the compiler](./installation) first. It looks for `milo` in `~/.local/bin`, `~/.milo/bin`, Homebrew, `/usr/local/bin`, then `PATH`. If yours lives somewhere else:

```jsonc
// settings.json
"milo.path": "/path/to/milo"
```

## What you get

- **Diagnostics** — type errors, move violations, and syntax errors as you type
- **Hover** — type information on any expression
- **Go-to-definition** — jump to function/struct/enum definitions, including into the standard library
- **Format on save** — runs the same formatter as `milo fmt`, so the editor and the CLI can't disagree
- **Syntax highlighting** — via the bundled TextMate grammar

## Other editors

Point any LSP client at:

```bash
milo lsp
```

## Working on the compiler

From a checkout, build and load the extension locally:

```bash
cd editors/vscode && bun install && bun run build
bun run package && code --install-extension milo-lang-*.vsix
```

With no `milo` on your PATH the extension falls back to running the checkout's compiler through `bun`, which is what makes `F5` (Extension Development Host) pick up uncommitted compiler changes. To point it at a specific checkout, set `milo.compilerRoot` to the directory containing `src/main.ts`.
