import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { workspace, window, commands, type ExtensionContext } from "vscode";
import { LanguageClient, TransportKind, type LanguageClientOptions, type ServerOptions } from "vscode-languageclient/node";

let client: LanguageClient | undefined;

// How the language server gets launched. A published install runs the `milo`
// binary, which is self-contained (the stdlib is embedded, `milo lsp` needs
// nothing else on disk). The repo fallback exists only so F5 in a checkout
// exercises uncommitted compiler changes.
type Server =
  | { kind: "binary"; command: string; args: string[] }
  | { kind: "repo"; command: string; args: string[]; root: string };

export async function activate(context: ExtensionContext) {
  const server = resolveServer(context.extensionPath);
  if (!server) {
    window.showErrorMessage(
      "Milo: `milo` not found. Install it (https://milo-language.github.io/milo/getting-started/installation) " +
      "or set `milo.path` to the binary.",
    );
    return;
  }

  await start(server);

  context.subscriptions.push(
    commands.registerCommand("milo.restartServer", async () => {
      await client?.stop();
      client = undefined;
      const next = resolveServer(context.extensionPath);
      if (next) await start(next);
    }),
    commands.registerCommand("milo.runFile", () => {
      const doc = window.activeTextEditor?.document;
      if (!doc || doc.languageId !== "milo") { window.showWarningMessage("Milo: no .milo file is active."); return; }
      void doc.save();
      const terminal = window.createTerminal("Milo Run");
      terminal.show();
      terminal.sendText(shellCommand(server, ["run", doc.fileName]));
    }),
  );
}

async function start(server: Server) {
  // `milo.debug` → MILO_LSP_DEBUG so verbose hover/definition tracing can be
  // toggled from settings without relaunching the editor from a shell.
  const debug = workspace.getConfiguration("milo").get<boolean>("debug") ? "1" : "0";
  const serverOptions: ServerOptions = {
    command: server.command,
    args: [...server.args, "lsp"],
    transport: TransportKind.stdio,
    options: { env: { ...process.env, MILO_LSP_DEBUG: debug } },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "milo" }],
    synchronize: { fileEvents: workspace.createFileSystemWatcher("**/*.milo") },
  };

  client = new LanguageClient("milod", "Milo Language Server", serverOptions, clientOptions);
  await client.start();
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}

function shellCommand(server: Server, args: string[]): string {
  return [server.command, ...server.args, ...args].map(quote).join(" ");
}

function quote(arg: string): string {
  return /[\s"']/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;
}

function resolveServer(extensionPath: string): Server | null {
  const configured = workspace.getConfiguration("milo").get<string>("path")?.trim();
  if (configured) {
    if (isExecutable(configured)) return { kind: "binary", command: configured, args: [] };
    window.showWarningMessage(`Milo: milo.path="${configured}" is not an executable file.`);
    return null;
  }

  const binary = findMiloBinary();
  if (binary) return { kind: "binary", command: binary, args: [] };

  const root = findMiloRepo(extensionPath);
  const bun = root ? findBun() : null;
  if (root && bun) return { kind: "repo", command: bun, args: [path.join(root, "src", "main.ts")], root };

  return null;
}

// VS Code launched from the Dock/Finder inherits a minimal PATH that lacks
// ~/.local/bin, /opt/homebrew/bin and friends — the exact places milo installs
// to — so probe them before trusting PATH resolution.
function findMiloBinary(): string | null {
  const exe = process.platform === "win32" ? "milo.exe" : "milo";
  const candidates = [
    path.join(os.homedir(), ".local", "bin", exe),
    path.join(os.homedir(), ".milo", "bin", exe),
    "/opt/homebrew/bin/" + exe,
    "/usr/local/bin/" + exe,
  ];
  for (const c of candidates) if (isExecutable(c)) return c;
  return onPath(exe);
}

function isExecutable(p: string): boolean {
  try {
    if (!fs.statSync(p).isFile()) return false;
    fs.accessSync(p, fs.constants.X_OK);
    return true;
  } catch { return false; }
}

function onPath(exe: string): string | null {
  const sep = process.platform === "win32" ? ";" : ":";
  for (const dir of (process.env.PATH ?? "").split(sep)) {
    if (!dir) continue;
    const p = path.join(dir, exe);
    if (isExecutable(p)) return p;
  }
  return null;
}

function findBun(): string | null {
  const candidates = [
    path.join(os.homedir(), ".bun", "bin", "bun"),
    "/opt/homebrew/bin/bun",
    "/usr/local/bin/bun",
  ];
  for (const c of candidates) if (isExecutable(c)) return c;
  return onPath(process.platform === "win32" ? "bun.exe" : "bun");
}

function isMiloRepo(dir: string): boolean {
  try {
    return require(path.join(dir, "package.json")).name === "milo"
      && fs.statSync(path.join(dir, "src", "main.ts")).isFile();
  } catch { return false; }
}

// Only consulted when no `milo` binary exists — the dev-checkout path.
function findMiloRepo(extensionPath: string): string | null {
  const configured = workspace.getConfiguration("milo").get<string>("compilerRoot")?.trim();
  if (configured) {
    if (isMiloRepo(configured)) return configured;
    window.showWarningMessage(`Milo: milo.compilerRoot="${configured}" is not a Milo repo (no src/main.ts or wrong package name).`);
    return null;
  }

  const sibling = path.resolve(extensionPath, "..", "..");  // <milo>/editors/vscode
  if (isMiloRepo(sibling)) return sibling;

  for (const folder of workspace.workspaceFolders ?? []) {
    if (isMiloRepo(folder.uri.fsPath)) return folder.uri.fsPath;
  }
  return null;
}
