#!/usr/bin/env bun
// Compiles every example entrypoint and runs the ones marked runnable. This is
// the "always run the app" gate (AGENT_WORKFLOW.md §Run): a change that breaks
// any example must fail here, not in the user's hands.
//
// Contract:
//   - Every file with `fn main(` MUST compile (build through clang). Any failure
//     is a hard FAIL and exits non-zero.
//   - A file with a `// @run: <args>` annotation is also executed and must exit 0
//     (`// @run:` with no args = run with none). Use this for self-contained
//     examples; omit it for servers/interactive/arg-needing ones (compile-only).
//   - Files without `fn main(` are library modules — skipped (they compile
//     transitively via their importer). Logged so nothing is silently dropped.
//   - An entrypoint that @embedFiles a generated game asset that has not been
//     fetched is skipped into its own bucket, never silently passed. Neither a
//     compile nor a failure: run scripts/fetch-assets.sh and it comes back.
//
// Usage: bun run scripts/run-examples.ts [--verbose]

import { spawnSync } from "node:child_process";
import { readdirSync, statSync, mkdtempSync, existsSync, readFileSync } from "node:fs";
import { join, dirname, normalize } from "node:path";
import { tmpdir } from "node:os";

const verbose = process.argv.includes("--verbose");
const root = "examples";
const out = mkdtempSync(join(tmpdir(), "milo-examples-"));

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) files.push(...walk(p));
    else if (p.endsWith(".milo")) files.push(p);
  }
  return files;
}

// The game assets under these paths are downloaded, not committed
// (scripts/fetch-assets.sh). font.png sits in the bodies directory but is a
// committed bitmap font — if it is missing, that is a real breakage, not an
// unfetched asset, so it must not qualify for the skip below.
function isFetchableAsset(path: string): boolean {
  if (path.startsWith("examples/games/flight/cities/")) {
    return path.endsWith(".city") || path.endsWith(".ortho.png");
  }
  if (path.startsWith("examples/games/apsis/bodies/")) {
    return path.endsWith(".png") && !path.endsWith("/font.png");
  }
  return false;
}

const srcCache = new Map<string, string>();
function readSrc(path: string): string {
  let s = srcCache.get(path);
  if (s === undefined) {
    s = existsSync(path) ? readFileSync(path, "utf8") : "";
    srcCache.set(path, s);
  }
  return s;
}

// Every path an entrypoint bakes in with @embedFile, its own and those of every
// module it reaches through relative imports. @embedFile is resolved at compile
// time and relative to the file that writes it, so a missing one is a build
// error — walking the graph is what keeps this list from going stale when a
// game moves an embed into another module.
function embeddedAssetsOf(entry: string): string[] {
  const seen = new Set<string>();
  const assets = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    // Whole-line comments are dropped first: prose about @embedFile (fmt.milo
    // explains how `@` lexes) would otherwise register as a dependency on a
    // file that was never meant to exist.
    const src = readSrc(file).replace(/^[ \t]*\/\/.*$/gm, "");
    const dir = dirname(file);
    for (const m of src.matchAll(/@embedFile\s*\(\s*"([^"]+)"/g)) {
      assets.add(normalize(join(dir, m[1]!)));
    }
    // Package imports (std/*, gl, sdl) cannot reach these assets; only relative
    // ones are followed.
    for (const m of src.matchAll(/^\s*from\s+"(\.[^"]*)"/gm)) {
      const spec = m[1]!;
      queue.push(normalize(join(dir, spec.endsWith(".milo") ? spec : spec + ".milo")));
    }
  }
  return [...assets];
}

function milo(args: string[], input?: string) {
  return spawnSync("bun", ["run", "src/main.ts", ...args], {
    encoding: "utf8",
    input,
    timeout: 60_000,
  });
}

const examples = walk(root).sort();
let compiled = 0, ran = 0, skipped = 0, assetsMissing = 0;
const failures: { file: string; phase: string; detail: string }[] = [];

for (const f of examples) {
  const src = await Bun.file(f).text();
  if (!/\bfn\s+main\s*\(/.test(src)) {
    skipped++;
    if (verbose) console.log(`SKIP (library)  ${f}`);
    continue;
  }

  // An example whose downloaded assets are absent would fail to compile for a
  // reason that says nothing about the compiler. Skip it out loud and bucket it
  // separately: never counted as compiled (it was not), never counted as passed.
  // Only assets fetch-assets.sh can produce qualify — anything else missing is
  // a real failure and falls through to the compile gate below.
  const missingAssets = embeddedAssetsOf(f).filter((p) => !existsSync(p));
  if (missingAssets.length > 0 && missingAssets.every(isFetchableAsset)) {
    assetsMissing++;
    console.log(`SKIP (assets)  ${f}`);
    console.log(`  ${missingAssets.length} generated asset(s) missing, e.g. ${missingAssets[0]}`);
    console.log(`  run scripts/fetch-assets.sh to download them, then re-run`);
    continue;
  }

  // Compile (hard gate) — full pipeline including clang link.
  const bin = join(out, f.replace(/[\/.]/g, "_"));
  const build = milo(["build", f, "-o", bin]);
  if (build.status !== 0) {
    failures.push({ file: f, phase: "compile", detail: (build.stderr || build.stdout || "").trim().split("\n").slice(-4).join("\n") });
    console.log(`FAIL compile   ${f}`);
    continue;
  }
  compiled++;

  // Run only if opted in via `// @run:`.
  const m = src.match(/^\s*\/\/\s*@run:(.*)$/m);
  if (!m) {
    if (verbose) console.log(`OK   compile   ${f}`);
    continue;
  }
  const runArgs = m[1].trim().split(/\s+/).filter(Boolean);
  const stdinM = src.match(/^\s*\/\/\s*@stdin:(.*)$/m);
  const run = milo(["run", f, ...(runArgs.length ? ["--", ...runArgs] : [])], stdinM ? stdinM[1].trim() + "\n" : undefined);
  if (run.status !== 0) {
    failures.push({ file: f, phase: "run", detail: `exit ${run.status}: ${(run.stderr || "").trim().split("\n").slice(-3).join("\n")}` });
    console.log(`FAIL run       ${f}`);
    continue;
  }
  ran++;
  console.log(`OK   ran       ${f}  ${runArgs.join(" ")}`);
}

console.log(`\nexamples: ${compiled} compiled, ${ran} of those ran, ${skipped} library modules skipped, ${assetsMissing} skipped for missing assets, ${failures.length} failed`);
if (assetsMissing > 0) console.log(`${assetsMissing} example(s) were NOT built — run scripts/fetch-assets.sh for their assets`);
for (const fl of failures) console.log(`\n--- ${fl.phase} FAIL: ${fl.file} ---\n${fl.detail}`);
process.exit(failures.length ? 1 : 0);
