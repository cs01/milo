// Byte-exact IR differential: emit LLVM IR for every fixture with BOTH compilers and
// compare the bytes. This is the oracle a src-milo port needs at every step — the TS
// backend is the reference, and "N/M byte-identical" is the single number that says
// whether the port is converging before months are spent on it.
//
//   bun scripts/ir-diff.ts                  # census against tests/fixtures
//   bun scripts/ir-diff.ts --filter vec     # only fixtures whose name contains vec
//   bun scripts/ir-diff.ts --build          # (re)build milo-self first
//   bun scripts/ir-diff.ts --write          # record the current result as the baseline
//   bun scripts/ir-diff.ts --show name      # print the first differing lines for one fixture
//
// Why IR and not execution: no clang, no linking, no running untrusted output — so it is
// fast enough to sit in the edit loop, and a difference points at the exact emitted line
// instead of at a wrong number printed three stages later. `emit-ir` type-checks too
// (`compile()` exits nonzero on errors), so agreement here also means checker agreement.
//
// Every milo-self invocation goes through guardedRun: the binary under test is milo-built
// and has known memory bugs (scripts/guard.ts, docs/self-hosting.md).
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";
import { guardedRun } from "./guard";

const MILO_ROOT = join(import.meta.dir, "..");
const MILO_SELF = join(MILO_ROOT, ".selfhost", "milo-self.bin");
const FIXTURES_DIR = join(MILO_ROOT, "tests", "fixtures");
const BASELINE = join(MILO_ROOT, "tests", "ir-diff.baseline.json");

// milo-self is nondeterministic under parallel load (a few fixtures flip); keep the
// default modest and use MILO_IRDIFF_CONCURRENCY=1 for a run whose result gets recorded.
const CONCURRENCY = Number(process.env.MILO_IRDIFF_CONCURRENCY || 0) || 4;
const SELF_MEM_MB = 1536;
const SELF_TIMEOUT_S = 60;

type Bucket = "identical" | "canonical" | "differs" | "self-failed" | "oracle-failed" | "both-failed";
type Row = { name: string; bucket: Bucket; detail?: string; failure?: string };

function args(): { filter?: string; build: boolean; write: boolean; show?: string } {
  const a = process.argv.slice(2);
  const valueOf = (flag: string) => {
    const i = a.indexOf(flag);
    return i >= 0 && i + 1 < a.length ? a[i + 1] : undefined;
  };
  return { filter: valueOf("--filter"), build: a.includes("--build"), write: a.includes("--write"), show: valueOf("--show") };
}

function buildSelf() {
  mkdirSync(join(MILO_ROOT, ".selfhost"), { recursive: true });
  console.error("building milo-self (guarded)...");
  const r = spawnSync("bun", [
    join(MILO_ROOT, "scripts/guard.ts"), "--virtual-mem-mb", "8192", "--timeout-s", "300", "--",
    "bun", "run", join(MILO_ROOT, "src/main.ts"), "build", join(MILO_ROOT, "src-milo/main.milo"),
    "-o", MILO_SELF,
  ], { encoding: "utf-8", cwd: MILO_ROOT });
  if (r.status !== 0) {
    console.error(`milo-self build FAILED:\n${r.stdout ?? ""}${r.stderr ?? ""}`);
    process.exit(1);
  }
}

/** IR from the TS compiler (the oracle), or null if it declined to compile the fixture. */
function oracleIR(file: string): string | null {
  const r = spawnSync("bun", ["run", join(MILO_ROOT, "src/main.ts"), "emit-ir", file], {
    encoding: "utf-8", cwd: MILO_ROOT, maxBuffer: 256 * 1024 * 1024,
  });
  return r.status === 0 ? (r.stdout ?? "") : null;
}

