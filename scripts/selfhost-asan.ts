#!/usr/bin/env bun
// Is the code milo-self GENERATES memory-safe?
//
//   bun scripts/selfhost-asan.ts                 # census
//   bun scripts/selfhost-asan.ts --filter json   # only fixtures whose name contains "json"
//   bun scripts/selfhost-asan.ts --verbose       # per-fixture verdicts + the first non-runtime frame
//   bun scripts/selfhost-asan.ts --check         # ratchet: exit 1 if a clean fixture regresses
//   bun scripts/selfhost-asan.ts --write         # shrink the known-bad manifest
//   bun scripts/selfhost-asan.ts --rebuild       # force a fresh stage2 + ASan link
//
// scripts/selfhost-sweep.ts asks "does milo-self compile the corpus to programs that
// print the right bytes". A double-free answers YES to that question — it happens after
// the output, the process still exits 0, and 586/586 stays green. That is exactly how
// three aliasing bugs in milo-self's codegen survived the whole fixture corpus: a struct
// field read out of a container it did not own, a Heap<T> box copied as a bare pointer,
// and `*box` on an indexed element. All three handed out a second owner of one
// allocation; none of them changed a single line of expected output.
//
// This harness asks the other question. It builds STAGE 2 — milo-self compiling
// src-milo, linked with AddressSanitizer — and runs that compiler over the fixture
// corpus. src-milo contains no unsafe code, so an ASan report on stage2 IS a bug in the
// code milo-self emitted; there is nothing else to blame and no false positives to
// triage. The first census this found was 77 of 585 fixtures; the three fixes above took
// it to 0.
//
// Compiling is all that runs here: `stage2 emit-ir <fixture>`. The fixture's own binary
// is never built or executed — the subject under test is the COMPILER's memory
// behaviour, and every fixture exercises a different corner of it.
//
// Non-ok results are re-verified serially before being reported. milo-self is
// nondeterministic under parallel load (a hashmap seeded from getentropy), and a guard
// kill under contention is not a verdict — folding one into "memory error" reports a
// number that was never measured.
//
// THIS IS NOT A `bun test` GATE. Nothing in CI or the default test run invokes it, and
// per docs/self-hosting.md self-host parity must never block a change in src/. Run it
// deliberately, on an idle machine. Every milo-self invocation goes through guardedRun —
// an unguarded self-compile has crashed this machine twice.
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from "fs";
import { join, basename } from "path";
import { guardedRun } from "./guard";

const MILO_ROOT = join(import.meta.dir, "..");
const SELFHOST_DIR = join(MILO_ROOT, ".selfhost");
const MILO_SELF = join(SELFHOST_DIR, "milo-self.bin");
const STAGE2_LL = join(SELFHOST_DIR, "stage2.ll");
const STAGE2_ASAN = join(SELFHOST_DIR, "milo-self-asan.bin");
const FIXTURES_DIR = join(MILO_ROOT, "tests", "fixtures");
const SRC_MILO = join(MILO_ROOT, "src-milo");
const MANIFEST = join(MILO_ROOT, "tests", "selfhost-asan-manifest.txt");
const CHILD_ENV = {
  ...process.env,
  MILO_ROOT,
  ASAN_OPTIONS: "detect_leaks=0:allocator_may_return_null=1",
};
const CONCURRENCY = Number(process.env.MILO_SWEEP_CONCURRENCY || 0) || 4;

const argv = process.argv.slice(2);
const verbose = argv.includes("--verbose");
const check = argv.includes("--check");
const write = argv.includes("--write");
const rebuild = argv.includes("--rebuild");
const fi = argv.indexOf("--filter");
const filter = fi >= 0 ? argv[fi + 1] : null;

if (!existsSync(MILO_SELF)) {
  console.error(`missing ${MILO_SELF} — run scripts/selfhost.sh first`);
  process.exit(1);
}

function newestMtime(dir: string): number {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestMtime(p) : statSync(p).mtimeMs);
  }
  return newest;
}

function asanBinIsFresh(): boolean {
  if (!existsSync(STAGE2_ASAN)) return false;
  const built = statSync(STAGE2_ASAN).mtimeMs;
  return built > statSync(MILO_SELF).mtimeMs && built > newestMtime(SRC_MILO);
}

