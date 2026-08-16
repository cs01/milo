# milox syntax highlighting for VS Code

A grammar only — no language server, no diagnostics. It exists so a `.milox`
file is readable instead of grey.

Install by symlinking it into your extensions directory and reloading VS Code:

```bash
ln -s "$PWD" ~/.vscode/extensions/milox-lang
```

(`~/.vscode-insiders/extensions` for Insiders, `~/.cursor/extensions` for Cursor.)

Deliberately kept out of the published `milo-language.milo-lang` extension:
milox is an example program that ships inside the Milo repo, not part of the
Milo language, and the extension people install to write Milo should not carry
a toy language's grammar.