async function selfIR(file: string): Promise<{ ir: string | null; err: string }> {
  const r = await guardedRun(MILO_SELF, ["emit-ir", file], {
    timeoutMs: SELF_TIMEOUT_S * 1000, memMb: SELF_MEM_MB, env: { ...process.env, MILO_ROOT },
  });
  return { ir: r.code === 0 ? (r.stdout ?? "") : null, err: (r.stderr ?? "").replace(/\x1b\[[0-9;]*m/g, "") };
}

/**
 * Collapse a milo-self failure into a stable class so 242 individual failures become a
 * ranked list of missing features. Identifiers, numbers and paths are erased because the
 * question is "what does milo0 not implement", not "which fixture hit it".
 */
function failureClass(stderr: string): string {
  const line = stderr.split("\n").map(l => l.trim()).find(l => l.startsWith("error")) ?? "";
  if (!line) {
    const first = stderr.split("\n").map(l => l.trim()).find(Boolean);
    return first ? first.slice(0, 90) : "(no diagnostic — crash, timeout or guard kill)";
  }
  return line
    .replace(/^error(\[[^\]]*\])?:\s*/, "")
    .replace(/'[^']*'/g, "'X'")
    .replace(/"[^"]*"/g, '"X"')
    .replace(/\b\d+\b/g, "N")
    .replace(/\S+\.milo/g, "F.milo")
    .slice(0, 110);
}

/**
 * Reorder a module into a canonical shape: header, type declarations, extern declarations,
 * globals, then function definitions — each group sorted, functions by name.
 *
 * Without this the census is useless. The two backends emit the same top-level items in a
 * different ORDER (milo-self puts `@_milo_argc_global` before the target triple), so every
 * single fixture "differs at line 1" and one cosmetic disagreement hides every real one.
 * Strict byte-equality is still reported separately — it is the stronger claim, and it was
 * the historical convergence criterion — but this is the number that tells you whether the
 * generated CODE agrees.
 */
function canonicalize(ir: string): string {
  const header: string[] = [], typedefs: string[] = [], declares: string[] = [];
  const globals: string[] = [], funcs: string[] = [], other: string[] = [];
  const lines = ir.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) continue;
    if (line.startsWith("define")) {
      const start = i;
      while (i < lines.length && lines[i] !== "}") i++;
      funcs.push(lines.slice(start, i + 1).join("\n"));
    } else if (line.startsWith("declare")) declares.push(line);
    else if (line.startsWith("target ") || line.startsWith("source_filename")) header.push(line);
    else if (/^%\S* = type\b/.test(line)) typedefs.push(line);
    else if (line.startsWith("@")) globals.push(line);
    else other.push(line);
  }
  const byName = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
  return [header, typedefs, declares, globals, funcs, other]
    .map(g => g.sort(byName).join("\n")).join("\n");
}

/** First line where the two modules disagree, as `line N: <oracle> | <self>`. */
function firstDifference(a: string, b: string): string {
  const la = a.split("\n");
  const lb = b.split("\n");
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    if (la[i] !== lb[i]) {
      return `line ${i + 1}:\n    oracle: ${la[i] ?? "<eof>"}\n    self:   ${lb[i] ?? "<eof>"}`;
    }
  }
  return `identical text, ${la.length} vs ${lb.length} lines`;
}

async function mapPool<T>(items: T[], limit: number, fn: (item: T, i: number) => Promise<void>) {
  let next = 0;
  const worker = async () => { while (next < items.length) { const i = next++; await fn(items[i]!, i); } };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
}

const opts = args();
if (opts.build || !existsSync(MILO_SELF)) buildSelf();

const fixtures = readdirSync(FIXTURES_DIR)
  .filter(f => f.endsWith(".milo"))
  .filter(f => !opts.filter || f.includes(opts.filter))
  .filter(f => !opts.show || f.replace(".milo", "") === opts.show)
  .sort();

if (fixtures.length === 0) {
  console.error("no fixtures matched");
  process.exit(1);
}

const rows: Row[] = new Array(fixtures.length);
let done = 0;
await mapPool(fixtures, CONCURRENCY, async (f, idx) => {
  const path = join(FIXTURES_DIR, f);
  const name = f.replace(".milo", "");
  const a = oracleIR(path);
  const self = await selfIR(path);
  const b = self.ir;
  let row: Row;
  if (a === null && b === null) row = { name, bucket: "both-failed" };
  else if (a === null) row = { name, bucket: "oracle-failed" };
  else if (b === null) row = { name, bucket: "self-failed", failure: failureClass(self.err) };
  else if (a === b) row = { name, bucket: "identical" };
  else {
    const [ca, cb] = [canonicalize(a), canonicalize(b)];
    row = ca === cb
      ? { name, bucket: "canonical" }
      : { name, bucket: "differs", detail: firstDifference(ca, cb) };
  }
  rows[idx] = row;
  done++;
  if (!opts.show && done % 25 === 0) process.stderr.write(`  ${done}/${fixtures.length}\r`);
});

