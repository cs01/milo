// Differential falsifier for `milo prove`. Hunts for FALSE PROOFS — the only verdict that
// can be wrong in a dangerous direction.
//
// The asymmetry is the whole point. `unknown` costs you a proof you wanted. `failed` on a
// true contract costs you a spurious alarm. Both are recoverable. A `proven` on a contract
// the program actually violates is unrecoverable: it is the prover telling you a guarantee
// holds when it does not, and everything downstream trusts it.
//
// The oracle is the language itself: `--debug` compiles every contract into a runtime
// assert (language-reference.md:276), so the same clause the solver reasoned about is
// checked against real execution. The contradiction this hunts for is exactly:
//
//     milo prove  =>  proven
//     milo run --debug  =>  "runtime error: ensures clause violated"
//
// Generation is biased toward the constructs where the symbolic walker has to model
// something it cannot see directly — mutation through `&mut`, method receivers, struct
// fields, loop havoc, and calls whose result is only described by an `ensures`. Those are
// where the model can drift from the machine, and where the one confirmed false proof in
// this prover's history (a `&mut` parameter mutating a caller's local without an
// assignment anywhere in the caller) actually lived.
//
// Usage: bun scripts/prove-soundness-fuzz.ts [--cases N] [--seed N] [--keep]
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { execSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");
const argOf = (flag: string, dflt: number) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? parseInt(process.argv[i + 1]!, 10) : dflt;
};
const CASES = argOf("--cases", 60);
const SEED = argOf("--seed", 1);
const KEEP = process.argv.includes("--keep");

// Seeded PRNG so a failure is reproducible from the seed printed in the report.
let state = SEED >>> 0 || 1;
function rnd(): number {
  state ^= state << 13; state >>>= 0;
  state ^= state >> 17;
  state ^= state << 5; state >>>= 0;
  return state / 0x100000000;
}
const pick = <T>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)]!;
const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));

// One generated program: a `probe` function whose body exercises a construct, plus the
// inputs main will drive it with. `evalProbe` is the same computation in TypeScript — it
// predicts the result so the generated `ensures` can be made deliberately borderline.
interface Shape {
  name: string;
  helpers: string;
  body: (a: number, b: number) => { code: string; value: (a: number, b: number) => number };
}

const SHAPES: Shape[] = [
  {
    // The confirmed false proof: mutation with no assignment in the caller.
    name: "mut-ref-param",
    helpers: "fn addTo(n: &mut i64, k: i64): void {\n    n = n + k\n}\n",
    body: (_a, _b) => {
      const k = int(1, 20);
      return {
        code: `    var x: i64 = a\n    addTo(x, ${k})\n    return x\n`,
        value: (a) => a + k,
      };
    },
  },
  {
    // Same hazard through a struct field written by a callee.
    name: "mut-ref-struct",
    helpers: "struct Box {\n    v: i64,\n}\n\nfn setBox(b: &mut Box, k: i64): void {\n    b.v = k\n}\n",
    body: () => {
      const k = int(1, 20);
      return {
        code: `    var box = Box { v: a }\n    setBox(box, ${k})\n    return box.v\n`,
        value: () => k,
      };
    },
  },
  {
    // Loop havoc: the walker must not carry pre-loop values past the loop.
    name: "loop-accumulate",
    body: (_a, _b) => {
      const n = int(1, 5);
      return {
        code: `    var acc: i64 = a\n    var i: i64 = 0\n    while i < ${n} {\n        acc = acc + b\n        i = i + 1\n    }\n    return acc\n`,
        value: (a, b) => a + n * b,
      };
    },
    helpers: "",
  },
  {
    // A callee whose result is described only by an `ensures` — the modular call model.
    name: "modeled-call",
    helpers: "fn clampLow(n: i64): i64\nensures result >= 0\n{\n    if n < 0 {\n        return 0\n    }\n    return n\n}\n",
    body: () => ({
      code: `    let c = clampLow(a)\n    return c + b\n`,
      value: (a, b) => Math.max(a, 0) + b,
    }),
  },
  {
    // Division and remainder over NEGATIVE operands, where SMT-LIB's Euclidean `div`/`mod`
    // disagree with Milo's truncation. This shape exists because the original 5 shapes
    // could not express it, and a false proof lived here the whole time they were passing.
    name: "trunc-div",
    helpers: "",
    body: () => {
      const d = int(2, 9);
      const op = pick(["/", "%"]);
      // The offset drags the dividend negative for small `a`, which is the only region
      // where Euclidean and truncating semantics differ. It has to appear in BOTH the
      // emitted code and the model — a model that disagrees with the program fits clauses
      // to the wrong values and turns the whole harness into noise.
      const off = int(200, 400);
      return {
        code: `    let n = a - ${off}\n    return n ${op} ${d}\n`,
        // JS `/` with Math.trunc and JS `%` both truncate toward zero, matching Milo.
        value: (a) => (op === "/" ? Math.trunc((a - off) / d) : (a - off) % d),
      };
    },
  },
  {
    // Branching, where each path condition has to reach the postcondition intact.
    name: "branch",
    helpers: "",
    body: () => {
      const t = int(-5, 5);
      return {
        code: `    if a > ${t} {\n        return a - b\n    }\n    return a + b\n`,
        value: (a, b) => (a > t ? a - b : a + b),
      };
    },
  },
];

