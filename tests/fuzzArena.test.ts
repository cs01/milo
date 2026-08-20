// A short, fixed-seed run of the arena falsifier as a regression gate.
//
// The generational arena is the one place in safe Milo where use-after-free is caught at
// RUNTIME rather than by the checker, and everything holding that up is bookkeeping the
// type system does not check: a LIFO free list, a sign convention on the generation
// counter, an arena id restamped by `clear`. The ten fixtures in tests/fixtures pin the
// cases someone thought of; this covers the sequences nobody did.
//
// The oracle is a model, not "did it crash" — a stale handle answering as LIVE prints the
// wrong value and exits 0, so a crash oracle cannot see the bug that matters here.
//
// Deliberately small. The real hunt is `bun scripts/fuzz-arena.ts --cases 400 --ops 60`
// with varied seeds, which belongs in a manual run.
import { test, expect } from "bun:test";
import { execFileSync } from "child_process";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");

test("generational handles survive random alloc/free/clear sequences", () => {
  let out = "";
  let code = 0;
  try {
    out = execFileSync("bun", [
      join(ROOT, "scripts", "fuzz-arena.ts"),
      "--cases", "25",
      "--ops", "40",
      "--seed", "7",
    ], { cwd: ROOT, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
  } catch (e: any) {
    out = (e.stdout ?? "") + (e.stderr ?? "");
    code = e.status ?? 1;
  }
  // The script exits 2 rather than 0 when nothing ran, so a generator that stops
  // producing programs fails here instead of passing as "no mismatches found".
  expect(out, `arena falsifier reported no cases:\n${out}`).toMatch(/\b25 ran\b/);
  expect(code, `arena falsifier found a mismatch:\n${out}`).toBe(0);
}, 300_000);
