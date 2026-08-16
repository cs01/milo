import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { execFile, execFileSync } from "child_process";
import {
  workspace, window, commands, debug, Uri, ProgressLocation, DebugAdapterExecutable,
  type ExtensionContext, type DebugConfiguration, type DebugConfigurationProvider,
  type DebugAdapterDescriptorFactory, type DebugAdapterDescriptor, type DebugSession,
  type WorkspaceFolder, type ProviderResult,
} from "vscode";
import { LanguageClient, TransportKind, type LanguageClientOptions, type ServerOptions } from "vscode-languageclient/node";

let client: LanguageClient | undefined;

const DEBUG_TYPE = "milo";

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
    // The CodeLens passes the file path; the palette entry falls back to the
    // active editor. Taking the argument matters for a multi-file project, where
    // the lens you clicked is not necessarily in the focused editor.
    commands.registerCommand("milo.runFile", async (filePath?: string) => {
      await runMiloFile(server, filePath, []);
    }),
    commands.registerCommand("milo.runFileWithArgs", async (filePath?: string) => {
      const file = filePath ?? activeMiloFile();
      if (!file) { window.showWarningMessage("Milo: no .milo file is active."); return; }
      const remembered = lastArgs.get(file) ?? "";
      const entered = await window.showInputBox({
        title: `Run ${path.basename(file)}`,
        prompt: "Arguments passed to the program (after --)",
        value: remembered,
        placeHolder: "--verbose input.txt",
      });
      if (entered === undefined) return;   // dismissed, not "no arguments"
      lastArgs.set(file, entered);
      await runMiloFile(server, file, splitArgs(entered));
    }),
    // The CodeLens passes the file path; the palette entry falls back to the active editor.
    commands.registerCommand("milo.debugFile", async (filePath?: string) => {
      const file = filePath ?? activeMiloFile();
      if (!file) { window.showWarningMessage("Milo: no .milo file is active."); return; }
      const open = workspace.textDocuments.find(d => d.fileName === file);
      if (open?.isDirty) await open.save();
      await debug.startDebugging(workspace.getWorkspaceFolder(Uri.file(file)), {
        type: DEBUG_TYPE,
        request: "launch",
        name: `Debug ${path.basename(file)}`,
        program: file,
      });
    }),
    debug.registerDebugConfigurationProvider(DEBUG_TYPE, new MiloDebugConfigurationProvider(server)),
    debug.registerDebugAdapterDescriptorFactory(DEBUG_TYPE, new LldbDapFactory()),
  );
}

function activeMiloFile(): string | undefined {
  const doc = window.activeTextEditor?.document;
  return doc?.languageId === "milo" ? doc.fileName : undefined;
}

// Per-file, per-session memory of the last arguments, so re-running an
// arg-taking program is one click and Enter rather than retyping them.
const lastArgs = new Map<string, string>();

async function runMiloFile(server: Server, filePath: string | undefined, args: string[]): Promise<void> {
  const file = filePath ?? activeMiloFile();
  if (!file) { window.showWarningMessage("Milo: no .milo file is active."); return; }
  const open = workspace.textDocuments.find(d => d.fileName === file);
  if (open?.isDirty) await open.save();
  const terminal = window.createTerminal("Milo Run");
  terminal.show();
  // `--` separates milo's own flags from the program's argv.
  terminal.sendText(shellCommand(server, ["run", file, ...(args.length > 0 ? ["--", ...args] : [])]));
}

// Shell-ish splitting: whitespace separates, single and double quotes group.
// Enough for an argument prompt; anything more elaborate belongs in a terminal.
function splitArgs(input: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: string | null = null;
  let has = false;
  for (const ch of input) {
    if (quote) {
      if (ch === quote) quote = null; else cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; has = true; continue; }
    if (/\s/.test(ch)) { if (has || cur.length > 0) { out.push(cur); cur = ""; has = false; } continue; }
    cur += ch;
  }
  if (has || cur.length > 0) out.push(cur);
  return out;
}

// ── Debugging ──
//
// Milo needs no bespoke debug adapter: `-g` emits ordinary DWARF, so `lldb-dap`
// (shipped with LLVM and with the macOS Command Line Tools) debugs the binary
// directly. We contribute a `milo` debug type purely so the user can point at a
// `.milo` *source* file — the provider compiles it with `-g --debug` and swaps
// `program` for the resulting executable before the adapter ever sees it.
class MiloDebugConfigurationProvider implements DebugConfigurationProvider {
  constructor(private readonly server: Server) {}

  // F5 with no launch.json hands us an empty config.
  resolveDebugConfiguration(
    _folder: WorkspaceFolder | undefined,
    config: DebugConfiguration,
  ): ProviderResult<DebugConfiguration> {
    if (!config.type && !config.request && !config.name) {
      const file = activeMiloFile();
      if (!file) { void window.showWarningMessage("Milo: no .milo file is active."); return undefined; }
      return { type: DEBUG_TYPE, request: "launch", name: `Debug ${path.basename(file)}`, program: file };
    }
    return config;
  }