interface Case { src: string; clause: string; shape: string; control: boolean }

// The clause is fitted to a NARROW sample and then executed against a WIDE one. That gap
// is the entire experiment: a clause true only on the sample is false in general, so a
// prover that reports `proven` for it is provably wrong, and the wide run is what exhibits
// the counterexample. Fitting and running on the same inputs would make every generated
// contract vacuously true at runtime — a harness that cannot fail, which is worse than no
// harness because it reports reassuring numbers.
function generate(): Case {
  const shape = pick(SHAPES);
  const built = shape.body(0, 0);

  const sample: [number, number][] = [];
  for (let i = 0; i < 2; i++) sample.push([int(-8, 8), int(-8, 8)]);
  const wide: [number, number][] = [...sample];
  for (let i = 0; i < 24; i++) wide.push([int(-500, 500), int(-500, 500)]);

  const sampled = sample.map(([a, b]) => built.value(a, b));
  const lo = Math.min(...sampled), hi = Math.max(...sampled);
  const clause = pick([
    `result >= ${lo}`,
    `result <= ${hi}`,
    `result == ${sampled[0]}`,
    `result >= ${lo} && result <= ${hi}`,
  ]);

  const calls = wide.map(([a, b]) => `    print(probe(${a}, ${b}))`).join("\n");
  const src =
    `${shape.helpers}\nfn probe(a: i64, b: i64): i64\nensures ${clause}\n{\n${built.code}}\n\nfn main() {\n${calls}\n}\n`;
  return { src, clause, shape: shape.name, control: false };
}

// A contract that is universally true and within the solver's reach. If these stop coming
// back `proven`, the harness has gone vacuous — it is no longer testing the dangerous
// verdict at all, and a run of "no false proofs" would mean nothing.
function generateControl(): Case {
  const k = int(1, 50);
  const src =
    `fn probe(a: i64, b: i64): i64\nensures result >= 0\n{\n    if a < 0 {\n        return ${k}\n    }\n    return a + ${k}\n}\n\nfn main() {\n    print(probe(-3, 1))\n    print(probe(7, 2))\n}\n`;
  return { src, clause: "result >= 0", shape: "control", control: true };
}

const dir = mkdtempSync(join(tmpdir(), "milo-soundfuzz-"));
let proven = 0, refuted = 0, unknown = 0, skipped = 0;
const falseProofs: { file: string; shape: string; clause: string; runtime: string }[] = [];

let controlsProven = 0, controlsTotal = 0;
for (let i = 0; i < CASES; i++) {
  const c = i % 5 === 0 ? generateControl() : generate();
  if (c.control) controlsTotal++;
  const file = join(dir, `case${i}.milo`);
  writeFileSync(file, c.src);

  let proveOut = "";
  try {
    proveOut = execSync(`bun ${join(ROOT, "src", "main.ts")} prove ${file} --solver=z3`, {
      encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 60000,
    });
  } catch (e: any) {
    proveOut = (e.stdout ?? "") + (e.stderr ?? "");
  }
  const m = proveOut.replace(/\x1b\[[0-9;]*m/g, "").match(/proven:\s*(\d+)\s+failed:\s*(\d+)\s+unknown:\s*(\d+)\s+errors:\s*(\d+)/);
  if (!m) { skipped++; continue; }
  const [, p, f, u] = m.map(Number) as [number, number, number, number];
  if (f > 0) { refuted++; continue; }
  if (p === 0) { unknown += u > 0 ? 1 : 0; skipped += u > 0 ? 0 : 1; continue; }
  proven++;
  if (c.control) controlsProven++;

  // Proven. Now make the machine try to break it.
  let runOut = "";
  try {
    runOut = execSync(`bun ${join(ROOT, "src", "main.ts")} run ${file} --debug`, {
      encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 60000,
    });
  } catch (e: any) {
    runOut = (e.stdout ?? "") + (e.stderr ?? "");
  }
  if (/clause violated/.test(runOut)) {
    const kept = join(ROOT, `false-proof-${i}.milo`);
    writeFileSync(kept, c.src);
    falseProofs.push({
      file: kept, shape: c.shape, clause: c.clause,
      runtime: runOut.split("\n").find(l => /clause violated/.test(l))!.trim(),
    });
  }
}

console.log(`seed ${SEED}, ${CASES} cases: ${proven} proven, ${refuted} refuted, ${unknown} unknown, ${skipped} skipped`);
console.log(`controls proven: ${controlsProven}/${controlsTotal}`);
if (controlsProven === 0) {
  console.log("VACUOUS RUN: no control contract was proven, so nothing exercised the `proven` path.");
  process.exit(2);
}
if (falseProofs.length === 0) {
  console.log("no false proofs: every `proven` contract survived execution");
} else {
  console.log(`\nFALSE PROOFS (${falseProofs.length}) — prover said proven, the program violated it:`);
  for (const fp of falseProofs) {
    console.log(`  [${fp.shape}] ensures ${fp.clause}`);
    console.log(`    ${fp.runtime}`);
    console.log(`    repro: ${fp.file}`);
  }
}
if (!KEEP) rmSync(dir, { recursive: true, force: true });
process.exit(falseProofs.length === 0 ? 0 : 1);
