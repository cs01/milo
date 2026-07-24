<!-- doc-meta
system: install
purpose: how end users get a working milo (source-only; clone + wrapper on PATH)
key-files: milo, install.sh, README.md
update-when: the install path changes (e.g. prebuilt binaries/releases return) or the wrapper's PATH/symlink story changes
last-verified: 2026-07-24
-->

# Installation

Milo builds from source. The compiler changes often, so a clone you can `git pull` keeps you current. There are no prebuilt binaries.

## Dependencies

- **[Bun](https://bun.sh)** — runs the compiler (TypeScript)
- **LLVM/Clang** — backend code generation and linking

Install Bun:

```bash
curl -fsSL https://bun.sh/install | bash
```

Install LLVM — **macOS:** `brew install llvm` · **Ubuntu/Debian:** `sudo apt install llvm clang`

## Clone and run

```bash
git clone https://github.com/milo-language/milo.git
cd milo
```

The repo ships a `milo` wrapper — it's just `bun run src/main.ts <args>`. Run it in place with `./milo`, or make `milo` work from anywhere with one of:

```bash
# symlink onto PATH (the wrapper follows the link back to the repo)
sudo ln -s "$PWD/milo" /usr/local/bin/milo

# — or — add the repo to PATH in your shell rc
echo "export PATH=\"$PWD:\$PATH\"" >> ~/.zshrc && source ~/.zshrc
```

Then, from any directory:

```bash
milo run examples/hello.milo
milo build examples/hello.milo -o hello
```

Stay current with `git pull` — the symlink/PATH keeps pointing at the repo, so you're always on the latest.

## Verify it works

```bash
milo run examples/hello.milo
```

You should see:

```
Hello, Milo!
```

## Editor support

Milo ships an LSP server (`milo lsp`) with diagnostics, hover, and go-to-definition, plus a VS Code extension for syntax highlighting on top.

**VS Code** — build and symlink the bundled extension:

```bash
cd editors/vscode && bun install && bun run build
ln -s "$(pwd)" ~/.vscode/extensions/milo.milo-lang-0.2.0
```

Restart VS Code and open any `.milo` file.

**Other editors** — point any LSP client at `milo lsp`.

Full details, including what each feature does, are on the [IDE Setup →](./ide-setup) page.

Next: [Your first program →](./quickstart)