  // Runs after ${file}/${workspaceFolder} expansion, so `program` is a real path here.
  async resolveDebugConfigurationWithSubstitutedVariables(
    _folder: WorkspaceFolder | undefined,
    config: DebugConfiguration,
  ): Promise<DebugConfiguration | undefined> {
    const program: string | undefined = config.program;
    if (!program) {
      void window.showErrorMessage("Milo: debug configuration has no `program`.");
      return undefined;
    }
    // A prebuilt binary is passed through untouched — only sources get compiled.
    if (!program.endsWith(".milo")) return config;

    const binary = await buildForDebug(this.server, program);
    if (!binary) return undefined;  // build failed; error already surfaced

    return { ...config, program: binary, cwd: config.cwd ?? path.dirname(program) };
  }
}

class LldbDapFactory implements DebugAdapterDescriptorFactory {
  createDebugAdapterDescriptor(_session: DebugSession): ProviderResult<DebugAdapterDescriptor> {
    const dap = findLldbDap();
    if (!dap) {
      void window.showErrorMessage(
        "Milo: `lldb-dap` not found. Install LLVM (`brew install llvm`) or the Xcode Command Line Tools, " +
        "or set `milo.lldbDapPath`.",
      );
      return undefined;
    }
    return new DebugAdapterExecutable(dap, []);
  }
}

// Debug builds land in a scratch dir, not next to the source: on Mach-O `-g`
// also drops a sibling `.dSYM` bundle, and lldb only finds it beside the binary.
function debugOutputPath(source: string): string {
  const dir = path.join(os.tmpdir(), "milo-debug");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, path.basename(source, ".milo"));
}

async function buildForDebug(server: Server, source: string): Promise<string | null> {
  const out = debugOutputPath(source);
  // -O0 so every local stays in an alloca the DWARF binds by name; at higher
  // levels LLVM promotes them to registers and `frame variable` reports nothing.
  const args = [...server.args, "build", source, "-o", out, "-g", "--debug"];

  const failure = await window.withProgress(
    { location: ProgressLocation.Notification, title: `Milo: building ${path.basename(source)} with debug info…` },
    () => new Promise<string | null>(resolve => {
      execFile(server.command, args, { cwd: path.dirname(source) }, (err, _stdout, stderr) => {
        resolve(err ? (stderr.trim() || err.message) : null);
      });
    }),
  );

  if (failure) {
    const firstLine = failure.split("\n").find(l => l.trim()) ?? "build failed";
    void window.showErrorMessage(`Milo: debug build failed — ${firstLine}`, "Show Output")
      .then(choice => { if (choice) showBuildFailure(source, failure); });
    return null;
  }
  return out;
}

function showBuildFailure(source: string, text: string) {
  const channel = window.createOutputChannel("Milo Debug Build");
  channel.appendLine(`$ milo build ${source} -g --debug`);
  channel.appendLine(text);
  channel.show();
}

function findLldbDap(): string | null {
  const configured = workspace.getConfiguration("milo").get<string>("lldbDapPath")?.trim();
  if (configured) {
    if (isExecutable(configured)) return configured;
    window.showWarningMessage(`Milo: milo.lldbDapPath="${configured}" is not an executable file.`);
    return null;
  }

  const exe = process.platform === "win32" ? "lldb-dap.exe" : "lldb-dap";
  const candidates = [
    "/opt/homebrew/opt/llvm/bin/" + exe,
    "/usr/local/opt/llvm/bin/" + exe,
    "/Library/Developer/CommandLineTools/usr/bin/" + exe,
  ];
  for (const c of candidates) if (isExecutable(c)) return c;

  const found = onPath(exe) ?? llvmVersionedOnDisk(exe);
  if (found) return found;

  // Xcode-only installs keep lldb-dap inside the active developer dir.
  if (process.platform === "darwin") {
    try {
      const p = execFileSync("xcrun", ["-f", "lldb-dap"], { encoding: "utf8" }).trim();
      if (p && isExecutable(p)) return p;
    } catch { /* no xcrun, or no such tool */ }
  }
  return null;
}

// Debian/Ubuntu installs LLVM per-version and puts nothing on PATH.
function llvmVersionedOnDisk(exe: string): string | null {
  const roots = ["/usr/lib", "/usr/local/lib"];
  const hits: string[] = [];
  for (const root of roots) {
    let entries: string[];
    try { entries = fs.readdirSync(root); } catch { continue; }
    for (const e of entries) {
      if (!e.startsWith("llvm-")) continue;
      const p = path.join(root, e, "bin", exe);
      if (isExecutable(p)) hits.push(p);
    }
  }
  // Highest version wins.
  hits.sort((a, b) => llvmVersion(a) - llvmVersion(b));
  return hits.pop() ?? null;
}

function llvmVersion(p: string): number {
  const m = /llvm-(\d+)/.exec(p);
  return m ? Number(m[1]) : 0;
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
