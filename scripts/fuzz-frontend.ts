// Token-mutation fuzzer for the Milo frontend (lexer → parser → [resolver] → checker).
//
// The contract under test: for ANY input, the frontend either produces diagnostics or
// finishes clean. It never throws a raw JS exception, never spins forever, and never
// emits a diagnostic whose span points outside the source. Bad input is expected — a
// `ParseError` or a checker diagnostic is the frontend working. An uncaught `TypeError`
// out of the parser, a `RangeError: Maximum call stack size exceeded`, a hang in error
// recovery, or a span at line 900 of a 3-line file are all bugs, and all of them are
// reachable from a mutated fixture.
//
// Mutations are token-level, not byte-level, because byte flips almost never get past
// the lexer. Splicing real token runs between corpus files gets mutants deep into the
// checker, which is where the interesting failures live.
//
// Findings are reduced with ddmin before being written out — an unreduced 200-line
// mutant is unreadable, and every finding here starts as one.
//
//   bun scripts/fuzz-frontend.ts                        # 2000 cases, seed 1
//   bun scripts/fuzz-frontend.ts --cases 50000 --seed 7
//   bun scripts/fuzz-frontend.ts --secs 300 --resolve    # include import resolution
//   bun scripts/fuzz-frontend.ts --file tests/fixtures/match.milo --cases 5000
//
// Exit code is 1 when any bucket is found, so it can gate CI. Long runs should go
// through the memory guard — a mutant can generate a pathological allocation and this
// machine has no rlimits:
//   bun scripts/guard.ts --mem-mb 4000 -- bun scripts/fuzz-frontend.ts --cases 100000
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "fs";
import { join, relative } from "path";
import { TokenKind, KEYWORDS } from "../src/tokens";
import { texts } from "./fuzz-scan";
import { PHASES, type CaseResult as Res } from "./fuzz-check";

const ROOT = join(import.meta.dir, "..");

// ---------------------------------------------------------------- args

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(name);
const opt = (name: string, dflt: string): string => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1]! : dflt;
};
const num = (name: string, dflt: number) => parseInt(opt(name, String(dflt)), 10);

const CASES = num("--cases", 2000);
const SECS = num("--secs", 0);
const SEED = num("--seed", 1);
const TIMEOUT_MS = num("--timeout-ms", 5000);
const REDUCE_TIMEOUT_MS = num("--reduce-timeout-ms", 2000);
const REDUCE_PROBES = num("--reduce-probes", 400);
const DO_RESOLVE = flag("--resolve");
const NO_REDUCE = flag("--no-reduce");
const OUT_DIR = join(ROOT, opt("--out", ".fuzz-findings"));
const ONE_FILE = opt("--file", "");
const MAX_SRC = 1 << 19; // 512 KiB — past this a mutant is testing the allocator, not the parser

// ---------------------------------------------------------------- prng

// Seeded so any finding reproduces from `--seed N` alone.
function mulberry32(a: number) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(SEED);
const ri = (n: number) => Math.floor(rnd() * n);
const pick = <T,>(xs: readonly T[]): T => xs[ri(xs.length)]!;

// ---------------------------------------------------------------- corpus

function loadCorpus(): { path: string; toks: string[] }[] {
  const files: string[] = [];
  if (ONE_FILE) {
    files.push(join(ROOT, ONE_FILE));
  } else {
    for (const dir of ["tests/fixtures", "tests/errors", "examples"]) {
      const glob = new Bun.Glob("**/*.milo");
      for (const f of glob.scanSync({ cwd: join(ROOT, dir), absolute: true })) files.push(f);
    }
  }
  const out: { path: string; toks: string[] }[] = [];
  for (const f of files) {
    try {
      const src = readFileSync(f, "utf-8");
      if (src.length > 200_000) continue;
      out.push({ path: relative(ROOT, f), toks: texts(src) });
    } catch { /* unreadable seed is not worth a failure */ }
  }
  return out;
}

const corpus = loadCorpus();
if (corpus.length === 0) {
  console.error("no corpus files found");
  process.exit(2);
}

// ---------------------------------------------------------------- vocabulary

// Every keyword and operator spelling the lexer knows. TokenKind's non-terminal
// members are ALL-CAPS placeholders (INT, IDENT, EOF) with no source spelling.
const SPELLINGS = Object.values(TokenKind).filter(v => !/^[A-Z]+$/.test(v));

