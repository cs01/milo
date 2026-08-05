#!/usr/bin/env bun
// Does milo-self REJECT the programs it is supposed to reject?
//
//   bun scripts/selfhost-rejects.ts                 # census
//   bun scripts/selfhost-rejects.ts --filter move   # only names containing "move"
//   bun scripts/selfhost-rejects.ts --verbose       # list accepted-but-shouldn't-be
//
// scripts/selfhost-sweep.ts measures only tests/fixtures — programs that must COMPILE and
// print the right thing. It deliberately skips every negative test. That leaves the more
// important half of a compiler unmeasured: a compiler that accepts literally everything
// scores 100% on the positive corpus. Memory safety in Milo is enforced by rejection, so
// "milo-self passes 578/578" says nothing about whether it is sound.
//
// Two lanes, mirroring tests/run.test.ts:
//   tests/errors/*.milo          must fail to compile; stderr must contain `// @error:`
//   tests/runtime-errors/*.milo  must compile at --debug, then trap at runtime
//
// The `wrong-message` bucket matters as much as `ACCEPTED`: rejecting for an unrelated
// reason is not the same as catching the bug, and it is how a rejection test silently
// stops testing anything.
//
// THIS IS NOT A GATE. Self-host parity must never block a change in src/ — see
// docs/self-hosting.md. Every milo-self invocation goes through guardedRun.
import { readdirSync, readFileSync, mkdtempSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join, basename } from "path";
import { parseExpectedError, parseExpectedRuntimeError } from "../tests/annotations";
import { guardedRun } from "./guard";

const MILO_ROOT = join(import.meta.dir, "..");
const MILO_SELF = join(MILO_ROOT, ".selfhost", "milo-self.bin");
const ERRORS_DIR = join(MILO_ROOT, "tests", "errors");
const RUNTIME_ERRORS_DIR = join(MILO_ROOT, "tests", "runtime-errors");
const CHILD_ENV = { ...process.env, MILO_ROOT };
const CONCURRENCY = Number(process.env.MILO_SWEEP_CONCURRENCY || 0) || 4;

const argv = process.argv.slice(2);
const verbose = argv.includes("--verbose");
const fi = argv.indexOf("--filter");
const filter = fi >= 0 ? argv[fi + 1] : null;

if (!existsSync(MILO_SELF)) {
  console.error(`missing ${MILO_SELF} — run scripts/selfhost.sh first`);
  process.exit(1);
}

// "unmeasured" is not a verdict about the compiler — it means the guard killed the child
// (watchdog or system memory pressure) before it could answer. Folding those into
// "wrong-message" is how a harness reports a confident number it did not actually measure;
// an early version of this script did exactly that and produced 204 bogus failures while
// six compiler builds were competing for RAM. Run this with the machine otherwise idle.
type Verdict = "ok" | "accepted" | "wrong-message" | "build-failed" | "did-not-trap" | "unmeasured";
type Outcome = { name: string; lane: string; verdict: Verdict; detail: string };

function names(dir: string): string[] {
  return readdirSync(dir).filter(f => f.endsWith(".milo")).map(f => basename(f, ".milo"))
    .filter(n => !filter || n.includes(filter)).sort();
}

// A negative test can be as platform-bound as a positive one: a diagnostic quoting a POSIX
// header proves nothing where that header does not exist. Same contract as tests/run.test.ts.
function skipped(source: string): boolean {
  const m = source.match(/^\s*\/\/\s*@skip-os:(.*)$/m);
  return !!m && m[1]!.split(/[,\s]+/).filter(Boolean).includes(process.platform);
}

async function checkReject(name: string, tmpDir: string): Promise<Outcome> {
  const src = join(ERRORS_DIR, `${name}.milo`);
  const source = readFileSync(src, "utf-8");
  const want = parseExpectedError(source);

  const r = await guardedRun(MILO_SELF, ["build", src, "-o", join(tmpDir, "rejected")],
    { env: CHILD_ENV, timeoutMs: 60_000, memMb: 1536 });
  const out = r.stderr + r.stdout;

  if (r.guardKill) return { name, lane: "errors", verdict: "unmeasured", detail: r.guardKill };
  if (r.code === 0) return { name, lane: "errors", verdict: "accepted", detail: "compiled clean — the bug this fixture guards is not caught" };
  if (want && !out.includes(want)) {
    return { name, lane: "errors", verdict: "wrong-message", detail: `want "${want}" — got "${out.trim().split("\n").find(l => l.trim())?.slice(0, 110) ?? ""}"` };
  }
  return { name, lane: "errors", verdict: "ok", detail: "" };
}