if (opts.show) {
  const r = rows[0]!;
  console.log(`${r.name}: ${r.bucket}`);
  if (r.detail) console.log(r.detail);
  process.exit(0);
}

const by = (b: Bucket) => rows.filter(r => r.bucket === b);
const identical = by("identical").length;
// Fixtures the oracle itself cannot compile are not evidence about the port either way.
const comparable = rows.length - by("oracle-failed").length;

console.error(" ".repeat(30) + "\r");
console.log(`\nIR differential — src-milo vs src/codegen.ts, ${rows.length} fixtures\n`);
for (const b of ["identical", "canonical", "differs", "self-failed", "both-failed", "oracle-failed"] as Bucket[]) {
  const n = by(b).length;
  if (n > 0) console.log(`  ${String(n).padStart(4)}  ${b}`);
}
const agreeing = identical + by("canonical").length;
const pct = (n: number) => comparable > 0 ? ` (${((n / comparable) * 100).toFixed(1)}%)` : "";
console.log(`\n  ${identical}/${comparable} byte-identical${pct(identical)}`);
console.log(`  ${agreeing}/${comparable} agree after canonical reordering${pct(agreeing)}`);

// The actionable output: what milo0 is missing, ranked by how many fixtures it blocks.
const failures = by("self-failed");
if (failures.length > 0) {
  const counts = new Map<string, string[]>();
  for (const r of failures) {
    const k = r.failure ?? "(unknown)";
    counts.set(k, [...(counts.get(k) ?? []), r.name]);
  }
  const ranked = [...counts.entries()].sort((x, y) => y[1].length - x[1].length);
  console.log(`\nwhat src-milo cannot compile, by cause (${failures.length} fixtures, ${ranked.length} distinct):\n`);
  for (const [cause, names] of ranked.slice(0, 25)) {
    console.log(`  ${String(names.length).padStart(4)}  ${cause}`);
    console.log(`        e.g. ${names.slice(0, 3).join(", ")}`);
  }
  if (ranked.length > 25) console.log(`\n  ...and ${ranked.length - 25} more causes`);
}

const differs = by("differs");
if (differs.length > 0) {
  console.log(`\nfirst divergences (bun scripts/ir-diff.ts --show <name> for one):`);
  for (const r of differs.slice(0, 5)) console.log(`\n  ${r.name}\n    ${r.detail?.split("\n").join("\n    ")}`);
  if (differs.length > 5) console.log(`\n  ...and ${differs.length - 5} more`);
}

if (opts.write) {
  const snapshot = {
    recordedFixtures: rows.length,
    identical,
    comparable,
    // Names, not just a count: a count alone lets one fixture regress while another
    // starts passing and still reports "no change".
    identicalNames: by("identical").map(r => r.name),
    agreeingNames: [...by("identical"), ...by("canonical")].map(r => r.name).sort(),
  };
  writeFileSync(BASELINE, JSON.stringify(snapshot, null, 2) + "\n");
  console.log(`\nbaseline written to ${BASELINE}`);
} else if (existsSync(BASELINE)) {
  const prev = JSON.parse(readFileSync(BASELINE, "utf-8")) as { identicalNames: string[] };
  const was = new Set(prev.identicalNames);
  const now = new Set(by("identical").map(r => r.name));
  const lost = [...was].filter(n => !now.has(n));
  const gained = [...now].filter(n => !was.has(n));
  if (lost.length) console.log(`\nREGRESSED (were byte-identical, now not): ${lost.join(", ")}`);
  if (gained.length) console.log(`\nnewly byte-identical: ${gained.join(", ")}`);
  if (lost.length) process.exit(1);
}
