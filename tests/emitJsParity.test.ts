// Whole-corpus conformance lock for the JS backend.
//
// Every fixture is compiled both ways and the two stdouts are compared. The JS
// backend is a *supported-subset* backend, not a general one — no FFI, no threads,
// no Drop glue, i64 only up to 2^53 — so a fixture is allowed to fail, but only if
// it is named in the baseline below. The list may shrink, never grow: anything that
// agrees today has to keep agreeing.
//
// Refresh the baseline after a deliberate change with:
//   MILO_JS_PARITY_UPDATE=1 bun test tests/emitJsParity.test.ts
import { test, expect } from "bun:test";
import { readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = join(import.meta.dir, "..");
const MILO = join(REPO, "src", "main.ts");
const FIXTURES = join(REPO, "tests", "fixtures");
const BASELINE = join(import.meta.dir, "emitJsParity.baseline.json");

type Status = "agree" | "mismatch" | "crash" | "noEmit";

// `noEmit` and `crash` are the same outcome — the fixture does not run under the JS
// backend — differing only in whether the backend refused up front or the emitted
// file failed to load. Which one you get is platform-dependent: std has per-OS arms,
// and stdRandom hits `addrOf` (refused at emit) on Linux but not on darwin, so one
// shared baseline cannot name both. They collapse to one bucket. `mismatch` stays
// distinct because running and producing the WRONG answer is the dangerous outcome,
// and `agree` obviously so.
function bucket(s: Status): "agree" | "mismatch" | "unsupported" {
  return s === "agree" || s === "mismatch" ? s : "unsupported";
}

// Fixtures that need argv, a network, or otherwise can't be driven headlessly. They
// tell us nothing about the backend either way.
const SKIP = new Set<string>([]);

function classify(file: string, dir: string): Status {
  const src = join(FIXTURES, file);
  const jsPath = join(dir, "p.js");
  const emit = Bun.spawnSync(["bun", "run", MILO, "emit-js", src, "-o", jsPath], { cwd: REPO });
  if (emit.exitCode !== 0) return "noEmit";
  const nat = Bun.spawnSync(["bun", "run", MILO, "run", src], { cwd: REPO });
  // A fixture the native build itself won't run (needs args, traps by design) is not
  // a parity signal — the comparison would be between two kinds of failure.
  if (nat.exitCode !== 0) return "agree";
  const js = Bun.spawnSync(["bun", jsPath], { cwd: REPO, timeout: 20000 });
  if (js.exitCode !== 0) return "crash";
  return nat.stdout.toString().trim() === js.stdout.toString().trim() ? "agree" : "mismatch";
}

// ~3 minutes: it compiles the whole corpus twice. Always on in CI, opt-in locally
// (MILO_JS_PARITY=1) so it doesn't double the cost of every `bun test`.
const enabled = !!process.env.CI || !!process.env.MILO_JS_PARITY || !!process.env.MILO_JS_PARITY_UPDATE;

// A silent skip reads exactly like a pass. This gate is the only thing that knows a new
// fixture cannot emit JS, and skipping quietly let three separate changes reach CI red
// while every local gate reported green: `bun test tests/emitJsParity.test.ts` printed
// "0 pass, 1 skip" and exited 0. Say so, and say what to type. Any fixture reaching
// `addrOf` (anything using std/shard or std/seal) must be named in the baseline, and
// nothing but this gate will tell you.
if (!enabled) {
  console.log(
    "\n  SKIPPED: emit-js whole-corpus parity (~4 min).\n" +
    "  Run it:           MILO_JS_PARITY=1 bun test tests/emitJsParity.test.ts\n" +
    "  Refresh baseline: MILO_JS_PARITY_UPDATE=1 bun test tests/emitJsParity.test.ts\n",
  );
}

// Cheap and always on. The comparison below can be skipped; a baseline naming a fixture
// that no longer exists is drift, and catching it costs milliseconds.
test("every js-parity baseline entry names a fixture that exists", () => {
  const present = new Set(readdirSync(FIXTURES).filter(f => f.endsWith(".milo")));
  const stale = Object.keys(JSON.parse(readFileSync(BASELINE, "utf8"))).filter(f => !present.has(f));
  expect(stale).toEqual([]);
});

test.skipIf(!enabled)("emit-js: whole-corpus parity against native", () => {
  const files = readdirSync(FIXTURES).filter(f => f.endsWith(".milo") && !SKIP.has(f)).sort();
  const dir = mkdtempSync(join(tmpdir(), "milo-parity-"));
  const now: Record<string, Status> = {};
  try {
    for (const f of files) {
      const s = classify(f, dir);
      if (s !== "agree") now[f] = s;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  if (process.env.MILO_JS_PARITY_UPDATE) {
    writeFileSync(BASELINE, JSON.stringify(now, Object.keys(now).sort(), 2) + "\n");
    return;
  }

  const base: Record<string, Status> = JSON.parse(readFileSync(BASELINE, "utf8"));
  // Regressions are what this test exists for: a fixture that used to agree and now
  // doesn't, or one that degraded (mismatch -> crash).
  const regressed = Object.keys(now).filter(f => !base[f] || bucket(base[f]) !== bucket(now[f]));
  expect({ regressed, detail: regressed.map(f => `${f}: ${base[f] ?? "agree"} -> ${now[f]}`) })
    .toEqual({ regressed: [], detail: [] });

  // Fixed fixtures must be removed from the baseline, so the list can only shrink.
  const stale = Object.keys(base).filter(f => !now[f]);
  expect({ fixedButStillBaselined: stale }).toEqual({ fixedButStillBaselined: [] });
}, 900_000);