async function buildStage2Asan(): Promise<void> {
  console.error("stage 2: milo-self compiles src-milo…");
  const emit = await guardedRun(MILO_SELF, ["emit-ir", join(SRC_MILO, "main.milo")],
    { env: CHILD_ENV, timeoutMs: 600_000, memMb: 4096 });
  if (emit.guardKill) {
    console.error(`stage 2 NOT MEASURED — guard kill (${emit.guardKill}). Re-run with the machine idle.`);
    process.exit(1);
  }
  // A stage that exits 0 with no output is a failure, not a pass: an early version of
  // the fixpoint script reported success on an empty .ll.
  if (emit.code !== 0 || emit.stdout.length === 0) {
    console.error(`stage 2 FAILED — exit ${emit.code}, ${emit.stdout.length} bytes of IR`);
    console.error(emit.stderr.trim().split("\n").slice(0, 10).join("\n"));
    process.exit(1);
  }
  writeFileSync(STAGE2_LL, emit.stdout);

  // -O1 deliberately. At -O0 nothing coalesces the per-variant allocas in
  // Expr$Clone$clone (44 x %Expr = a ~24 KB frame) and a 340-deep AST clone exhausts
  // the 8 MB main-thread stack before ASan sees anything interesting. At -O2 the
  // recursive clone chain inlines into itself and the reported frames stop naming the
  // function that actually owns the bug. -O1 keeps both usable.
  const libs = process.platform === "darwin"
    ? ["-lm", "-L/opt/homebrew/opt/openssl@3/lib", "-lssl", "-lcrypto",
       "-L/opt/homebrew/opt/sqlite/lib", "-lsqlite3"]
    : ["-lm", "-lssl", "-lcrypto", "-lsqlite3"];
  console.error("linking stage 2 with AddressSanitizer…");
  const link = Bun.spawnSync(["clang", "-O1", "-w", "-fsanitize=address", STAGE2_LL,
    "-o", STAGE2_ASAN, ...libs]);
  if (link.exitCode !== 0) {
    console.error(`clang failed (${link.exitCode}):\n${link.stderr.toString().slice(0, 2000)}`);
    process.exit(1);
  }
}

if (rebuild || !asanBinIsFresh()) await buildStage2Asan();
else console.error(`reusing ${basename(STAGE2_ASAN)} (newer than milo-self and src-milo; --rebuild to force)`);

type Verdict = "ok" | "memory-error" | "unmeasured";
type Outcome = { name: string; verdict: Verdict; kind: string; frame: string };

// The frame that names the generated function is the lead. Everything inside the ASan
// runtime (free/malloc/memcpy interceptors) is noise that is identical for every report.
function firstOwnFrame(report: string): string {
  for (const line of report.split("\n")) {
    const m = line.match(/^\s*#\d+ 0x[0-9a-f]+ in (.+?)(?: \(|$)/);
    if (m && !line.includes("libclang_rt") && !line.includes("dyld")) return m[1]!.trim();
  }
  return "";
}

async function checkFixture(name: string): Promise<Outcome> {
  const src = join(FIXTURES_DIR, `${name}.milo`);
  const r = await guardedRun(STAGE2_ASAN, ["emit-ir", src],
    { env: CHILD_ENV, timeoutMs: 60_000, memMb: 2048 });
  if (r.guardKill) return { name, verdict: "unmeasured", kind: r.guardKill, frame: "" };
  const report = r.stderr;
  const m = report.match(/ERROR: AddressSanitizer: ([a-z-]+)/);
  // A fixture milo-self legitimately rejects still answers this harness's question: the
  // compiler ran and did not corrupt its own heap. Only an ASan report is a failure.
  if (!m) return { name, verdict: "ok", kind: "", frame: "" };
  return { name, verdict: "memory-error", kind: m[1]!, frame: firstOwnFrame(report) };
}

const fixtures = readdirSync(FIXTURES_DIR)
  .filter(f => f.endsWith(".milo")).map(f => basename(f, ".milo"))
  .filter(n => !filter || n.includes(filter)).sort();

const results: Outcome[] = [];
let next = 0;
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (next < fixtures.length) results.push(await checkFixture(fixtures[next++]!));
}));
results.sort((a, b) => a.name.localeCompare(b.name));