// Literal forms chosen to sit on lexer boundaries: incomplete radix prefixes, a
// value past u64, a separator with nothing after it, an escape at EOF.
const LITERALS = [
  "0", "1", "255", "0x", "0b", "0xFFFFFFFFFFFFFFFF", "18446744073709551616",
  "1_", "1.", ".5", "1e400", "1.0", "'a'", "'\\'", "'\\n'", "''",
  '""', '"\\"', '"unterminated', '$"', '$"{x}"', '$"\\{"',
  "true", "false", "null",
];

// Identifiers pulled from the corpus so mutants reference names that actually
// resolve — a splice full of unknown symbols dies at name resolution and never
// reaches the parts of the checker worth testing.
const IDENTS = (() => {
  const freq = new Map<string, number>();
  for (const c of corpus) {
    for (const t of c.toks) {
      if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(t) && !KEYWORDS.has(t)) freq.set(t, (freq.get(t) ?? 0) + 1);
    }
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 400).map(e => e[0]);
})();

const VOCAB = [...SPELLINGS, ...LITERALS, ...IDENTS, " ", "\n", "\t"];

// Written as escapes, never as literal bytes: a raw NUL or a lone surrogate in
// this file would make the source itself invalid UTF-8, which breaks grep and
// most editors. NUL, lone surrogate, BOM, CR, and an astral-plane codepoint are
// the bytes the lexer's offset math is most likely to mishandle.
const POKES = ["\\", '"', "'", "\u0000", "\uD800", "\uFEFF", "\r", "{", "}", "@", "#", "\u00e9", "\u{1F525}", "//"];

// ---------------------------------------------------------------- mutators

type Mutator = (toks: string[]) => string[];

const deleteTok: Mutator = t => {
  if (t.length < 2) return t;
  const i = ri(t.length);
  return [...t.slice(0, i), ...t.slice(i + 1)];
};

const dupTok: Mutator = t => {
  if (!t.length) return t;
  const i = ri(t.length);
  return [...t.slice(0, i), t[i]!, ...t.slice(i)];
};

const swapAdjacent: Mutator = t => {
  if (t.length < 2) return t;
  const i = ri(t.length - 1);
  const c = [...t];
  [c[i], c[i + 1]] = [c[i + 1]!, c[i]!];
  return c;
};

const replaceVocab: Mutator = t => {
  if (!t.length) return t;
  const c = [...t];
  c[ri(c.length)] = pick(VOCAB);
  return c;
};

const insertVocab: Mutator = t => {
  const i = ri(t.length + 1);
  return [...t.slice(0, i), pick(VOCAB), ...t.slice(i)];
};

// The highest-yield operator: grafts a syntactically real construct from one file
// into another, so the mutant is locally well-formed and globally nonsense.
const spliceSeed: Mutator = t => {
  const donor = pick(corpus).toks;
  if (!donor.length) return t;
  const len = 1 + ri(Math.min(40, donor.length));
  const from = ri(Math.max(1, donor.length - len));
  const run = donor.slice(from, from + len);
  const at = ri(t.length + 1);
  // Half the time overwrite instead of inserting, so mutants don't only grow.
  const drop = rnd() < 0.5 ? ri(Math.min(len, Math.max(1, t.length - at)) + 1) : 0;
  return [...t.slice(0, at), ...run, ...t.slice(at + drop)];
};

const charPoke: Mutator = t => {
  if (!t.length) return t;
  const i = ri(t.length);
  const s = t[i]!;
  const at = ri(s.length + 1);
  const c = [...t];
  c[i] = s.slice(0, at) + pick(POKES) + s.slice(rnd() < 0.5 ? at : at + 1);
  return c;
};

const truncate: Mutator = t => {
  if (t.length < 2) return t;
  return t.slice(0, 1 + ri(t.length - 1));
};

