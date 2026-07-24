# IDE Setup

Milo includes an LSP server with diagnostics, hover, and go-to-definition.

## VS Code

Build and install the extension:

```bash
cd editors/vscode && bun install && bun run build
ln -s "$(pwd)" ~/.vscode/extensions/milo.milo-lang-0.2.0
```

Restart VS Code and open any `.milo` file. The extension runs the compiler from source — it spawns `milo lsp` (`bun run src/main.ts lsp`) itself, so `bun` must be on your PATH. There is no separate language-server daemon to install.

### Editing `.milo` files outside the repo

When the extension is symlinked in (above) it finds the compiler automatically. If you open `.milo` files in some other folder, tell it where the milo repo is via the `milo.compilerRoot` setting — point it at the repo root (the directory containing `src/main.ts`):

```jsonc
// settings.json
"milo.compilerRoot": "/path/to/milo"
```

## What you get

- **Diagnostics** — type errors, move violations, and syntax errors as you type
- **Hover** — type information on any expression
- **Go-to-definition** — jump to function/struct/enum definitions
- **Syntax highlighting** — via the bundled TextMate grammar

## Other editors

The LSP server runs via:

```bash
./milo lsp
```

Point any LSP client at this command to get diagnostics, hover, and go-to-definition.