const suspect = results.filter(r => r.verdict !== "ok");
if (suspect.length && CONCURRENCY > 1) {
  console.error(`re-verifying ${suspect.length} non-ok result(s) serially…`);
  for (const s of suspect) Object.assign(s, await checkFixture(s.name));
  const recovered = suspect.filter(r => r.verdict === "ok");
  if (recovered.length) console.error(`  ${recovered.length} clean on retry (parallel-load flake): ${recovered.map(r => r.name).join(", ")}`);
}

const bad = results.filter(r => r.verdict === "memory-error");
const unmeasured = results.filter(r => r.verdict === "unmeasured");
const measured = results.length - unmeasured.length;
console.log(`${measured - bad.length}/${measured} fixtures compile with an ASan-clean self-hosted compiler`);
if (unmeasured.length) {
  console.log(`WARNING: ${unmeasured.length} of ${results.length} were NOT MEASURED — the guard killed them. ` +
    `Re-run with the machine idle; this census is incomplete, not a verdict.`);
}
if (bad.length) {
  console.log();
  const kinds = new Map<string, number>();
  for (const b of bad) kinds.set(b.kind, (kinds.get(b.kind) ?? 0) + 1);
  for (const [kind, n] of [...kinds].sort((a, b) => b[1] - a[1])) {
    console.log(`${String(n).padStart(5)}  ${kind}`);
    for (const b of bad.filter(x => x.kind === kind)) {
      console.log(`         ${b.name}${b.frame ? `: in ${b.frame}` : ""}`);
    }
  }
}
if (verbose) for (const r of results.filter(r => r.verdict === "ok")) console.log(`  OK  ${r.name}`);

// The ratchet runs the opposite direction from selfhost-rejects.ts: that manifest lists
// what already works and may only grow, this one lists what is still broken and may only
// shrink. Zero is the intended steady state, so a fixture that is clean today must never
// go back to reporting a memory error.
if (check || write) {
  const header = existsSync(MANIFEST)
    ? readFileSync(MANIFEST, "utf-8").split("\n").filter(l => l.startsWith("#")).join("\n")
    : "# Fixtures that still make the self-hosted compiler report an AddressSanitizer error.\n" +
      "# Shrinking list, never a spec: a name may only be REMOVED. Empty is the goal state.\n" +
      "# Refresh with: bun scripts/selfhost-asan.ts --write";
  const claimed = existsSync(MANIFEST)
    ? readFileSync(MANIFEST, "utf-8").split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"))
    : [];
  const badNames = bad.map(b => b.name).sort();
  // An unmeasured fixture is a guard kill, not a regression — the machine was busy.
  const unmeasuredNames = new Set(unmeasured.map(r => r.name));
  const regressed = badNames.filter(n => !claimed.includes(n));
  const fixed = claimed.filter(n => !badNames.includes(n) && !unmeasuredNames.has(n) && fixtures.includes(n));

  if (check) {
    if (fixed.length) console.log(`\nFIXED: ${fixed.length} fixture(s) no longer report a memory error — rerun with --write to ratchet:\n  ${fixed.join("\n  ")}`);
    if (regressed.length) {
      console.error(`\nASAN RATCHET FAILED: ${regressed.length} fixture(s) newly corrupt the compiler's heap:\n  ${regressed.map(n => `${n}: ${bad.find(b => b.name === n)!.kind} in ${bad.find(b => b.name === n)!.frame || "?"}`).join("\n  ")}`);
      process.exit(1);
    }
    console.log(`\nASAN RATCHET OK — ${claimed.length} known-bad fixture(s), no new ones`);
    process.exit(0);
  }
  // Only a full run may rewrite the manifest: a filtered one has no opinion about the
  // fixtures it never ran, and writing from it would silently drop them.
  if (filter) {
    console.error(`\nREFUSING TO WRITE: --write needs a full run, but --filter ${filter} ran ${fixtures.length} fixture(s)`);
    process.exit(1);
  }
  writeFileSync(MANIFEST, `${header}\n${badNames.join("\n")}${badNames.length ? "\n" : ""}`);
  console.log(`\nmanifest: ${claimed.length} → ${badNames.length} known-bad fixtures`);
  process.exit(0);
}

process.exit(bad.length ? 1 : 0);