// Unbounded-recursion probes. Recursive descent blows the JS stack long before it
// blows memory, and each shape enters a different recursive chain: grouping,
// generic argument lists, unary operators, and postfix chains.
//
// Capped below the Worker's stack ceiling (measured ~1500 nested parens; the main
// thread reaches ~3200). Going deeper only reproduces the harness's smaller stack,
// which the confirmation stage then discards — pure wasted reduce time. The
// parser's own MAX_EXPR_DEPTH boundary is already covered by
// tests/parserDepthGuard.test.ts; what's worth fuzzing here is a recursive chain
// that has NO guard, and those blow well before 1400.
const bomb: Mutator = t => {
  const n = 200 + ri(1200);
  const at = ri(t.length + 1);
  const shape = ri(5);
  let run: string[];
  if (shape === 0) run = [...Array(n).fill("("), "1", ...Array(n).fill(")")];
  else if (shape === 1) run = Array(n).fill("(");
  else if (shape === 2) run = [...Array(n).fill("Vec<"), "i32", ...Array(n).fill(">")];
  else if (shape === 3) run = [...Array(n).fill(pick(["!", "-", "*", "&"])), "x"];
  else run = ["x", ...Array(n).fill(".f")];
  return [...t.slice(0, at), ...run, ...t.slice(at)];
};

const MUTATORS: [Mutator, number][] = [
  [deleteTok, 20], [dupTok, 12], [swapAdjacent, 10], [replaceVocab, 20],
  [insertVocab, 15], [spliceSeed, 14], [charPoke, 8], [truncate, 3], [bomb, 2],
];
const TOTAL_W = MUTATORS.reduce((a, m) => a + m[1], 0);

function pickMutator(): Mutator {
  let r = rnd() * TOTAL_W;
  for (const [m, w] of MUTATORS) { if ((r -= w) < 0) return m; }
  return MUTATORS[0]![0];
}

function mutate(): { src: string; seedFile: string } {
  const seed = pick(corpus);
  let toks = seed.toks;
  const rounds = 1 + ri(rnd() < 0.7 ? 2 : 6);
  for (let i = 0; i < rounds; i++) toks = pickMutator()(toks);
  return { src: toks.join(""), seedFile: seed.path };
}

// ---------------------------------------------------------------- runner


class Runner {
  private worker!: Worker;
  private phase!: Int32Array;
  private inflight: { id: number; resolve: (r: Res) => void } | null = null;
  private nextId = 1;
  private ready!: Promise<void>;
  restarts = 0;

  constructor() { this.spawn(); }

  private spawn() {
    const sab = new SharedArrayBuffer(4);
    this.phase = new Int32Array(sab);
    this.worker = new Worker(new URL("./fuzz-worker.ts", import.meta.url).href);
    let markReady!: () => void;
    this.ready = new Promise<void>(res => { markReady = res; });
    this.worker.onmessage = (ev: MessageEvent) => {
      const d = ev.data;
      if (d.ready) { markReady(); return; }
      const f = this.inflight;
      if (f && f.id === d.id) { this.inflight = null; f.resolve(d as Res); }
    };
    // An uncaught error inside the worker (or an OOM abort) leaves the in-flight
    // case unanswered; surface it as a finding rather than deadlocking the run.
    this.worker.onerror = () => {
      const f = this.inflight;
      this.inflight = null;
      const phase = PHASES[Atomics.load(this.phase, 0)] ?? "unknown";
      // restart() installs a fresh `ready` promise; the replacement worker's own
      // init reply resolves it. Resolving this closure's `markReady` here would
      // only settle the promise nobody is awaiting any more.
      this.restart();
      f?.resolve({ status: "bug", kind: "worker-death", phase, message: "worker died mid-case" });
    };
    this.worker.postMessage({ init: true, sab, resolve: DO_RESOLVE, sourceDir: join(ROOT, "tests", "fixtures") });
  }

  private restart() {
    this.restarts++;
    try { this.worker.terminate(); } catch { /* already gone */ }
    this.spawn();
  }

  async run(src: string, timeoutMs: number): Promise<Res> {
    await this.ready;
    const id = this.nextId++;
    let settle!: (r: Res) => void;
    const answer = new Promise<Res>(res => { settle = res; });
    this.inflight = { id, resolve: settle };
    this.worker.postMessage({ id, src });

    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<Res>(res => {
      timer = setTimeout(() => {
        // Read the phase before terminating — a blocked worker can't report it,
        // and knowing lex-vs-parse-vs-check is most of the triage.
        const phase = PHASES[Atomics.load(this.phase, 0)] ?? "unknown";
        this.inflight = null;
        this.restart();
        res({ status: "bug", kind: "hang", phase, message: `no result in ${timeoutMs}ms` });
      }, timeoutMs);
    });

    const r = await Promise.race([answer, timeout]);
    clearTimeout(timer!);
    return r;
  }