async function checkTrap(name: string, tmpDir: string): Promise<Outcome> {
  const src = join(RUNTIME_ERRORS_DIR, `${name}.milo`);
  const source = readFileSync(src, "utf-8");
  const want = parseExpectedRuntimeError(source);
  const bin = join(tmpDir, `rt_${name}`);

  const build = await guardedRun(MILO_SELF, ["build", src, "--debug", "-o", bin],
    { env: CHILD_ENV, timeoutMs: 60_000, memMb: 1536 });
  if (build.guardKill) return { name, lane: "runtime-errors", verdict: "unmeasured", detail: build.guardKill };
  if (build.code !== 0) {
    return { name, lane: "runtime-errors", verdict: "build-failed", detail: (build.stderr + build.stdout).trim().split("\n").find(l => l.trim())?.slice(0, 130) ?? "" };
  }

  const r = await guardedRun(bin, [], { env: CHILD_ENV, timeoutMs: 30_000, memMb: 512 });
  // A guard kill is not a trap — the watchdog fired, the program's own bounds check may
  // never have run. Do not count it as the fixture passing.
  if (r.guardKill) return { name, lane: "runtime-errors", verdict: "unmeasured", detail: r.guardKill };
  if (r.code === 0 && !r.signal) {
    return { name, lane: "runtime-errors", verdict: "did-not-trap", detail: "exited 0 — the trap this fixture guards did not fire" };
  }
  const out = r.stderr + r.stdout;
  if (want && !out.includes(want)) {
    return { name, lane: "runtime-errors", verdict: "wrong-message", detail: `want "${want}" — got "${out.trim().split("\n").pop()?.slice(0, 110) ?? `signal ${r.signal ?? ""}`}"` };
  }
  return { name, lane: "runtime-errors", verdict: "ok", detail: "" };
}

const tmpDir = mkdtempSync(join(tmpdir(), "milo-neg-"));
const jobs: (() => Promise<Outcome>)[] = [];
let skips = 0;
for (const n of names(ERRORS_DIR)) {
  if (skipped(readFileSync(join(ERRORS_DIR, `${n}.milo`), "utf-8"))) { skips++; continue; }
  jobs.push(() => checkReject(n, tmpDir));
}
for (const n of names(RUNTIME_ERRORS_DIR)) {
  if (skipped(readFileSync(join(RUNTIME_ERRORS_DIR, `${n}.milo`), "utf-8"))) { skips++; continue; }
  jobs.push(() => checkTrap(n, tmpDir));
}

const results: Outcome[] = [];
let next = 0;
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (next < jobs.length) results.push(await jobs[next++]!());
}));
results.sort((a, b) => (a.lane + a.name).localeCompare(b.lane + b.name));

const ok = results.filter(r => r.verdict === "ok");
const unmeasured = results.filter(r => r.verdict === "unmeasured");
const measured = results.length - unmeasured.length;
console.log(`${ok.length}/${measured} negative tests behave correctly under milo-self (${skips} skipped for this OS)`);
if (unmeasured.length) {
  console.log(`WARNING: ${unmeasured.length} of ${results.length} were NOT MEASURED — the guard killed them. ` +
    `Re-run with the machine idle; these numbers are incomplete, not a compiler verdict.`);
}
console.log();

const order: Verdict[] = ["accepted", "did-not-trap", "wrong-message", "build-failed", "unmeasured"];
for (const v of order) {
  const rs = results.filter(r => r.verdict === v);
  if (!rs.length) continue;
  const gloss = v === "accepted" ? "  <-- UNSOUND: milo-self compiles a program it must reject"
    : v === "did-not-trap" ? "  <-- UNSOUND: the runtime check did not fire"
    : v === "wrong-message" ? "  (rejected, but for a different reason — the fixture is no longer testing what it names)"
    : v === "build-failed" ? "  (rejected at build time, but this lane's programs are supposed to BUILD and then trap)"
    : "  (guard kill — no verdict; the machine was busy)";
  console.log(`${String(rs.length).padStart(5)}  ${v}${gloss}`);
  for (const r of rs) console.log(`         ${r.name}: ${r.detail}`);
  console.log();
}
if (verbose) for (const r of ok) console.log(`  OK  ${r.lane}/${r.name}`);
process.exit(results.some(r => r.verdict !== "ok") ? 1 : 0);
