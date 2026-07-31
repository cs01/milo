<!-- doc-meta
system: install
purpose: how end users get a working milo (prebuilt binary first, source second)
key-files: install.sh, .github/workflows/release.yml, milo, README.md
update-when: the install script, release asset naming, or the source-build path changes
last-verified: 2026-07-30
-->

# Installation

```sh
curl -fsSL https://milo-language.github.io/milo/install.sh | sh
```

That drops a single self-contained `milo` binary in `~/.local/bin`. The standard library is
baked into it — there is nothing else to fetch.

Then:

```sh
milo --version
```

::: tip You also need clang
Milo compiles to LLVM IR and shells out to `clang` to assemble and link. macOS:
`xcode-select --install`. Debian/Ubuntu: `sudo apt install clang`. The installer warns you
if it can't find one.
:::

## Options

| Variable | Default | Purpose |
|----------|---------|---------|
| `MILO_INSTALL_DIR` | `~/.local/bin` | where the binary lands |
| `MILO_TAG` | `latest` | which release tag to pull |

```sh
MILO_INSTALL_DIR=/usr/local/bin curl -fsSL https://milo-language.github.io/milo/install.sh | sh
```

## Manual download

Prebuilt binaries for macOS and Linux, arm64 and x64, are on the
[releases page](https://github.com/milo-language/milo/releases/latest).

::: warning macOS quarantines browser downloads
A binary downloaded through Safari or Chrome is quarantined, and macOS will refuse to run it
(often deleting it outright). `curl -L` the tarball or use the installer above — neither sets
the quarantine attribute. If you already downloaded it in a browser:
`xattr -d com.apple.quarantine milo`.
:::

## Build from source

You want this if you're working *on* the compiler rather than *with* it, or you're on a
platform with no prebuilt binary.

Dependencies: **[Bun](https://bun.sh)** (runs the compiler, which is TypeScript) and
**LLVM/Clang**.

```sh
curl -fsSL https://bun.sh/install | bash          # bun
brew install llvm                                  # macOS
sudo apt install llvm clang                        # Debian/Ubuntu
```

```sh
git clone https://github.com/milo-language/milo.git
cd milo
./milo run examples/hello.milo
```

The repo ships a `milo` wrapper — it's just `bun run src/main.ts <args>`. To use it from any
directory, put it on your PATH:

```sh
# symlink (the wrapper follows the link back to the repo)
sudo ln -s "$PWD/milo" /usr/local/bin/milo

# — or — add the repo to PATH
echo "export PATH=\"$PWD:\$PATH\"" >> ~/.zshrc && source ~/.zshrc
```

`git pull` keeps a source install current; the symlink keeps pointing at the repo.

## Verify it works

```sh
milo run examples/hello.milo
```

```
Hello, Milo!
```

## Editor support

Milo ships an LSP server (`milo lsp`) and a VS Code extension. See [IDE Setup](./ide-setup).

Next: [Your first program](./quickstart)