  kill() { try { this.worker.terminate(); } catch { /* already gone */ } }
}

// ---------------------------------------------------------------- bucketing

function firstSrcFrame(stack?: string): string | null {
  if (!stack) return null;
  for (const line of stack.split("\n")) {
    const m = line.match(/([^\s()]*\/src\/[^\s()]+\.ts:\d+:\d+)/);
    if (m) return relative(ROOT, m[1]!.replace(/^file:\/\//, ""));
  }
  return null;
}

// Numbers and quoted fragments vary case to case; strip them so one bug doesn't
// spread across a hundred buckets.
const normalize = (m: string) => m.replace(/\d+/g, "#").replace(/"[^"]*"/g, '"…"').slice(0, 120);

function bucketOf(r: Res): string {
  if (r.kind === "hang" || r.kind === "worker-death") return `${r.kind}|${r.phase}`;
  // Where a stack overflow lands is an artifact of how deep the stack already was,
  // so its top frame is noise: the same bug reports a different line every run.
  // Bucketing on the frame would both split one bug across many buckets and break
  // reduction, whose interestingness test is bucket equality.
  if (/call stack size exceeded|too much recursion/i.test(r.message ?? "")) {
    return `stack-overflow|${r.phase}`;
  }
  const top = firstSrcFrame(r.stack);
  if (top) return `${r.kind}|${top}`;
  return `${r.kind}|${r.phase}|${normalize(r.message ?? "")}`;
}

// ---------------------------------------------------------------- reduction

// ddmin over the raw token stream. Interestingness is "still the same bucket",
// not merely "still fails" — without that the reducer happily converges on a
// different, shallower bug and the report points at the wrong code.
async function reduce(runner: Runner, src: string, bucket: string): Promise<string> {
  let probes = 0;
  const interesting = async (cand: string): Promise<boolean> => {
    if (probes++ >= REDUCE_PROBES) return false;
    const r = await runner.run(cand, REDUCE_TIMEOUT_MS);
    return r.status === "bug" && bucketOf(r) === bucket;
  };

  let toks = texts(src);
  let n = 2;
  while (toks.length >= 2 && probes < REDUCE_PROBES) {
    const chunk = Math.ceil(toks.length / n);
    let shrank = false;
    for (let i = 0; i < toks.length; i += chunk) {
      const cand = [...toks.slice(0, i), ...toks.slice(i + chunk)];
      if (!cand.length) continue;
      if (await interesting(cand.join(""))) {
        toks = cand;
        n = Math.max(n - 1, 2);
        shrank = true;
        break;
      }
    }
    if (!shrank) {
      if (n >= toks.length) break;
      n = Math.min(n * 2, toks.length);
    }
  }
  return toks.join("");
}

// ---------------------------------------------------------------- confirmation

// Cases run in a Worker, whose stack is smaller than the main thread's. The
// parser's expression-depth guard is calibrated to main-thread headroom, so a
// deeply nested input that `milo build` rejects cleanly can still overflow the
// Worker. Re-running each finding in a normal process separates real compiler
// bugs from that artifact. One subprocess per bucket, not per case.
async function confirmOnMainThread(src: string): Promise<{ reproduced: boolean; res?: Res }> {
  const tmp = join(OUT_DIR, ".confirm.milo");
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(tmp, src);
  const args = [join(ROOT, "scripts", "fuzz-confirm.ts"), tmp];
  if (DO_RESOLVE) args.push("--resolve", "--source-dir", join(ROOT, "tests", "fixtures"));
  const proc = Bun.spawn(["bun", ...args], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });

  // A hang won't exit on its own, and a case that hangs in a real process is
  // itself a confirmed finding.
  const timer = setTimeout(() => proc.kill(), TIMEOUT_MS * 2);
  const out = await new Response(proc.stdout).text();
  const code = await proc.exited;
  clearTimeout(timer);

  if (code === 3) {
    try { return { reproduced: true, res: JSON.parse(out.trim()) as Res }; } catch { return { reproduced: true } }
  }
  // Killed by the timeout (or died outright): a hang or hard crash in a normal
  // process, which is exactly what this is looking for.
  if (code !== 0 && code !== 2) return { reproduced: true, res: { status: "bug", kind: "hang-or-abort", message: `confirm exited ${code}` } };
  return { reproduced: false };
}

// ---------------------------------------------------------------- main

interface Finding {
  bucket: string;
  res: Res;
  src: string;
  reduced: string;
  seedFile: string;
  caseNo: number;
  hits: number;
  confirmed?: boolean;
}

const findings = new Map<string, Finding>();
const runner = new Runner();
const start = Date.now();
const deadline = SECS > 0 ? start + SECS * 1000 : Infinity;
let executed = 0;
let skipped = 0;

for (let i = 0; i < (SECS > 0 ? Infinity : CASES); i++) {
  if (Date.now() > deadline) break;

  const { src, seedFile } = mutate();
  if (src.length > MAX_SRC) { skipped++; continue; }

  const res = await runner.run(src, TIMEOUT_MS);
  executed++;

  if (res.status === "bug") {
    const bucket = bucketOf(res);
    const known = findings.get(bucket);
    if (known) {
      known.hits++;
      // Keep the smallest witness — it reduces faster and reads better.
      if (src.length < known.src.length) { known.src = src; known.seedFile = seedFile; }
    } else {
      findings.set(bucket, { bucket, res, src, reduced: src, seedFile, caseNo: i, hits: 1 });
      console.log(`\n[!] ${bucket}\n    ${res.message ?? ""}\n    seed file: ${seedFile}  case #${i}`);
    }
  }

  if (executed % 500 === 0) {
    const rate = (executed / ((Date.now() - start) / 1000)).toFixed(0);
    process.stdout.write(`\r${executed} cases  ${rate}/s  ${findings.size} buckets  ${runner.restarts} restarts   `);
  }
}
process.stdout.write("\n");

if (findings.size && !NO_REDUCE) {
  console.log(`reducing ${findings.size} finding(s)…`);
  for (const f of findings.values()) {
    f.reduced = await reduce(runner, f.src, f.bucket);
    console.log(`  ${f.bucket}: ${f.src.length} → ${f.reduced.length} bytes`);
  }
}

runner.kill();

if (findings.size) {
  console.log(`confirming ${findings.size} finding(s) on the main thread…`);
  for (const f of findings.values()) {
    const c = await confirmOnMainThread(f.reduced);
    f.confirmed = c.reproduced;
    if (c.res) f.res = { ...f.res, ...c.res };
    console.log(`  ${f.bucket}: ${c.reproduced ? "CONFIRMED" : "worker-only (not a compiler bug)"}`);
  }
}

const secs = ((Date.now() - start) / 1000).toFixed(1);
console.log(`\n${executed} cases in ${secs}s (seed ${SEED}${DO_RESOLVE ? ", +resolve" : ""}${skipped ? `, ${skipped} oversized skipped` : ""})`);

const confirmed = [...findings.values()].filter(f => f.confirmed);
const workerOnly = findings.size - confirmed.length;

if (!confirmed.length) {
  console.log(workerOnly ? `no findings (${workerOnly} worker-only artifact(s) discarded)` : "no findings");
  rmSync(OUT_DIR, { recursive: true, force: true });
  process.exit(0);
}

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

let idx = 0;
for (const f of confirmed) {
  const dir = join(OUT_DIR, `${String(++idx).padStart(2, "0")}-${f.bucket.replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 60)}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "case.milo"), f.reduced);
  if (f.reduced !== f.src) writeFileSync(join(dir, "orig.milo"), f.src);
  writeFileSync(join(dir, "report.txt"),
    [
      `bucket:   ${f.bucket}`,
      `kind:     ${f.res.kind}`,
      `phase:    ${f.res.phase}`,
      `hits:     ${f.hits}`,
      `seed:     --seed ${SEED} (case #${f.caseNo}, from ${f.seedFile})`,
      `message:  ${f.res.message ?? ""}`,
      "",
      "repro:",
      `  bun run src/main.ts build ${relative(ROOT, join(dir, "case.milo"))} -o /tmp/fuzz-out`,
      "",
      f.res.stack ?? "",
    ].join("\n"));
}

console.log(`\n${confirmed.length} confirmed bucket(s) written to ${relative(ROOT, OUT_DIR)}/${workerOnly ? `  (${workerOnly} worker-only artifact(s) discarded)` : ""}`);
for (const f of confirmed) console.log(`  ${f.hits.toString().padStart(4)}x  ${f.bucket}`);
process.exit(1);
